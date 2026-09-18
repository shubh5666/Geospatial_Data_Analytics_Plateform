"""PostgreSQL connections and the dependency for database-backed routes."""

from collections.abc import Iterator
from typing import Annotated

import psycopg
from fastapi import Depends
from psycopg.rows import dict_row

from app.config import DatabaseSettings, load_database_settings


def connect_database(
    settings: DatabaseSettings | None = None,
    *,
    database_name: str | None = None,
    autocommit: bool = False,
) -> psycopg.Connection:
    settings = settings or load_database_settings()
    return psycopg.connect(
        host=settings.host,
        port=settings.port,
        dbname=database_name or settings.name,
        user=settings.user,
        password=settings.password,
        sslmode=settings.sslmode,
        connect_timeout=5,
        autocommit=autocommit,
        row_factory=dict_row,
    )


def get_db() -> Iterator[psycopg.Connection]:
    # A successful request commits; exceptions roll back; both close the connection.
    with connect_database() as connection:
        yield connection


# Commit/rollback before FastAPI sends the response, including write failures.
Database = Annotated[psycopg.Connection, Depends(get_db, scope="function")]
