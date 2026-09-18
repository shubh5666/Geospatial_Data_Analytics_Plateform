"""Real PostGIS integration checks; each test rolls back its own temporary schema.

Run app.init_db first, then: python -m unittest discover -s tests -v
"""

import json
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

import psycopg
from app.database import connect_database
from app.init_db import MIGRATIONS_DIR, apply_migrations
from psycopg import sql

VALID_POLYGON = "POLYGON((77 28, 77.01 28, 77.01 28.01, 77 28.01, 77 28))"


class DatabaseIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.db = connect_database()
        self.addCleanup(self.db.close)
        self.addCleanup(self.db.rollback)
        installed = self.db.execute(
            "SELECT 1 FROM pg_extension WHERE extname = 'postgis'"
        ).fetchone()
        if not installed:
            self.fail("Run python -m app.init_db before database tests.")
        schema = "test_" + uuid4().hex
        self.db.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        self.db.execute(
            sql.SQL("SET LOCAL search_path TO {}, public").format(
                sql.Identifier(schema)
            )
        )
        apply_migrations(self.db)
        self.user_id = self.db.execute(
            "INSERT INTO users (full_name, email, password_hash) "
            "VALUES (%s, %s, %s) RETURNING id",
            ("Test User", "tester@example.com", "test-placeholder-hash"),
        ).fetchone()["id"]
        self.project_id = self.db.execute(
            "INSERT INTO projects (owner_id, name) VALUES (%s, %s) RETURNING id",
            (self.user_id, "Test project"),
        ).fetchone()["id"]
        self.site_id = self.insert_site(VALID_POLYGON)

    def insert_site(self, wkt, srid=4326):
        return self.db.execute(
            "INSERT INTO sites (project_id, name, boundary) "
            "VALUES (%s, %s, ST_GeomFromText(%s, %s)) RETURNING id",
            (self.project_id, "Test site", wkt, srid),
        ).fetchone()["id"]

    def insert_measurement(self, carbon="12.5", biodiversity="65.0"):
        self.db.execute(
            "INSERT INTO site_measurements "
            "(site_id, recorded_on, carbon_tonnes_co2e, biodiversity_score) "
            "VALUES (%s, '2026-01-01', %s, %s)",
            (self.site_id, carbon, biodiversity),
        )

    def test_polygon_geojson_and_project_relationship_round_trip(self):
        self.insert_measurement()
        row = self.db.execute(
            "SELECT p.owner_id, ST_AsGeoJSON(s.boundary) AS boundary, "
            "ST_SRID(s.boundary) AS srid, m.is_mock, m.recorded_on "
            "FROM projects p JOIN sites s ON s.project_id = p.id "
            "JOIN site_measurements m ON m.site_id = s.id WHERE s.id = %s",
            (self.site_id,),
        ).fetchone()
        geometry = json.loads(row["boundary"])
        self.assertEqual(row["owner_id"], self.user_id)
        self.assertEqual(row["srid"], 4326)
        self.assertEqual(geometry["type"], "Polygon")
        self.assertEqual(geometry["coordinates"][0][0], [77, 28])
        self.assertTrue(row["is_mock"])
        self.assertEqual(str(row["recorded_on"]), "2026-01-01")

    def test_invalid_empty_and_out_of_range_polygons_are_rejected(self):
        polygons = (
            "POLYGON((0 0, 1 1, 0 1, 1 0, 0 0))",
            "POLYGON EMPTY",
            "POLYGON((181 1, 182 1, 182 2, 181 2, 181 1))",
            "POLYGON((1 91, 2 91, 2 92, 1 92, 1 91))",
        )
        for polygon in polygons:
            with self.subTest(polygon=polygon):
                with self.assertRaises(psycopg.errors.CheckViolation):
                    with self.db.transaction():
                        self.insert_site(polygon)

    def test_wrong_geometry_type_and_srid_are_rejected(self):
        for geometry, srid in (("POINT(77 28)", 4326), (VALID_POLYGON, 3857)):
            with self.subTest(geometry=geometry, srid=srid):
                with self.assertRaises(psycopg.DataError):
                    with self.db.transaction():
                        self.insert_site(geometry, srid)

    def test_email_uniqueness_is_case_insensitive(self):
        with self.assertRaises(psycopg.errors.UniqueViolation):
            with self.db.transaction():
                self.db.execute(
                    "INSERT INTO users (full_name, email, password_hash) "
                    "VALUES ('Duplicate', 'TESTER@example.com', 'test-hash')"
                )

    def test_site_requires_an_existing_project(self):
        with self.assertRaises(psycopg.errors.ForeignKeyViolation):
            with self.db.transaction():
                self.db.execute(
                    "INSERT INTO sites (project_id, name, boundary) "
                    "VALUES (%s, 'Orphan', ST_GeomFromText(%s, 4326))",
                    (uuid4(), VALID_POLYGON),
                )

    def test_measurement_ranges_and_nonfinite_values_are_rejected(self):
        for carbon, biodiversity in (
            ("-1", "50"),
            ("NaN", "50"),
            ("Infinity", "50"),
            ("1", "-1"),
            ("1", "100.01"),
            ("1", "NaN"),
        ):
            with self.subTest(carbon=carbon, biodiversity=biodiversity):
                with self.assertRaises((psycopg.IntegrityError, psycopg.DataError)):
                    with self.db.transaction():
                        self.insert_measurement(carbon, biodiversity)

    def test_only_one_measurement_per_site_and_date(self):
        self.insert_measurement()
        with self.assertRaises(psycopg.errors.UniqueViolation):
            with self.db.transaction():
                self.insert_measurement()

    def test_project_deletion_removes_its_sites_and_measurements(self):
        self.insert_measurement()
        self.db.execute("DELETE FROM projects WHERE id = %s", (self.project_id,))
        self.assertEqual(
            self.db.execute("SELECT count(*) AS n FROM sites").fetchone()["n"], 0
        )
        self.assertEqual(
            self.db.execute("SELECT count(*) AS n FROM site_measurements").fetchone()[
                "n"
            ],
            0,
        )
        self.assertEqual(
            self.db.execute("SELECT count(*) AS n FROM users").fetchone()["n"], 1
        )

    def test_reapplying_migrations_keeps_existing_data(self):
        self.assertEqual(apply_migrations(self.db), [])
        self.assertIsNotNone(
            self.db.execute(
                "SELECT id FROM sites WHERE id = %s", (self.site_id,)
            ).fetchone()
        )

    def test_failed_migration_rolls_back_its_schema_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            migrations = Path(directory)
            for migration in MIGRATIONS_DIR.glob("*.sql"):
                (migrations / migration.name).write_text(
                    migration.read_text(encoding="utf-8"), encoding="utf-8"
                )
            (migrations / "999_broken.sql").write_text(
                "CREATE TABLE should_roll_back (id INTEGER); "
                "SELECT * FROM table_that_does_not_exist;",
                encoding="utf-8",
            )
            with self.assertRaises(psycopg.errors.UndefinedTable):
                apply_migrations(self.db, migrations)
        self.assertIsNone(
            self.db.execute(
                "SELECT to_regclass('should_roll_back') AS name"
            ).fetchone()["name"]
        )
        self.assertEqual(
            self.db.execute("SELECT count(*) AS n FROM schema_migrations").fetchone()[
                "n"
            ],
            len(list(MIGRATIONS_DIR.glob("*.sql"))),
        )

    def test_editing_an_applied_migration_is_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            migrations = Path(directory)
            for migration in MIGRATIONS_DIR.glob("*.sql"):
                (migrations / migration.name).write_text(
                    migration.read_text(encoding="utf-8"), encoding="utf-8"
                )
            initial = MIGRATIONS_DIR / "001_initial_schema.sql"
            (migrations / initial.name).write_text(
                initial.read_text(encoding="utf-8") + "\n-- changed\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(RuntimeError, "was changed"):
                apply_migrations(self.db, migrations)


if __name__ == "__main__":
    unittest.main()
