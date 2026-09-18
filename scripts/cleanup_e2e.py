"""Remove only the exact disposable account IDs/emails registered by the E2E run."""

import json
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "Backend"))

from app.database import connect_database  # noqa: E402

accounts = json.load(sys.stdin)
with connect_database() as db:
    for account in accounts:
        email = account["email"]
        if not email.startswith("e2e-") or not email.endswith("@example.com"):
            raise ValueError("Refusing to remove a non-test account")
        db.execute(
            "DELETE FROM users WHERE id = %s AND email = %s",
            (UUID(account["id"]), email),
        )
