"""Create the application database on request and apply versioned SQL migrations.

From Backend: python -m app.init_db --create-database
"""

import argparse
import hashlib
import sys
from pathlib import Path

import psycopg
from psycopg import sql

from app.config import BACKEND_DIR, DatabaseSettings, load_database_settings
from app.database import connect_database

MIGRATIONS_DIR = BACKEND_DIR / "migrations"


def create_database_if_missing(settings: DatabaseSettings) -> bool:
    # PostgreSQL requires CREATE DATABASE to run outside a transaction.
    with connect_database(
        settings, database_name="postgres", autocommit=True
    ) as connection:
        exists = connection.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (settings.name,)
        ).fetchone()
        if exists:
            return False
        connection.execute(
            sql.SQL("CREATE DATABASE {} TEMPLATE template0 ENCODING 'UTF8'").format(
                sql.Identifier(settings.name)
            )
        )
        return True


def apply_migrations(
    connection: psycopg.Connection, migrations_dir: Path = MIGRATIONS_DIR
) -> list[str]:
    migration_files = sorted(migrations_dir.glob("*.sql"))
    if not migration_files:
        raise RuntimeError("No SQL migrations found in Backend/migrations.")

    applied_now = []
    # One transaction prevents half-created tables on a migration failure.
    with connection.transaction():
        connection.execute("SELECT pg_advisory_xact_lock(865971204)")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                checksum TEXT NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        applied = {
            row["version"]: row["checksum"]
            for row in connection.execute(
                "SELECT version, checksum FROM schema_migrations"
            ).fetchall()
        }
        unknown = set(applied) - {path.name for path in migration_files}
        if unknown:
            raise RuntimeError(
                "Database contains migrations missing from this checkout."
            )

        for path in migration_files:
            migration_sql = path.read_text(encoding="utf-8")
            checksum = hashlib.sha256(migration_sql.encode("utf-8")).hexdigest()
            if path.name in applied:
                if applied[path.name] != checksum:
                    raise RuntimeError(
                        f"Applied migration {path.name} was changed. Add a new migration."
                    )
                continue
            connection.execute(migration_sql)
            connection.execute(
                "INSERT INTO schema_migrations (version, checksum) VALUES (%s, %s)",
                (path.name, checksum),
            )
            applied_now.append(path.name)
    return applied_now


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--create-database",
        action="store_true",
        help="Create DB_NAME if missing; requires a PostgreSQL role with CREATEDB.",
    )
    args = parser.parse_args()

    try:
        settings = load_database_settings()
        if args.create_database and create_database_if_missing(settings):
            print(f"Created database: {settings.name}")
        with connect_database(settings) as connection:
            available = connection.execute(
                "SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'"
            ).fetchone()
            if not available:
                raise RuntimeError(
                    "PostGIS is not installed on this PostgreSQL server. "
                    "See docs/DATABASE_SETUP.md."
                )
            applied = apply_migrations(connection)
            details = connection.execute(
                "SELECT current_database() AS database, PostGIS_Lib_Version() AS postgis"
            ).fetchone()
        print("Applied: " + (", ".join(applied) if applied else "already up to date"))
        print(f"Database ready: {details['database']} | PostGIS {details['postgis']}")
        print("Tables: users, projects, sites, site_measurements")
        return 0
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
    except psycopg.OperationalError:
        print(
            "Could not connect to PostgreSQL. Check that it is running and that "
            "Backend/.env has the correct host, port, database, user, and password. "
            "Use --create-database for first-time setup.",
            file=sys.stderr,
        )
    except psycopg.Error as error:
        print(
            "Database setup failed "
            f"({type(error).__name__}, SQLSTATE {error.sqlstate or 'unknown'}). "
            "Check PostGIS installation and the database role's privileges. "
            "The migration transaction was rolled back.",
            file=sys.stderr,
        )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
