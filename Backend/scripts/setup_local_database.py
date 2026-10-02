"""Set up a project-local Windows PostgreSQL 18/PostGIS instance on port 5433.

Uses installed PostgreSQL binaries and the official PostGIS ZIP downloaded into
.local/downloads. Existing PostgreSQL services and their data are not changed.
"""

import argparse
import secrets
import shutil
import socket
import subprocess
from pathlib import Path
from zipfile import ZipFile

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
LOCAL_DIR = ROOT / ".local"
PG_ROOT = LOCAL_DIR / "postgresql"
DATA_DIR = LOCAL_DIR / "postgres-data"
ENV_FILE = ROOT / "Backend" / ".env"


def run(*args):
    subprocess.run(
        [str(arg) for arg in args],
        check=True,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--postgres-root", type=Path, default=Path(r"C:\Program Files\PostgreSQL\18")
    )
    parser.add_argument(
        "--postgis-zip",
        type=Path,
        default=LOCAL_DIR / "downloads" / "postgis-bundle-pg18-3.6.2x64.zip",
    )
    parser.add_argument("--port", type=int, default=5433)
    args = parser.parse_args()

    if (DATA_DIR / "PG_VERSION").exists():
        print(
            "Local database is already initialized. Use scripts/local_database.ps1 start."
        )
        return
    if DATA_DIR.exists():
        raise SystemExit(
            "An incomplete data directory exists. Inspect .local/postgres-data first."
        )
    if dotenv_values(ENV_FILE, interpolate=False).get("DB_PASSWORD"):
        raise SystemExit(
            "Backend/.env already has database credentials; preserving this configuration."
        )
    if not (args.postgres_root / "bin" / "initdb.exe").is_file():
        raise SystemExit("PostgreSQL binaries not found; set --postgres-root.")
    if not args.postgis_zip.is_file():
        raise SystemExit(
            "Download the official PostGIS ZIP first; see docs/DATABASE_SETUP.md."
        )
    if not 1 <= args.port <= 65535:
        raise SystemExit("Port must be between 1 and 65535.")
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", args.port))

    PG_ROOT.mkdir(parents=True, exist_ok=True)
    print("Copying PostgreSQL binaries into .local/postgresql...", flush=True)
    for folder in ("bin", "lib", "share"):
        shutil.copytree(
            args.postgres_root / folder, PG_ROOT / folder, dirs_exist_ok=True
        )

    print("Installing the PostGIS bundle into the project-local copy...", flush=True)
    with ZipFile(args.postgis_zip) as archive:
        for member in archive.infolist():
            parts = Path(member.filename).parts
            if len(parts) < 2 or parts[1] not in {"bin", "lib", "share"}:
                continue
            destination = (PG_ROOT / Path(*parts[1:])).resolve()
            if not destination.is_relative_to(PG_ROOT.resolve()):
                raise SystemExit("Unexpected path in PostGIS archive.")
            if member.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, destination.open("wb") as target:
                    shutil.copyfileobj(source, target)

    password = secrets.token_urlsafe(32)
    password_file = LOCAL_DIR / "initdb.password"
    try:
        password_file.write_text(password + "\n", encoding="utf-8")
        run(
            PG_ROOT / "bin" / "initdb.exe",
            "-D",
            DATA_DIR,
            "-U",
            "darukaa_local",
            "--pwfile",
            password_file,
            "--auth=scram-sha-256",
            "--encoding=UTF8",
            "--locale=C",
        )
    finally:
        password_file.unlink(missing_ok=True)

    with (DATA_DIR / "postgresql.conf").open("a", encoding="utf-8") as config:
        config.write(
            "\n# Darukaa.Earth local development instance\n"
            f"listen_addresses = '127.0.0.1'\nport = {args.port}\n"
            "password_encryption = 'scram-sha-256'\n"
        )
    ENV_FILE.write_text(
        "# Generated local development credentials. This file is ignored by Git.\n"
        f"DB_HOST=127.0.0.1\nDB_PORT={args.port}\nDB_NAME=darukaa_earth\n"
        f"DB_USER=darukaa_local\nDB_PASSWORD={password}\nDB_SSLMODE=prefer\n",
        encoding="utf-8",
    )
    print("Credentials saved to Backend/.env. Starting PostgreSQL...", flush=True)
    run(
        PG_ROOT / "bin" / "pg_ctl.exe",
        "-D",
        DATA_DIR,
        "-l",
        LOCAL_DIR / "postgres.log",
        "-w",
        "-t",
        "15",
        "start",
    )
    print(f"Local PostgreSQL is ready at 127.0.0.1:{args.port}.")


if __name__ == "__main__":
    main()
