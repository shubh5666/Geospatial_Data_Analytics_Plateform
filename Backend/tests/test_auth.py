"""Authentication against real PostgreSQL with a rolled-back schema per test."""

import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import UUID, uuid4

import jwt
from app.auth import password_hasher
from app.database import connect_database, get_db
from app.init_db import apply_migrations
from app.main import app
from fastapi.testclient import TestClient
from psycopg import sql

TEST_SECRET = "test-only-jwt-secret-" + "a" * 48
TEST_PASSWORD = "test passphrase with spaces"


class AuthIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = password_hasher.hash(TEST_PASSWORD)

    def setUp(self):
        self.db = connect_database()
        self.addCleanup(self.db.close)
        self.addCleanup(self.db.rollback)
        schema = "test_auth_" + uuid4().hex
        self.db.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        self.db.execute(
            sql.SQL("SET LOCAL search_path TO {}, public").format(
                sql.Identifier(schema)
            )
        )
        apply_migrations(self.db)
        self.user_id = self.db.execute(
            "INSERT INTO users (full_name, email, password_hash) VALUES (%s, %s, %s) "
            "RETURNING id",
            ("Test User", "tester@example.com", self.password_hash),
        ).fetchone()["id"]

        def override_db():
            # Preserve production commit/rollback behavior inside an outer rollback.
            with self.db.transaction():
                yield self.db

        old_overrides = app.dependency_overrides.copy()
        app.dependency_overrides[get_db] = override_db
        self.addCleanup(setattr, app, "dependency_overrides", old_overrides)
        environment = patch.dict(
            os.environ,
            {"JWT_SECRET_KEY": TEST_SECRET, "JWT_ACCESS_TOKEN_MINUTES": "30"},
        )
        environment.start()
        self.addCleanup(environment.stop)
        self.client = self.enterContext(TestClient(app))

    def login(self, email="tester@example.com", password=TEST_PASSWORD):
        return self.client.post(
            "/auth/login", json={"email": email, "password": password}
        )

    def assert_unauthorized(self, response):
        self.assertEqual(response.status_code, 401, response.text)
        self.assertEqual(response.headers["www-authenticate"], "Bearer")

    def signed_token(
        self, *, changes=None, missing=(), key=TEST_SECRET, algorithm="HS256"
    ):
        now = datetime.now(timezone.utc)
        claims = {
            "sub": str(self.user_id),
            "iat": now,
            "exp": now + timedelta(minutes=30),
            "iss": "darukaa-earth",
            "aud": "darukaa-earth-api",
        }
        claims.update(changes or {})
        for claim in missing:
            claims.pop(claim)
        return jwt.encode(claims, key, algorithm=algorithm)

    def test_register_login_and_current_user_round_trip(self):
        password = "  exact password whitespace  "
        registered = self.client.post(
            "/auth/register",
            json={
                "full_name": "  New User  ",
                "email": "NEW.User@Example.com",
                "password": password,
            },
        )
        self.assertEqual(registered.status_code, 201, registered.text)
        user = registered.json()
        self.assertEqual(user["full_name"], "New User")
        self.assertEqual(user["email"], "new.user@example.com")
        self.assertEqual(set(user), {"id", "full_name", "email", "created_at"})
        row = self.db.execute(
            "SELECT password_hash FROM users WHERE id = %s", (UUID(user["id"]),)
        ).fetchone()
        self.assertTrue(row["password_hash"].startswith("$argon2id$"))
        self.assertTrue(password_hasher.verify(password, row["password_hash"]))
        self.assertNotIn(password, registered.text)
        logged_in = self.login("NEW.USER@example.com", password)
        self.assertEqual(logged_in.status_code, 200, logged_in.text)
        token = logged_in.json()
        self.assertEqual(token["token_type"], "bearer")
        self.assertEqual(token["expires_in"], 1800)
        self.assertEqual(logged_in.headers["cache-control"], "no-store")
        claims = jwt.decode(
            token["access_token"],
            TEST_SECRET,
            algorithms=["HS256"],
            issuer="darukaa-earth",
            audience="darukaa-earth-api",
        )
        self.assertEqual(claims["sub"], user["id"])
        self.assertEqual(claims["exp"] - claims["iat"], 1800)
        self.assertNotIn("password", claims)
        profile = self.client.get(
            "/auth/me", headers={"Authorization": "Bearer " + token["access_token"]}
        )
        self.assertEqual(profile.status_code, 200, profile.text)
        self.assertEqual(profile.json(), user)
        self.assert_unauthorized(self.login("new.user@example.com", password.strip()))

    def test_duplicate_email_is_case_insensitive_and_keeps_original_account(self):
        response = self.client.post(
            "/auth/register",
            json={
                "full_name": "Duplicate",
                "email": "TESTER@example.com",
                "password": "other-password",
            },
        )
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(
            self.db.execute("SELECT count(*) AS n FROM users").fetchone()["n"], 1
        )
        self.assertEqual(self.login().status_code, 200)

    def test_invalid_registration_never_echoes_password_or_creates_user(self):
        valid = {
            "full_name": "New",
            "email": "new@example.com",
            "password": "private-password",
        }
        invalid_fields = (
            {"email": "not-an-email"},
            {"full_name": "   "},
            {"full_name": "a" * 101},
            {"password": "abc12"},
            {"password": "x" * 129},
            {"owner_id": str(self.user_id)},
        )
        for fields in invalid_fields:
            body = {**valid, **fields}
            with self.subTest(fields=list(fields)):
                response = self.client.post("/auth/register", json=body)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertNotIn(body["password"], response.text)
                self.assertTrue(
                    all("input" not in e for e in response.json()["detail"])
                )
        response = self.client.post(
            "/auth/register", json={"password": "private-password"}
        )
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("private-password", response.text)
        self.assertEqual(
            self.db.execute("SELECT count(*) AS n FROM users").fetchone()["n"], 1
        )

    def test_wrong_password_and_unknown_email_have_the_same_response(self):
        wrong_password = self.login(password="incorrect-password")
        unknown_user = self.login(email="missing@example.com")
        self.assert_unauthorized(wrong_password)
        self.assert_unauthorized(unknown_user)
        self.assertEqual(wrong_password.json(), unknown_user.json())

    def test_missing_wrong_scheme_and_malformed_tokens_are_rejected(self):
        for authorization in (None, "Basic abc", "Bearer", "Bearer bad.token.value"):
            with self.subTest(authorization=authorization):
                headers = {"Authorization": authorization} if authorization else {}
                self.assert_unauthorized(self.client.get("/auth/me", headers=headers))

    def test_expired_forged_wrong_algorithm_and_invalid_claims_are_rejected(self):
        now = datetime.now(timezone.utc)
        tokens = {
            "expired": self.signed_token(changes={"exp": now - timedelta(seconds=1)}),
            "future": self.signed_token(changes={"iat": now + timedelta(minutes=1)}),
            "forged": self.signed_token(key="different-test-secret-" + "b" * 48),
            "wrong_algorithm": self.signed_token(algorithm="HS384"),
            "unsigned": self.signed_token(key="", algorithm="none"),
            "wrong_issuer": self.signed_token(changes={"iss": "another-app"}),
            "wrong_audience": self.signed_token(changes={"aud": "another-api"}),
            "invalid_uuid": self.signed_token(changes={"sub": "not-a-uuid"}),
            "unknown_user": self.signed_token(changes={"sub": str(uuid4())}),
        }
        for claim in ("sub", "iat", "exp", "iss", "aud"):
            tokens["missing_" + claim] = self.signed_token(missing=(claim,))
        for label, token in tokens.items():
            with self.subTest(label=label):
                self.assert_unauthorized(
                    self.client.get(
                        "/auth/me", headers={"Authorization": "Bearer " + token}
                    )
                )

    def test_deleted_user_token_is_rejected(self):
        token = self.login().json()["access_token"]
        self.db.execute("DELETE FROM users WHERE id = %s", (self.user_id,))
        self.assert_unauthorized(
            self.client.get("/auth/me", headers={"Authorization": "Bearer " + token})
        )

    def test_current_user_cannot_be_selected_with_query_parameter(self):
        token = self.login().json()["access_token"]
        another_id = self.db.execute(
            "INSERT INTO users (full_name, email, password_hash) VALUES (%s, %s, %s) "
            "RETURNING id",
            ("Another", "another@example.com", self.password_hash),
        ).fetchone()["id"]
        response = self.client.get(
            f"/auth/me?user_id={another_id}",
            headers={"Authorization": "Bearer " + token},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["id"], str(self.user_id))

    def test_root_and_openapi_remain_available(self):
        self.assertEqual(
            self.client.get("/").json(), {"message": "Darukaa.Earth Backend is running"}
        )
        schema = self.client.get("/openapi.json").json()
        self.assertIn("/auth/register", schema["paths"])
        self.assertTrue(schema["paths"]["/auth/me"]["get"]["security"])


class AuthStartupTests(unittest.TestCase):
    def test_api_refuses_to_start_without_a_signing_key(self):
        with patch.dict(os.environ, {"JWT_SECRET_KEY": ""}):
            with self.assertRaisesRegex(ValueError, "JWT_SECRET_KEY"):
                with TestClient(app):
                    pass


if __name__ == "__main__":
    unittest.main()
