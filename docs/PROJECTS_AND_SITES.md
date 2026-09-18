# Step 4: Projects and polygon sites

Users can now create projects, add multiple polygon sites to each project, and
retrieve those records. Every endpoint requires JWT authentication. A project
belongs to the signed-in user, and site access follows that project's ownership.

The existing database schema supports this step, so no migration is required.
The React dashboard and interactive drawing tools come in steps 5 and 6.

## Try it in Swagger

Start the database and API as described in [the README](../README.md). Open
<http://127.0.0.1:8000/docs>, register, log in, and click **Authorize** with the
returned access token. See [AUTHENTICATION.md](AUTHENTICATION.md) for that flow.

1. Call `POST /projects` with this JSON body:

   ```json
   {
     "name": "Delhi restoration project",
     "description": "Demo project for carbon and biodiversity monitoring"
   }
   ```

   The `201` response includes `id`, `owner_id`, `name`, `description`, and
   `created_at`. Copy `id` for the next request. The server supplies `owner_id`
   from the authenticated account. Do not include it in the request body.

2. Call `POST /projects/{project_id}/sites`, using that project ID and this body:

   ```json
   {
     "name": "Northern plot",
     "boundary": {
       "type": "Polygon",
       "coordinates": [
         [
           [77.0, 28.0],
           [77.01, 28.0],
           [77.01, 28.01],
           [77.0, 28.01],
           [77.0, 28.0]
         ]
       ]
     }
   }
   ```

   The `201` response includes `id`, `project_id`, `name`, `boundary`, and
   `created_at`. `boundary` is a GeoJSON object. Save its site `id` for reading
   a single site. These coordinates are illustrative demo data.

3. Add another site with the same project ID. A project supports multiple sites.

4. Use `GET /projects` to list projects, `GET /projects/{project_id}` to read one,
   `GET /projects/{project_id}/sites` to list its sites, and `GET /sites/{site_id}`
   to read a particular site and its polygon.

An existing project with no sites returns `[]`. Project and site list responses
are plain JSON arrays. Lists support `limit` (1 to 1000, default 100) and `offset`
(0 to 2147483647, default 0). The order is `created_at`, then `id`, ascending.
To retrieve further pages, increase `offset` by `limit` until a page contains
fewer items than `limit`.

## Request validation

Project and site names are trimmed and must contain 1 to 160 characters after
trimming. Project descriptions are optional, default to an empty string, and
may contain up to 10000 characters. Unexpected body fields are rejected,
including attempts to supply an owner ID or override a site's parent project.

The supported boundary is a two-dimensional GeoJSON `Polygon` geometry with
only `type` and `coordinates` fields:

- Each position is exactly `[longitude, latitude]`, using finite JSON numbers.
- Longitude must be within -180 to 180; latitude within -90 to 90.
- A polygon contains an exterior ring and optionally interior rings (holes).
- Each ring has at least four positions and repeats its first position at the end.
- The API accepts up to 100 rings and 10000 total positions, including closing positions.
- PostGIS rejects self-intersections, degenerate polygons, and invalid holes.

Full GeoJSON `Feature`/`FeatureCollection` wrappers, `MultiPolygon`, three-dimensional
positions, alternate coordinate systems, and numeric strings are not supported
by this endpoint. The future map client should send a drawn feature's `geometry`
as `boundary`. These input limits are application choices for this demo.

The database stores `geometry(POLYGON, 4326)`. Ring winding is normalized to
counterclockwise for the exterior and clockwise for holes without changing the
shape. Returned coordinate order may consequently differ from input order.
GeoJSON output uses up to 17 decimal places to avoid collapsing small polygons
through routine display rounding. Invalid shapes are rejected; they are not
automatically repaired.

## Ownership and error responses

| Situation | HTTP status |
| --- | --- |
| Project or site created | `201` |
| Owned project/site or list retrieved | `200` |
| Missing, expired, or invalid token | `401` |
| Project/site does not exist or belongs to another user | `404` |
| Invalid request fields, UUIDs, pagination, or polygon | `422` |

To check ownership manually, create a second account and authorize its token.
The first account's projects must not appear in `GET /projects`. Reading the
first account's project or site, listing its sites, or adding a site to it must
return `404`. The API uses the same response for missing and inaccessible IDs.

All SQL values use query parameters. Every project read includes its owner ID,
every site read joins the parent project's owner, and creating a site checks
ownership before validation and again in the insert query. Successful database
transactions finish before responses are sent; failed requests roll back.

This step implements create/list/read operations. Update, delete, map rendering,
and analytics endpoints are not part of these routes.

## Code and verification

| File | Responsibility |
| --- | --- |
| `Backend/app/projects.py` | Project/site request and response models, ownership checks, six routes, PostGIS conversion |
| `Backend/app/geometry.py` | GeoJSON shape, ring closure, coordinate ranges, and input size validation |
| `Backend/app/database.py` | Shared database dependency and transactions |
| `Backend/app/main.py` | Registers the project/site router alongside authentication |
| `Backend/tests/test_projects.py` | Fifteen API integration tests against actual PostgreSQL/PostGIS |

From `Backend`, with the database running:

```powershell
.\venv\Scripts\python.exe -m unittest discover -s tests -v
```

All 45 tests pass. Project/site tests cover the complete API flow, two-account
isolation, ownership spoofing, required authentication, paging, holes, winding,
malformed/nonfinite coordinates, invalid topology, and small-polygon precision.
Each integration test uses a temporary schema rolled back after the test.

Geometry references:
[GeoJSON polygon specification](https://datatracker.ietf.org/doc/html/rfc7946#section-3.1.6),
[PostGIS GeoJSON input](https://postgis.net/docs/ST_GeomFromGeoJSON.html),
[PostGIS validity checks](https://postgis.net/docs/ST_IsValid.html), and
[PostGIS GeoJSON output](https://postgis.net/docs/ST_AsGeoJSON.html).
