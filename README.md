# Darukaa.Earth

A geospatial analytics dashboard for carbon and biodiversity projects, based on
the supplied Darukaa.Earth Full-Stack Developer Hackathon assignment.

## Current status

Backend steps 1 through 4 and 7, plus the React frontend (steps 5 and 6), are
implemented: the FastAPI starter runs, PostgreSQL/PostGIS
stores the application schema through versioned SQL migrations, and users can
register and log in with JWT authentication. Passwords are hashed with Argon2.
The protected `/auth/me` endpoint returns the signed-in user's public profile.
Authenticated users can create/list/view their projects and create/list/view
polygon sites. Every project/site query checks ownership, and incoming polygons
are validated before being saved in PostGIS. The API also provides an owned
project summary, dated site measurements, and an idempotent, clearly labelled
synthetic demo workspace. All 50 tests pass against the local database.

The authenticated React workspace supports registration and login, project
creation and selection, site drawing or GeoJSON entry, site export, project and
site analytics, responsive navigation, and a per-user synthetic demo workspace.
Mapbox GL JS is used when a public Mapbox token is configured; otherwise a fully
functional coordinate-grid map remains available for local development. Hosting
and deployment are still to be implemented.

The requirement checklist and implementation order are in
[docs/ASSIGNMENT_PLAN.md](docs/ASSIGNMENT_PLAN.md). Deployment setup for Vercel
and Render is ready in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Stack

The PDF requires React, Mapbox GL JS, PostgreSQL with PostGIS, JWT authentication,
GitHub Actions, automated deployment, and pre-commit code quality checks.

For the choices permitted by the PDF, this project will use FastAPI for the
Python backend and Chart.js for charts. Husky, lint-staged, and Prettier will
support the required commit checks. These are planned components unless listed
as completed above.

## Run the backend locally

Run these commands in PowerShell from the project root. If `Backend/venv`
already exists, skip the first command.

```powershell
python -m venv Backend/venv
.\Backend\venv\Scripts\python.exe -m pip install -r Backend/requirements.txt
# Configure Backend/.env as described below before starting the API.
.\Backend\venv\Scripts\python.exe -m uvicorn app.main:app --app-dir Backend --reload
```

Open <http://127.0.0.1:8000/>. The expected response is:

```json
{"message":"Darukaa.Earth Backend is running"}
```

FastAPI's API documentation is available at <http://127.0.0.1:8000/docs>.
Authentication requires `JWT_SECRET_KEY` in `Backend/.env` or the environment.
A random key has already been saved in this workspace. For a fresh setup,
generate one with the command below and copy its output into `JWT_SECRET_KEY`:

```powershell
.\Backend\venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

`JWT_ACCESS_TOKEN_MINUTES` defaults to 30. The API refuses to start with a missing
or short signing key or an invalid token lifetime. See
[docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for the request bodies, Swagger
instructions, security behavior, and code walkthrough.

## Run the frontend locally

Start the backend first, then run this command from the project root:

```powershell
npm run dev
```

Open <http://127.0.0.1:5173>. The Vite development server proxies `/api` calls
to the local backend at `127.0.0.1:8000`.

The coordinate-grid map works without configuration. To enable Mapbox's
satellite/street basemaps, copy `Frontend/.env.example` to `Frontend/.env` and
set the public `VITE_MAPBOX_ACCESS_TOKEN`. Do not put a secret Mapbox token in
the frontend environment file.

## Projects and sites API

All endpoints below require the bearer token returned by `/auth/login`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/projects` | Create a project owned by the signed-in user |
| `GET` | `/projects` | List the user's projects |
| `GET` | `/projects/{project_id}` | Read an owned project |
| `POST` | `/projects/{project_id}/sites` | Add a GeoJSON polygon to an owned project |
| `GET` | `/projects/{project_id}/sites` | List an owned project's sites |
| `GET` | `/sites/{site_id}` | Read a site belonging to an owned project |
| `POST` | `/projects/demo` | Create or return the user's labelled synthetic demo workspace |
| `GET` | `/projects/{project_id}/summary` | Read current aggregate analytics for an owned project |
| `GET` | `/sites/{site_id}/measurements` | Read chronological measurements for an owned site |

