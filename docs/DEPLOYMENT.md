# Deploying Darukaa.Earth with Vercel and Render

This project deploys the React frontend to Vercel and the FastAPI/PostGIS API to
Render. The services use different domains, so both the Vercel build variable
and the API's CORS allow-list are required before the application can work in a
browser.

## Before deployment

1. Create a private GitHub repository and push this project to its `main` branch.
   The repository root must include `render.yaml` and `vercel.json`.
2. Do not commit `Backend/.env` or `Frontend/.env`. They are already ignored.
3. Keep the Render service/database names in `render.yaml` unchanged unless you
   update the corresponding environment-variable references.

If this directory has not yet been initialized as a repository, run these from
the project root after creating the empty GitHub repository:

```powershell
git init
git add .
git commit -m "Initial Darukaa.Earth application"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repository>.git
git push -u origin main
```

## 1. Deploy the API and PostGIS database on Render

1. In Render, select **New** → **Blueprint**, connect the GitHub repository,
   and select the root `render.yaml` file.
2. Create the Blueprint. It provisions a free Singapore-region web service and
   a free PostgreSQL 17 database. Render supports PostGIS, and the API's
   `preDeployCommand` runs the versioned migrations, including
   `CREATE EXTENSION postgis`, before each release.
3. Wait for the service to become live, then copy its public URL, for example
   `https://darukaa-earth-api.onrender.com`.

The Blueprint generates `JWT_SECRET_KEY` in Render and wires all database
credentials privately; do not copy credentials into Vercel. The free plans are
suitable for a review/demo deployment. Choose a paid Render plan before relying
on it for availability, backups, or production traffic.

## 2. Deploy the frontend on Vercel

1. In Vercel, select **Add New** → **Project**, import the same GitHub
   repository, and leave the project root at the repository root. `vercel.json`
   installs the workspace dependencies and publishes `Frontend/dist`.
2. Add `VITE_API_BASE_URL` for **Production** and **Preview**, with the exact
   Render API URL copied in step 1 (without a trailing slash), for example:

   ```text
   https://darukaa-earth-api.onrender.com
   ```

3. Optionally add `VITE_MAPBOX_ACCESS_TOKEN` if satellite/street basemaps are
   wanted. This must be a public Mapbox token suitable for browser use; the
   coordinate-grid map works without it.
4. Deploy the project and copy its production URL, for example
   `https://darukaa-earth.vercel.app`.

Vite exposes only environment variables prefixed with `VITE_` to the built
browser app. `VITE_API_BASE_URL` is intentionally public because it is an API
address, not a secret.

## 3. Allow the Vercel browser origin in Render

In the Render web service's **Environment** settings, add:

```text
FRONTEND_ORIGINS=https://<your-vercel-project>.vercel.app
```

For a custom domain, add it as another comma-separated origin. Do not include a
path or trailing slash:

```text
FRONTEND_ORIGINS=https://<your-vercel-project>.vercel.app,https://example.com
```

Save the variable and manually redeploy the Render API. The API rejects malformed
origins at startup rather than falling back to an overly broad CORS policy.

## 4. Verify the live application

1. Open the Vercel URL in a private browser window.
2. Register an account, then select **Explore sample data**.
3. Confirm the map, chart, and site data load.
4. Create a project and a site, reload the page, and confirm that both persist.
5. Open `<render-url>/docs` and confirm FastAPI documentation is reachable.

## Continuous deployment

GitHub Actions runs backend PostGIS integration tests and frontend lint, unit
tests, and production build for every pull request and push to `main`.
Render's Blueprint uses `checksPass`, so it deploys after GitHub checks pass.
Vercel creates preview deployments for pull requests and deploys production from
the configured production branch.

## Platform references

- [Render Blueprints](https://render.com/docs/blueprint-spec)
- [Render Postgres extensions](https://render.com/docs/postgresql-extensions)
- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
