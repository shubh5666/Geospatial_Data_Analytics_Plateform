import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.config import load_auth_settings, load_cors_settings, load_database_settings


class DatabaseSettingsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env_file = Path(self.directory.name) / ".env"
        self.env_file.write_text(
            "DB_HOST=127.0.0.1\nDB_PORT=5433\nDB_NAME=darukaa_test\n"
            "DB_USER=test_user\nDB_PASSWORD='test@${LITERAL}#value'\n",
            encoding="utf-8",
        )
        self.environment = patch.dict(os.environ, {}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_password_is_literal_and_hidden_from_repr(self):
        settings = load_database_settings(self.env_file)
        self.assertEqual(settings.password, "test@${LITERAL}#value")
        self.assertNotIn(settings.password, repr(settings))

    def test_deployment_environment_overrides_local_file(self):
        with patch.dict(os.environ, {"DB_PORT": "6432", "DB_HOST": "db.example"}):
            settings = load_database_settings(self.env_file)
        self.assertEqual(settings.port, 6432)
        self.assertEqual(settings.host, "db.example")

    def test_missing_password_has_actionable_error(self):
        with patch.dict(os.environ, {"DB_PASSWORD": ""}):
            with self.assertRaisesRegex(ValueError, "DB_PASSWORD.*Backend/.env"):
                load_database_settings(self.env_file)

    def test_invalid_ports_are_rejected(self):
        for value in ("text", "0", "65536", "-1"):
            with self.subTest(port=value), patch.dict(os.environ, {"DB_PORT": value}):
                with self.assertRaisesRegex(ValueError, "DB_PORT"):
                    load_database_settings(self.env_file)

    def test_invalid_ssl_mode_is_rejected(self):
        with patch.dict(os.environ, {"DB_SSLMODE": "invalid"}):
            with self.assertRaisesRegex(ValueError, "DB_SSLMODE"):
                load_database_settings(self.env_file)


class AuthSettingsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env_file = Path(self.directory.name) / ".env"
        self.secret = "test-only-signing-key-" + "a" * 48
        self.env_file.write_text(f"JWT_SECRET_KEY={self.secret}\n", encoding="utf-8")
        environment = patch.dict(os.environ, {}, clear=True)
        environment.start()
        self.addCleanup(environment.stop)

    def test_defaults_and_secret_is_hidden_from_repr(self):
        settings = load_auth_settings(self.env_file)
        self.assertEqual(settings.jwt_secret, self.secret)
        self.assertEqual(settings.access_token_minutes, 30)
        self.assertNotIn(self.secret, repr(settings))

    def test_environment_overrides_local_auth_settings(self):
        secret = "deployment-test-secret-" + "b" * 48
        with patch.dict(
            os.environ, {"JWT_SECRET_KEY": secret, "JWT_ACCESS_TOKEN_MINUTES": "15"}
        ):
            settings = load_auth_settings(self.env_file)
        self.assertEqual(settings.jwt_secret, secret)
        self.assertEqual(settings.access_token_minutes, 15)

    def test_missing_short_and_blank_secrets_are_rejected(self):
        for value in ("", "short", " " * 64):
            with (
                self.subTest(value=value),
                patch.dict(os.environ, {"JWT_SECRET_KEY": value}),
            ):
                with self.assertRaisesRegex(ValueError, "JWT_SECRET_KEY"):
                    load_auth_settings(self.env_file)

    def test_invalid_token_lifetimes_are_rejected(self):
        for value in ("", "text", "0", "-1", "1441", "1.5"):
            with (
                self.subTest(value=value),
                patch.dict(os.environ, {"JWT_ACCESS_TOKEN_MINUTES": value}),
            ):
                with self.assertRaisesRegex(ValueError, "JWT_ACCESS_TOKEN_MINUTES"):
                    load_auth_settings(self.env_file)


class CorsSettingsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env_file = Path(self.directory.name) / ".env"
        self.environment = patch.dict(os.environ, {}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_local_origins_are_the_safe_default(self):
        self.env_file.write_text("", encoding="utf-8")
        settings = load_cors_settings(self.env_file)
        self.assertEqual(
            settings.allowed_origins,
            ("http://127.0.0.1:5173", "http://localhost:5173"),
        )

    def test_deployment_origins_are_normalized_and_validated(self):
        self.env_file.write_text(
            "FRONTEND_ORIGINS=https://darukaa-earth.vercel.app/, https://preview.example\n",
            encoding="utf-8",
        )
        settings = load_cors_settings(self.env_file)
        self.assertEqual(
            settings.allowed_origins,
            ("https://darukaa-earth.vercel.app", "https://preview.example"),
        )
        for value in ("", "https://site.example/path", "not-a-url"):
            with self.subTest(value=value):
                self.env_file.write_text(
                    f"FRONTEND_ORIGINS={value}\n", encoding="utf-8"
                )
                with self.assertRaisesRegex(ValueError, "FRONTEND_ORIGINS"):
                    load_cors_settings(self.env_file)


if __name__ == "__main__":
    unittest.main()