Lists support `limit` (default 100, maximum 1000) and `offset` (default 0).
Foreign and nonexistent project/site IDs both return `404`. See
[docs/PROJECTS_AND_SITES.md](docs/PROJECTS_AND_SITES.md) for complete Swagger
examples and supported polygon inputs, and
[docs/ANALYTICS.md](docs/ANALYTICS.md) for the demo dataset and analytics
responses.

## Database setup

On this Windows workspace, a project-local PostgreSQL instance is configured at
`127.0.0.1:5433`, with database `darukaa_earth` and PostGIS 3.6.2. Its generated
credentials are in the Git-ignored `Backend/.env`. The existing system PostgreSQL
service on port 5432 is separate.

To start the project database and verify its schema, run from the project root:

```powershell
.\scripts\local_database.ps1 start
Set-Location Backend
.\venv\Scripts\python.exe -m app.init_db
.\venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\venv\Scripts\python.exe -m unittest discover -s tests -v
```

For a fresh clone, first configure PostgreSQL/PostGIS and copy
`Backend/.env.example` to `Backend/.env`. Then run `python -m app.init_db
--create-database` from `Backend` using the project virtual environment.
Complete instructions, start/stop commands, and schema details are in
[docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md).

## Architecture and database

The React dashboard will call the FastAPI API. The API authenticates users
with JWT and exposes owned projects and polygon sites from PostgreSQL/PostGIS.
Analytics endpoints will be added in step 7.
Mapbox GL JS will display and draw site polygons; Chart.js will display site
measurements over time.

The implemented database relationships are `User -> Projects -> Sites -> Measurements`.

| Table | Purpose | Key fields |
| --- | --- | --- |
| `users` | Accounts used by registration, login, and `/auth/me` | UUID, full name, case-insensitive unique email, Argon2 password hash |
| `projects` | Projects owned by a user | UUID, owner ID, name, description |
| `sites` | Multiple map polygons per project | UUID, project ID, name, `geometry(POLYGON, 4326)` boundary |
| `site_measurements` | Dated site analytics | Site ID, date, tonnes CO2e, illustrative biodiversity score, mock flag |

Foreign keys preserve these relationships. A GiST index supports spatial
queries; constraints reject empty, invalid, or out-of-range polygons. Each site
can have one measurement per date. The illustrative analytics fields are our
demo design choices; the PDF does not prescribe their units or scoring model.

SQL migrations are in `Backend/migrations`. The `schema_migrations` metadata
table records applied files and checksums. Setup reuses applied migrations and
rolls back a failed migration transaction. Existing migration files should not
be edited after application; add a new numbered SQL file for schema changes.

## Quality checks and deployment

The frontend has unit tests for GeoJSON editing and browser-level tests covering
registration, demo analytics, project creation, site drawing, export, mobile
navigation, session expiry, and retry behaviour. Run them from `Frontend`:

```powershell
npm run lint
npm run test
npm run build
npm run test:e2e
```

The e2e suite needs a locally installed Chromium-compatible browser. GitHub
Actions runs backend PostGIS integration tests plus frontend lint, unit tests,
and builds on every pull request and push to `main`. Render is configured to
deploy the API after checks pass; Vercel deploys the frontend from the same
repository. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the account-level
steps, environment variables, and live verification checklist.

## Dataset and submission

The PDF allows mock datasets. `POST /projects/demo` creates a private demo
workspace for the signed-in user with three illustrative polygons and twelve
monthly synthetic measurements per site (September 2025 through August 2026).
The time series uses `carbon_tonnes_co2e` (tonnes of CO2 equivalent), an
illustrative `biodiversity_score` from 0 to 100, and `is_mock: true`. The data
is deterministic for reproducible demos; it is not measured environmental data
or a scientifically validated biodiversity index. See
[docs/ANALYTICS.md](docs/ANALYTICS.md) for generation details and API examples.

The PDF requests a private GitHub repository, a public demo, and a complete
README. Its final page additionally requires a Word document containing the
repository link, demo link, README overview, and review instructions. That page
also describes public repositories, but the earlier technical requirement asks
for a private repository, so private is the planned choice.

Repository creation, reviewer invitations, deployment, and submission have not
been performed.
