"""Read application settings without printing secrets or changing the environment."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class DatabaseSettings:
    host: str
    port: int
    name: str
    user: str
    password: str = field(repr=False)
    sslmode: str = "prefer"


@dataclass(frozen=True)
class AuthSettings:
    jwt_secret: str = field(repr=False)
    access_token_minutes: int = 30


@dataclass(frozen=True)
class CorsSettings:
    allowed_origins: tuple[str, ...]


LOCAL_FRONTEND_ORIGINS = ("http://127.0.0.1:5173", "http://localhost:5173")


def load_auth_settings(env_file: Path = BACKEND_DIR / ".env") -> AuthSettings:
    values = {**dotenv_values(env_file, interpolate=False), **os.environ}
    secret = values.get("JWT_SECRET_KEY") or ""
    if len(secret.strip().encode("utf-8")) < 32:
        raise ValueError(
            "JWT_SECRET_KEY must contain at least 32 bytes. Generate a random "
            "secret and set it in Backend/.env or the deployment environment."
        )
    try:
        minutes = int(values.get("JWT_ACCESS_TOKEN_MINUTES", "30"))
    except (TypeError, ValueError):
        raise ValueError(
            "JWT_ACCESS_TOKEN_MINUTES must be an integer from 1 to 1440."
        ) from None
    if not 1 <= minutes <= 1440:
        raise ValueError("JWT_ACCESS_TOKEN_MINUTES must be an integer from 1 to 1440.")
    return AuthSettings(jwt_secret=secret, access_token_minutes=minutes)


def load_cors_settings(env_file: Path = BACKEND_DIR / ".env") -> CorsSettings:
    """Load the browser origins allowed to call the API.

    Local Vite origins work by default. Production must provide its Vercel URL
    through FRONTEND_ORIGINS as one or more comma-separated HTTPS origins.
    """
    values = {**dotenv_values(env_file, interpolate=False), **os.environ}
    raw_origins = values.get("FRONTEND_ORIGINS")
    if raw_origins is None:
        return CorsSettings(allowed_origins=LOCAL_FRONTEND_ORIGINS)

    origins = tuple(origin.strip().rstrip("/") for origin in raw_origins.split(","))
    if not origins or any(not origin for origin in origins):
        raise ValueError("FRONTEND_ORIGINS must contain at least one valid origin.")
    for origin in origins:
        parsed = urlsplit(origin)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "FRONTEND_ORIGINS entries must be origins such as "
                "https://darukaa-earth.vercel.app."
            )
    return CorsSettings(allowed_origins=origins)


def load_database_settings(env_file: Path = BACKEND_DIR / ".env") -> DatabaseSettings:
    # Deployment environment variables take precedence over the local file.
    # Disable interpolation so a password containing ${...} stays unchanged.
    values = {**dotenv_values(env_file, interpolate=False), **os.environ}
    required = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")
    missing = [key for key in required if not values.get(key)]
    if missing:
        raise ValueError(
            "Missing database settings: "
            + ", ".join(missing)
            + ". Fill Backend/.env using Backend/.env.example."
        )

    try:
        port = int(values["DB_PORT"])
    except (TypeError, ValueError):
        raise ValueError("DB_PORT must be an integer between 1 and 65535.") from None
    if not 1 <= port <= 65535:
        raise ValueError("DB_PORT must be an integer between 1 and 65535.")

    sslmode = values.get("DB_SSLMODE") or "prefer"
    if sslmode not in {
        "disable",
        "allow",
        "prefer",
        "require",
        "verify-ca",
        "verify-full",
    }:
        raise ValueError("DB_SSLMODE is not a supported PostgreSQL SSL mode.")

    return DatabaseSettings(
        host=values["DB_HOST"],
        port=port,
        name=values["DB_NAME"],
        user=values["DB_USER"],
        password=values["DB_PASSWORD"],
        sslmode=sslmode,
    )
