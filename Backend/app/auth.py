"""Registration, JSON login, and reusable JWT authentication for API routes."""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator

from app.config import AuthSettings
from app.database import Database

router = APIRouter(prefix="/auth", tags=["Authentication"])
password_hasher = PasswordHash.recommended()
# Unknown accounts still perform a password check to reduce timing differences.
_DUMMY_HASH = password_hasher.hash("dummy-password-for-unknown-accounts")
_JWT_ALGORITHM = "HS256"
_JWT_ISSUER = "darukaa-earth"
_JWT_AUDIENCE = "darukaa-earth-api"
bearer_scheme = HTTPBearer(auto_error=False, bearerFormat="JWT")


class EmailCredentials(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class RegisterRequest(EmailCredentials):
    full_name: str = Field(min_length=1, max_length=100)
    password: SecretStr = Field(min_length=8, max_length=128)

    @field_validator("full_name", mode="before")
    @classmethod
    def strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class LoginRequest(EmailCredentials):
    password: SecretStr = Field(min_length=1, max_length=128)


class UserPublic(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


def get_auth_settings(request: Request) -> AuthSettings:
    return request.app.state.auth_settings


Settings = Annotated[AuthSettings, Depends(get_auth_settings)]


def unauthorized(detail: str = "Could not validate credentials") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def create_access_token(user_id: UUID, settings: AuthSettings) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + timedelta(minutes=settings.access_token_minutes),
            "iss": _JWT_ISSUER,
            "aud": _JWT_AUDIENCE,
        },
        settings.jwt_secret,
        algorithm=_JWT_ALGORITHM,
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    settings: Settings,
    db: Database,
) -> UserPublic:
    if credentials is None:
        raise unauthorized()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[_JWT_ALGORITHM],
            issuer=_JWT_ISSUER,
            audience=_JWT_AUDIENCE,
            options={"require": ["sub", "iat", "exp", "iss", "aud"]},
        )
        user_id = UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError, TypeError, AttributeError):
        raise unauthorized() from None
    user = db.execute(
        "SELECT id, full_name, email, created_at FROM users WHERE id = %s",
        (user_id,),
    ).fetchone()
    if user is None:
        raise unauthorized()
    return UserPublic(**user)


CurrentUser = Annotated[UserPublic, Depends(get_current_user)]


@router.post(
    "/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED
)
def register(body: RegisterRequest, db: Database):
    password_hash = password_hasher.hash(body.password.get_secret_value())
    user = db.execute(
        "INSERT INTO users (full_name, email, password_hash) VALUES (%s, %s, %s) "
        "ON CONFLICT (lower(email)) DO NOTHING "
        "RETURNING id, full_name, email, created_at",
        (body.full_name, body.email, password_hash),
    ).fetchone()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    return user


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, response: Response, settings: Settings, db: Database):
    user = db.execute(
        "SELECT id, password_hash FROM users WHERE lower(email) = %s", (body.email,)
    ).fetchone()
    stored_hash = user["password_hash"] if user else _DUMMY_HASH
    password_valid = password_hasher.verify(
        body.password.get_secret_value(), stored_hash
    )
    if not password_valid or user is None:
        raise unauthorized("Incorrect email or password")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return TokenResponse(
        access_token=create_access_token(user["id"], settings),
        expires_in=settings.access_token_minutes * 60,
    )


@router.get("/me", response_model=UserPublic)
def read_current_user(user: CurrentUser, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return user
