"""Owned project summaries, site time series, and explicitly synthetic demo data."""

import json
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.auth import CurrentUser
from app.database import Database
from app.projects import ProjectPublic, owned_project, owned_site

router = APIRouter(tags=["Analytics"])


class ProjectSummary(BaseModel):
    project_id: UUID
    site_count: int
    area_hectares: float
    carbon_tonnes_co2e: float | None
    biodiversity_score: float | None
    latest_measurement: date | None
    has_mock_data: bool


class Measurement(BaseModel):
    recorded_on: date
    carbon_tonnes_co2e: float
    biodiversity_score: float
    is_mock: bool


class SiteMeasurements(BaseModel):
    site_id: UUID
    measurements: list[Measurement]


@router.get("/projects/{project_id}/summary", response_model=ProjectSummary)
def project_summary(project_id: UUID, user: CurrentUser, db: Database):
    owned_project(project_id, user.id, db)
    summary = db.execute(
        "SELECT count(s.id) AS site_count, "
        "coalesce(sum(ST_Area(s.boundary::geography) / 10000), 0) AS area_hectares, "
        "sum(m.carbon_tonnes_co2e) AS carbon_tonnes_co2e, "
        "avg(m.biodiversity_score) AS biodiversity_score, "
        "max(m.recorded_on) AS latest_measurement, "
        "coalesce(bool_or(m.is_mock), FALSE) AS has_mock_data "
        "FROM sites s JOIN projects p ON p.id = s.project_id "
        "LEFT JOIN LATERAL (SELECT * FROM site_measurements WHERE site_id = s.id "
        "ORDER BY recorded_on DESC LIMIT 1) m ON TRUE "
        "WHERE p.id = %s AND p.owner_id = %s",
        (project_id, user.id),
    ).fetchone()
    return {"project_id": project_id, **summary}


@router.get("/sites/{site_id}/measurements", response_model=SiteMeasurements)
def site_measurements(site_id: UUID, user: CurrentUser, db: Database):
    owned_site(site_id, user.id, db)
    measurements = db.execute(
        "SELECT * FROM (SELECT m.recorded_on, m.carbon_tonnes_co2e, "
        "m.biodiversity_score, m.is_mock FROM site_measurements m "
        "JOIN sites s ON s.id = m.site_id JOIN projects p ON p.id = s.project_id "
        "WHERE m.site_id = %s AND p.owner_id = %s "
        "ORDER BY m.recorded_on DESC LIMIT 120) recent ORDER BY recorded_on",
        (site_id, user.id),
    ).fetchall()
    return {"site_id": site_id, "measurements": measurements}


DEMO_SITES = (
    (
        "Canopy restoration",
        [
            [76.10, 11.61],
            [76.116, 11.613],
            [76.112, 11.625],
            [76.098, 11.621],
            [76.10, 11.61],
        ],
    ),
    (
        "Riparian corridor",
        [
            [76.12, 11.60],
            [76.128, 11.607],
            [76.137, 11.605],
            [76.132, 11.598],
            [76.12, 11.60],
        ],
    ),
    (
        "Community woodland",
        [
            [76.126, 11.618],
            [76.139, 11.619],
            [76.142, 11.63],
            [76.13, 11.632],
            [76.126, 11.618],
        ],
    ),
)


@router.post("/projects/demo", response_model=ProjectPublic, status_code=201)
def create_demo_project(user: CurrentUser, db: Database, response: Response):
    project = db.execute(
        "INSERT INTO projects (owner_id, name, description, is_demo) "
        "VALUES (%s, %s, %s, TRUE) ON CONFLICT (owner_id) WHERE is_demo DO NOTHING "
        "RETURNING id, owner_id, name, description, created_at, is_demo",
        (
            user.id,
            "Western Ghats restoration",
            "Sample workspace with illustrative boundaries and synthetic environmental data. "
            "For demonstration only; not measured or scientifically validated.",
        ),
    ).fetchone()
    if project is None:
        response.status_code = 200
        return db.execute(
            "SELECT id, owner_id, name, description, created_at, is_demo FROM projects "
            "WHERE owner_id = %s AND is_demo",
            (user.id,),
        ).fetchone()

    for index, (name, ring) in enumerate(DEMO_SITES):
        site = db.execute(
            "INSERT INTO sites (project_id, name, boundary) "
            "VALUES (%s, %s, ST_ForcePolygonCCW(ST_GeomFromGeoJSON(%s))) "
            "RETURNING id, ST_Area(boundary::geography) / 10000 AS hectares",
            (
                project["id"],
                name,
                json.dumps({"type": "Polygon", "coordinates": [ring]}),
            ),
        ).fetchone()
        for month in range(12):
            # Fixed Sep 2025-Aug 2026 dates make the demonstration reproducible.
            absolute_month = 2025 * 12 + 8 + month
            recorded_on = date(absolute_month // 12, absolute_month % 12 + 1, 1)
            carbon = round(site["hectares"] * (3.4 + index * 0.35 + month * 0.17), 3)
            biodiversity = round(48 + index * 6 + month * 1.8, 2)
            db.execute(
                "INSERT INTO site_measurements (site_id, recorded_on, carbon_tonnes_co2e, "
                "biodiversity_score, is_mock) VALUES (%s, %s, %s, %s, TRUE)",
                (site["id"], recorded_on, carbon, biodiversity),
            )
    return project
