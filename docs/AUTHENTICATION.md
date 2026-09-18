# Step 3: Registration and JWT login

The backend now supports creating an account, logging in, and retrieving the
signed-in user's profile. It uses the existing PostgreSQL `users` table, so this
step does not change the database schema.

## Run it

In this workspace, the database credentials and a generated JWT signing key are
already in the ignored `Backend/.env` file. Run from the project root:

```powershell
.\scripts\local_database.ps1 start
.\Backend\venv\Scripts\python.exe -m pip install -r Backend/requirements-dev.txt
.\Backend\venv\Scripts\python.exe -m uvicorn app.main:app --app-dir Backend --reload
```

For a fresh setup, copy `Backend/.env.example` to `Backend/.env`, configure the
database using [DATABASE_SETUP.md](DATABASE_SETUP.md), and set `JWT_SECRET_KEY`
to a randomly generated secret. This command produces a suitable key:

```powershell
.\Backend\venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

The API loads authentication settings at startup. Restart it after changing
the environment file. Environment variables override the file. The signing
key must contain at least 32 bytes excluding surrounding whitespace;
`JWT_ACCESS_TOKEN_MINUTES` must
be an integer from 1 to 1440 and defaults to 30. Do not put the signing key in
frontend code or commit it to Git. Changing it invalidates previously issued tokens.

## Try the flow in Swagger

Open <http://127.0.0.1:8000/docs>. Each endpoint uses **Try it out**, then **Execute**.

1. Call `POST /auth/register` with a JSON body like this. Choose your own password.

   ```json
   {
     "full_name": "Example User",
     "email": "example@example.com",
     "password": "choose-your-own-passphrase"
   }
   ```

   A successful request returns `201` with `id`, `full_name`, `email`, and
   `created_at`. The name is trimmed, email is normalized to lowercase, and
   passwords must be 8 to 128 characters. Password whitespace is preserved.

2. Call `POST /auth/login` with the same email and password as JSON:

   ```json
   {
     "email": "example@example.com",
     "password": "choose-your-own-passphrase"
   }
   ```

   The response contains `access_token`, `token_type: "bearer"`, and
   `expires_in: 1800` with the default settings. Registration itself does not
   issue a token.

3. Copy the token, click **Authorize**, and paste only the token into the
   `HTTPBearer` field. Swagger adds the `Bearer` prefix automatically.

4. Call `GET /auth/me`. The response is the public profile of the account
   identified by the token. Calls from other clients must send:

   ```text
   Authorization: Bearer <access_token>
   ```

This is a JSON login endpoint; it does not accept OAuth2 form fields such as
`username`. The React frontend can use the same JSON requests later.

## Responses and security behavior

| Situation | HTTP status |
| --- | --- |
| Account created | `201` |
| Login or profile lookup succeeded | `200` |
| Email already registered, regardless of case | `409` |
| Invalid registration/login fields or unexpected fields | `422` |
| Wrong password or unknown email | `401`, same error message |
| Missing, malformed, expired, or incorrectly signed access token | `401` |
| Valid token for an account that no longer exists | `401` |

Passwords are stored as salted Argon2 hashes using `pwdlib`. Unknown emails
still trigger a password verification against a dummy hash to reduce timing
differences. Neither successful responses nor validation errors return plaintext
passwords or password hashes. SQL values are parameterized, and the database's
unique email index handles simultaneous attempts to register the same address.

JWTs use HS256 with a fixed algorithm and include the user's UUID (`sub`), issued
time (`iat`), expiration (`exp`), issuer (`iss`), and audience (`aud`). All five
claims are required when validating a token. Tokens contain no password data.
Login responses disable caching. Authentication checks that the user still
exists in PostgreSQL on each protected request.

Successful database work commits before the response is sent. Failed requests
roll back. `/auth/me` derives the user identity from the verified token.

This step provides the reusable authentication dependency. The project and site
routes added in step 4 filter projects by the signed-in user's ID and check each
site's parent project ownership. JWT validation alone does not enforce those data
access rules. See [PROJECTS_AND_SITES.md](PROJECTS_AND_SITES.md).

The current scope uses expiring access tokens. Password reset, email verification,
refresh tokens, server-side logout/revocation, and login rate limiting are not
implemented. Deployment should add HTTPS and request throttling before public use.

## Code walkthrough

| File | Responsibility |
| --- | --- |
| `Backend/app/main.py` | Validates auth settings at startup, registers the router, and removes submitted input from validation errors |
| `Backend/app/config.py` | Loads and validates database and authentication configuration |
| `Backend/app/auth.py` | Request/response schemas, password hashing, JWT creation/validation, routes, and `CurrentUser` dependency |
| `Backend/app/database.py` | Database connections and request transactions |
| `Backend/tests/test_auth.py` | Authentication flows, isolation, invalid tokens, password handling, and startup behavior |

Protected routes accept `user: CurrentUser` and use `user.id` in their database
queries. The shared `Database` dependency in `app.database` uses function scope so
the transaction finishes before FastAPI sends the response.

## Verify it

Start the project database, then run from `Backend`:

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\venv\Scripts\python.exe -m unittest discover -s tests -v
```

The suite now has 45 tests, including configuration, authentication, project/site,
and PostGIS checks.
Authentication tests use the real database in a temporary schema and roll back
after each test; they do not create persistent demo users in the application tables.
`httpx2` is a development dependency used by the installed Starlette test client.

Implementation references:
[FastAPI password hashing and JWT guide](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)
and [PyJWT validation API](https://pyjwt.readthedocs.io/en/stable/api.html).
