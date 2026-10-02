# Analytics API and demo dataset

All routes in this document require the bearer token returned by `POST /auth/login`.
They only return data belonging to the signed-in user. A missing resource and a
resource owned by somebody else both return `404`, so the API does not disclose
whether another user's project or site exists.

## Create a demo workspace

`POST /projects/demo` creates a self-contained sample project for the current
user. It is idempotent: the first call returns `201`, and later calls return the
same project with `200`.

The sample includes three polygons in the Western Ghats area and 12 monthly
measurements per site, from 2025-09-01 through 2026-08-01. Its description and
every measurement explicitly identify the data as illustrative mock data.

```http
POST /projects/demo
Authorization: Bearer <access-token>
```

## Project summary

`GET /projects/{project_id}/summary` reports the owned project's site count and
total polygon area in hectares. It uses each site's latest measurement only:
`carbon_tonnes_co2e` is summed and `biodiversity_score` is averaged. Projects
without measurements return `null` for both metrics. `has_mock_data` is true
when any latest measurement is marked as mock.

```json
{
  "project_id": "f05f0f48-c1af-4ef6-af7e-49652fbda832",
  "site_count": 3,
  "area_hectares": 507.2,
  "carbon_tonnes_co2e": 2447.181,
  "biodiversity_score": 73.8,
  "latest_measurement": "2026-08-01",
  "has_mock_data": true
}
```

## Site time series

`GET /sites/{site_id}/measurements` returns up to 120 of a site's newest
measurements in chronological order. This ordering is ready for direct use in a
chart without client-side sorting.

```json
{
  "site_id": "ea5200c3-90f9-46ca-875c-0154918d7bf7",
  "measurements": [
    {
      "recorded_on": "2025-09-01",
      "carbon_tonnes_co2e": 123.456,
      "biodiversity_score": 48.0,
      "is_mock": true
    }
  ]
}
```

## Dataset interpretation

The demo values are deterministic so a user sees the same data whenever their
demo workspace is created. Carbon values are generated from the site's geodesic
area and a gradually increasing illustrative monthly factor. Biodiversity scores
are simple bounded illustrative scores that increase over the same period.

`carbon_tonnes_co2e` is expressed in tonnes of carbon-dioxide equivalent.
`biodiversity_score` is a product-demo scale from 0 to 100, not a validated
scientific metric. None of the sample values are field observations, estimates,
or claims about real environmental performance. Clients should show the mock
label whenever they present this dataset.
