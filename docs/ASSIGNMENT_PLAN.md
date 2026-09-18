# Assignment scope and implementation order

Source: `Darukaa___FullStack_Hackathon_(1)_revised_610537.pdf`, four pages,
provided by the user. This checklist records the assignment requirements.
The order and implementation choices below are our plan, not additional PDF
requirements.

## Requirements from the PDF

| Requirement | Source | Planned implementation |
| --- | --- | --- |
| Basic registration and login | Pages 1-2 | FastAPI endpoints and JWT authentication |
| Create and view projects | Page 1 | React dashboard backed by PostgreSQL |
| Multiple geographical sites per project | Page 1 | Project-to-site relationship |
| Draw polygons to add sites | Page 1 | Mapbox GL JS and PostGIS polygon storage |
| View projects and sites on an interactive map | Page 1 | Project selection and site polygons on Mapbox |
| Click a site to see analytics and performance over time | Page 1 | Site details and Chart.js time-series charts |
| React frontend | Page 1 | React |
| Mapbox GL JS | Page 1 | Mapbox GL JS |
| Highcharts or Chart.js | Page 1 | Chart.js, one of the allowed options |
| Python with Flask, Django, or FastAPI | Page 1 | FastAPI, continuing the existing starter |
| PostgreSQL with PostGIS | Page 1 | PostgreSQL database with the PostGIS extension |
| JWT authentication | Page 2 | JWT-protected project and site endpoints |
| Automated code quality checks | Pages 1-2 | Frontend and backend formatting/linting, plus relevant tests |
| Pre-commit hooks | Page 2 | Husky and lint-staged with Prettier and language-appropriate linting |
| Git and a private GitHub repository | Page 2 | Project repository with a logical commit history |
| GitHub Actions CI/CD | Page 2 | Automated checks, build, and deployment |
| Automatically deployed public URL | Page 2 | Hosting on a platform such as Render or Vercel |
| Explain dataset choices; mocks are allowed | Page 2 | Clearly labeled synthetic analytics with documented units and rationale |
| Comprehensive README | Page 2 | Architecture, actual schema, local setup, and CI/CD workflow details |
| Word document submission | Page 4 | Repository URL, demo URL, README overview, and review notes in one `.docx` |

## Step-by-step implementation

1. **Backend starter.** Correct `Backend/app/main.py`, record dependencies,
   exclude local/generated files, and verify the root endpoint.
2. **Database.** Configure PostgreSQL/PostGIS and implement users, projects,
   sites, and dated analytics measurements. Store actual spatial geometry.
3. **Authentication.** Implement registration, password hashing, login, and
   JWT validation. Protect each user's project and site data.
4. **Projects and sites API.** Create/list projects and create/list/get sites.
   Validate incoming polygons and persist them in PostGIS.
5. **React dashboard.** Add registration/login screens and project creation
   and selection using the backend API.
6. **Interactive map.** Integrate Mapbox GL JS, draw site polygons, save sites,
   and select existing sites from the map.
7. **Analytics.** Add documented mock measurements and interactive Chart.js
   charts for a selected site's performance over time.
8. **Automated quality checks.** Add formatting, linting, meaningful tests,
   and Husky/lint-staged hooks. Configure GitHub Actions for the same checks.
9. **Deployment.** Configure the real database and hosting environment,
   automatic deployment, and required secrets. Verify the live user journey.
10. **Submission materials.** Finish the README with implemented details and
    create the `.docx` after real repository and demo links are available.

Each step should be runnable and explained before proceeding when working in
guided mode. Steps 1 through 7 are implemented. PostgreSQL/PostGIS is running
locally, the four application tables are created, and registration, Argon2
password hashing, JWT login, and the protected `/auth/me` endpoint are implemented.
The project/site API supports creating, listing, and reading owned records,
validates incoming GeoJSON polygons, and stores actual PostGIS geometry.
All 50 configuration, authentication, project/site API, analytics, and PostGIS
tests pass. The analytics API exposes an owned project's current summary and an
owned site's chronological measurement series. It also creates an idempotent,
per-user workspace containing explicitly labelled synthetic data; details are in
[ANALYTICS.md](ANALYTICS.md). The React application now provides account access,
project creation/selection, responsive navigation, project/site analytics,
site export, and site creation through a Mapbox map when configured or a
coordinate-grid fallback when it is not. Browser tests cover the complete core
user flow. Step 8 is implemented with GitHub Actions checks for the backend and
frontend. Step 9 is configured for Vercel and Render but awaits the user's
GitHub, Vercel, and Render account connections; see [DEPLOYMENT.md](DEPLOYMENT.md).
This sequence does not add product features beyond the assignment.

## Completion checks

- A new user can register, log in, and access their projects.
- A project can contain multiple sites drawn on the map.
- Projects and sites can be explored on the interactive map.
- Selecting a site shows its details and dated analytics in interactive charts.
- PostgreSQL/PostGIS persists users, projects, polygon geometry, and analytics.
- Commit hooks enforce code quality, and GitHub Actions runs successfully.
- A successful pipeline automatically deploys the working application.
- The README explains the actual architecture, schema, setup, dataset, and CI/CD.
- The submission document contains real reviewable links and necessary notes.

## Notes on submission

Page 2 requires a private repository. Page 4 also gives instructions for public
repositories. Use a private repository to satisfy the stricter requirement.
The reviewer accounts and applied-job submission instructions are listed in
the original PDF.
