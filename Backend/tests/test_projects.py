"""Real PostGIS API checks for user isolation, persistence, and polygon validation."""

import copy
import json
import os
import unittest
from unittest.mock import patch
from uuid import UUID, uuid4

from app.auth import create_access_token
from app.config import AuthSettings
from app.database import connect_database, get_db
from app.init_db import apply_migrations
from app.main import app
from fastapi.testclient import TestClient
from psycopg import sql

TEST_SECRET = "projects-test-only-signing-key-" + "a" * 48
POLYGON = {
    "type": "Polygon",
    "coordinates": [[[77, 28], [77.01, 28], [77.01, 28.01], [77, 28.01], [77, 28]]],
}


class ProjectSiteIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.db = connect_database()
        self.addCleanup(self.db.close)
        self.addCleanup(self.db.rollback)
        schema = "test_projects_" + uuid4().hex
        self.db.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        self.db.execute(
            sql.SQL("SET LOCAL search_path TO {}, public").format(
                sql.Identifier(schema)
            )
        )
        apply_migrations(self.db)
        self.users = []
        self.headers = []
        for name in ("Alice", "Bob"):
            user_id = self.db.execute(
                "INSERT INTO users (full_name, email, password_hash) VALUES (%s, %s, %s) "
                "RETURNING id",
                (name, name.lower() + "@example.com", "unused-test-hash"),
            ).fetchone()["id"]
            self.users.append(user_id)
            token = create_access_token(user_id, AuthSettings(jwt_secret=TEST_SECRET))
            self.headers.append({"Authorization": "Bearer " + token})

        def override_db():
            with self.db.transaction():
                yield self.db

        previous_overrides = app.dependency_overrides.copy()
        app.dependency_overrides[get_db] = override_db
        self.addCleanup(setattr, app, "dependency_overrides", previous_overrides)
        environment = patch.dict(
            os.environ,
            {
                "JWT_SECRET_KEY": TEST_SECRET,
                "JWT_ACCESS_TOKEN_MINUTES": "30",
            },
        )
        environment.start()
        self.addCleanup(environment.stop)
        self.client = self.enterContext(TestClient(app))

    def request(self, path, *, method="GET", body=None, user=0):
        return self.client.request(method, path, json=body, headers=self.headers[user])

    def project(self, name="Test project", user=0):
        response = self.request(
            "/projects", method="POST", body={"name": name}, user=user
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def site(self, project, boundary=None, name="Test site", user=0):
        response = self.request(
            f"/projects/{project['id']}/sites",
            method="POST",
            user=user,
            body={
                "name": name,
                "boundary": boundary if boundary is not None else POLYGON,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_project_create_list_and_detail_round_trip(self):
        self.assertEqual(self.request("/projects").json(), [])
        response = self.request(
            "/projects",
            method="POST",
            body={
                "name": "  Farmer's forest  ",
                "description": "Carbon and biodiversity project",
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        project = response.json()
        self.assertEqual(project["name"], "Farmer's forest")
        self.assertEqual(project["owner_id"], str(self.users[0]))
        self.assertEqual(project["description"], "Carbon and biodiversity project")
        self.assertEqual(self.request(f"/projects/{project['id']}").json(), project)
        self.assertEqual(self.request("/projects").json(), [project])
        stored = self.db.execute(
            "SELECT owner_id, name FROM projects WHERE id = %s",
            (UUID(project["id"]),),
        ).fetchone()
        self.assertEqual(stored["owner_id"], self.users[0])
        self.assertEqual(stored["name"], project["name"])
        self.assertEqual(self.project()["description"], "")

    def test_project_listing_filters_by_owner_and_paginates(self):
        own_projects = [self.project(name=f"Own {index}") for index in range(3)]
        foreign = self.project(user=1)
        all_own = self.request("/projects").json()
        self.assertEqual({p["id"] for p in all_own}, {p["id"] for p in own_projects})
        self.assertEqual(
            self.request("/projects?limit=1&offset=1").json(), all_own[1:2]
        )
        self.assertEqual(self.request("/projects?offset=3").json(), [])
        self.assertEqual(self.request("/projects", user=1).json(), [foreign])
        self.assertEqual(
            self.request(f"/projects?owner_id={self.users[1]}").json(),
            all_own,
        )

    def test_foreign_and_missing_projects_cannot_be_read_or_receive_sites(self):
        foreign = self.project(user=1)
        for project_id in (foreign["id"], str(uuid4())):
            with self.subTest(project_id=project_id):
                for path in (
                    f"/projects/{project_id}",
                    f"/projects/{project_id}/sites",
                ):
                    response = self.request(path)
                    self.assertEqual(response.status_code, 404, response.text)
                    self.assertEqual(response.json(), {"detail": "Project not found"})
                response = self.request(
                    f"/projects/{project_id}/sites",
                    method="POST",
                    body={"name": "Unauthorized site", "boundary": POLYGON},
                )
                self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(
            self.db.execute("SELECT count(*) AS n FROM sites").fetchone()["n"], 0
        )

    def test_multiple_sites_round_trip_and_stay_in_their_project(self):
        first_project, second_project = self.project(), self.project()
        path = f"/projects/{first_project['id']}/sites"
        self.assertEqual(self.request(path).json(), [])
        first_site = self.site(first_project, name="  Northern site  ")
        second_site = self.site(first_project, name="Southern site")
        separate_site = self.site(second_project)
        sites = self.request(path).json()
        self.assertEqual(
            {s["id"] for s in sites}, {first_site["id"], second_site["id"]}
        )
        self.assertEqual(first_site["name"], "Northern site")
        self.assertEqual(first_site["boundary"], POLYGON)
        self.assertEqual(first_site["project_id"], first_project["id"])
        self.assertEqual(self.request(f"/sites/{first_site['id']}").json(), first_site)
        self.assertEqual(self.request(path + "?limit=1&offset=1").json(), sites[1:2])
        self.assertEqual(self.request(path + "?offset=2").json(), [])
        self.assertEqual(
            self.request(f"/projects/{second_project['id']}/sites").json(),
            [separate_site],
        )

    def test_foreign_and_missing_sites_have_identical_not_found_responses(self):
        foreign_project = self.project(user=1)
        foreign_site = self.site(foreign_project, user=1)
        for site_id in (foreign_site["id"], str(uuid4())):
            response = self.request(f"/sites/{site_id}")
            self.assertEqual(response.status_code, 404, response.text)
            self.assertEqual(response.json(), {"detail": "Site not found"})
        self.assertEqual(
            self.request(f"/sites/{foreign_site['id']}", user=1).json(),
            foreign_site,
        )

    def test_all_project_and_site_routes_require_authentication(self):
        project = self.project()
        site = self.site(project)
        requests = (
            ("POST", "/projects", {"name": "Project"}),
            ("GET", "/projects", None),
            ("GET", f"/projects/{project['id']}", None),
            (
                "POST",
                f"/projects/{project['id']}/sites",
                {"name": "Site", "boundary": POLYGON},
            ),
            ("GET", f"/projects/{project['id']}/sites", None),
            ("GET", f"/sites/{site['id']}", None),
        )
        for method, path, body in requests:
            with self.subTest(method=method, path=path):
                response = self.client.request(method, path, json=body)
                self.assertEqual(response.status_code, 401, response.text)
                self.assertEqual(response.headers["www-authenticate"], "Bearer")

    def test_project_validation_rejects_empty_names_and_owner_spoofing(self):
        bodies = (
            {},
            {"name": "   "},
            {"name": "x" * 161},
            {"name": 123},
            {"name": "Test", "description": "x" * 10_001},
            {"name": "Test", "owner_id": str(self.users[1])},
            {"name": "Test", "id": str(uuid4())},
        )
        for body in bodies:
            with self.subTest(fields=list(body)):
                response = self.request("/projects", method="POST", body=body)
                self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.request("/projects").json(), [])

    def test_site_validation_rejects_empty_names_and_parent_spoofing(self):
        project, another = self.project(), self.project(user=1)
        path = f"/projects/{project['id']}/sites"
        for fields in (
            {"name": " "},
            {"name": "x" * 161},
            {"project_id": another["id"]},
        ):
            response = self.request(
                path,
                method="POST",
                body={
                    "name": "Valid",
                    "boundary": POLYGON,
                    **fields,
                },
            )
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.request(path).json(), [])

    def test_invalid_ids_and_pagination_return_validation_errors(self):
        project = self.project()
        paths = [
            "/projects/not-a-uuid",
            "/projects/not-a-uuid/sites",
            "/sites/not-a-uuid",
        ]
        for endpoint in ("/projects", f"/projects/{project['id']}/sites"):
            for query in (
                "limit=0",
                "limit=1001",
                "offset=-1",
                "offset=99999999999999999999",
                "limit=text",
            ):
                paths.append(endpoint + "?" + query)
        for path in paths:
            with self.subTest(path=path):
                response = self.request(path)
                self.assertEqual(response.status_code, 422, response.text)

    def test_polygon_holes_and_winding_preserve_shape_and_srid(self):
        boundary = {
            "type": "Polygon",
            "coordinates": [
                [[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]],
                [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]],
            ],
        }
        site = self.site(self.project(), boundary=boundary)
        geometry = self.db.execute(
            "SELECT ST_Equals(boundary, ST_GeomFromGeoJSON(%s)) AS same_shape, "
            "ST_SRID(boundary) AS srid, ST_NDims(boundary) AS dimensions, "
            "ST_IsPolygonCCW(boundary) AS ccw, ST_NumInteriorRings(boundary) AS holes "
            "FROM sites WHERE id = %s",
            (json.dumps(boundary), UUID(site["id"])),
        ).fetchone()
        self.assertEqual(
            geometry,
            {
                "same_shape": True,
                "srid": 4326,
                "dimensions": 2,
                "ccw": True,
                "holes": 1,
            },
        )
        self.assertEqual(len(site["boundary"]["coordinates"]), 2)

    def test_malformed_geometry_shapes_and_coordinates_are_rejected(self):
        path = f"/projects/{self.project()['id']}/sites"
        invalid = [
            None,
            {"type": "Point", "coordinates": [77, 28]},
            {"type": "MultiPolygon", "coordinates": [POLYGON["coordinates"]]},
            {"type": "Feature", "geometry": POLYGON, "properties": {}},
            {"type": "Polygon", "coordinates": []},
            {"type": "Polygon", "coordinates": [[]]},
            {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [0, 0]]]},
            {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1]]]},
            {**POLYGON, "crs": {"type": "name", "properties": {"name": "EPSG:3857"}}},
        ]
        for coordinate in (
            [181, 28],
            [-181, 28],
            [77, 91],
            [77, -91],
            [77, 28, 10],
            ["77", 28],
            [True, 28],
            [None, 28],
        ):
            boundary = copy.deepcopy(POLYGON)
            boundary["coordinates"][0][0] = coordinate
            boundary["coordinates"][0][-1] = coordinate
            invalid.append(boundary)
        for index, boundary in enumerate(invalid):
            with self.subTest(case=index):
                response = self.request(
                    path, method="POST", body={"name": "Bad", "boundary": boundary}
                )
                self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.request(path).json(), [])

    def test_nonfinite_coordinate_values_are_rejected_without_server_errors(self):
        path = f"/projects/{self.project()['id']}/sites"
        for value in (float("nan"), float("inf"), float("-inf")):
            boundary = copy.deepcopy(POLYGON)
            boundary["coordinates"][0][0][0] = value
            boundary["coordinates"][0][-1][0] = value
            # Raw JSON intentionally exercises nonstandard NaN/Infinity inputs.
            response = self.client.post(
                path,
                headers={
                    **self.headers[0],
                    "Content-Type": "application/json",
                },
                content=json.dumps({"name": "Bad", "boundary": boundary}),
            )
            self.assertEqual(response.status_code, 422, response.text)

    def test_self_intersections_degenerate_rings_and_invalid_holes_are_rejected(self):
        project = self.project()
        path = f"/projects/{project['id']}/sites"
        invalid_rings = (
            [[[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]],
            [[[0, 0], [1, 1], [2, 2], [0, 0]]],
            [[[0, 0], [0, 0], [0, 0], [0, 0]]],
            [
                [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
                [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]],
            ],
        )
        for rings in invalid_rings:
            response = self.request(
                path,
                method="POST",
                body={
                    "name": "Invalid",
                    "boundary": {"type": "Polygon", "coordinates": rings},
                },
            )
            self.assertEqual(response.status_code, 422, response.text)
            self.assertIn("valid polygon", response.json()["detail"])
        self.assertEqual(self.request(path).json(), [])
        # Rejected requests must not poison the connection or insert partial rows.
        self.site(project)

    def test_polygon_size_limits_are_enforced(self):
        path = f"/projects/{self.project()['id']}/sites"
        oversized_rings = (
            [[[0, 0]] * 10_001],
            [POLYGON["coordinates"][0]] * 101,
            [[[0, 0]] * 6000, [[0, 0]] * 6000],
        )
        for rings in oversized_rings:
            response = self.request(
                path,
                method="POST",
                body={
                    "name": "Oversized",
                    "boundary": {"type": "Polygon", "coordinates": rings},
                },
            )
            self.assertEqual(response.status_code, 422, response.text)

    def test_small_polygon_does_not_collapse_in_geojson_response(self):
        x, y, size = 77.12345678901, 28.12345678901, 0.00000000002
        boundary = {
            "type": "Polygon",
            "coordinates": [
                [
                    [x, y],
                    [x + size, y],
                    [x + size, y + size],
                    [x, y + size],
                    [x, y],
                ]
            ],
        }
        site = self.site(self.project(), boundary=boundary)
        response = self.request(f"/sites/{site['id']}")
        returned = response.json()["boundary"]
        valid = self.db.execute(
            "SELECT ST_IsValid(ST_GeomFromGeoJSON(%s)) AS valid",
            (json.dumps(returned),),
        ).fetchone()["valid"]
        self.assertTrue(valid)
        self.assertNotEqual(
            returned["coordinates"][0][0], returned["coordinates"][0][1]
        )

    def test_demo_workspace_is_explicit_idempotent_and_owned(self):
        first = self.request("/projects/demo", method="POST")
        self.assertEqual(first.status_code, 201, first.text)
        project = first.json()
        self.assertTrue(project["is_demo"])
        repeated = self.request("/projects/demo", method="POST")
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.json()["id"], project["id"])
        self.assertEqual(
            self.db.execute("SELECT count(*) AS n FROM sites").fetchone()["n"], 3
        )
        self.assertEqual(
            self.db.execute("SELECT count(*) AS n FROM site_measurements").fetchone()[
                "n"
            ],
            36,
        )
        self.assertEqual(self.request("/projects", user=1).json(), [])

    def test_demo_measurements_are_chronological_and_clearly_mock(self):
        project = self.request("/projects/demo", method="POST").json()
        sites = self.request(f"/projects/{project['id']}/sites").json()
        self.assertTrue(all(site["area_hectares"] > 0 for site in sites))
        response = self.request(f"/sites/{sites[0]['id']}/measurements")
        self.assertEqual(response.status_code, 200, response.text)
        points = response.json()["measurements"]
        self.assertEqual(len(points), 12)
        self.assertEqual(points[0]["recorded_on"], "2025-09-01")
        self.assertEqual(points[-1]["recorded_on"], "2026-08-01")
        self.assertTrue(all(point["is_mock"] for point in points))
        self.assertTrue(
            all(0 <= point["biodiversity_score"] <= 100 for point in points)
        )

    def test_summary_uses_latest_per_site_not_sum_of_entire_history(self):
        project = self.request("/projects/demo", method="POST").json()
        sites = self.request(f"/projects/{project['id']}/sites").json()
        latest = [
            self.request(f"/sites/{site['id']}/measurements").json()["measurements"][-1]
            for site in sites
        ]
        response = self.request(f"/projects/{project['id']}/summary")
        self.assertEqual(response.status_code, 200, response.text)
        summary = response.json()
        self.assertEqual(summary["site_count"], 3)
        self.assertTrue(summary["has_mock_data"])
        self.assertAlmostEqual(
            summary["area_hectares"], sum(site["area_hectares"] for site in sites)
        )
        self.assertAlmostEqual(
            summary["carbon_tonnes_co2e"], sum(p["carbon_tonnes_co2e"] for p in latest)
        )
        self.assertAlmostEqual(
            summary["biodiversity_score"],
            sum(p["biodiversity_score"] for p in latest) / 3,
        )

    def test_new_projects_and_sites_do_not_fabricate_measurements(self):
        project = self.project()
        summary = self.request(f"/projects/{project['id']}/summary").json()
        self.assertEqual(summary["site_count"], 0)
        self.assertEqual(summary["area_hectares"], 0)
        self.assertIsNone(summary["carbon_tonnes_co2e"])
        self.assertIsNone(summary["biodiversity_score"])
        site = self.site(project)
        response = self.request(f"/sites/{site['id']}/measurements")
        self.assertEqual(response.json()["measurements"], [])
        summary = self.request(f"/projects/{project['id']}/summary").json()
        self.assertEqual(summary["site_count"], 1)
        self.assertFalse(summary["has_mock_data"])

    def test_analytics_and_demo_routes_require_authentication_and_ownership(self):
        project = self.request("/projects/demo", method="POST").json()
        site = self.request(f"/projects/{project['id']}/sites").json()[0]
        for path in (
            f"/projects/{project['id']}/summary",
            f"/sites/{site['id']}/measurements",
        ):
            self.assertEqual(self.request(path, user=1).status_code, 404)
            self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.client.post("/projects/demo").status_code, 401)
        response = self.request(
            "/projects", method="POST", body={"name": "Fake demo", "is_demo": True}
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
