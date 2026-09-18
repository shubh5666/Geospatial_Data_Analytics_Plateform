"""Project and site endpoints, scoped to the authenticated account."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.auth import CurrentUser
from app.database import Database
from app.geometry import PolygonGeometry

router = APIRouter()
PageLimit = Annotated[int, Query(ge=1, le=1000)]
PageOffset = Annotated[int, Query(ge=0, le=2_147_483_647)]


class NamedResource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class ProjectCreate(NamedResource):
    description: str = Field(default="", max_length=10_000)


class ProjectPublic(BaseModel):
    id: UUID
    owner_id: UUID
    name: str
    description: str
    created_at: datetime
    is_demo: bool


class SiteCreate(NamedResource):
    boundary: PolygonGeometry


class SitePublic(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    boundary: PolygonGeometry
    created_at: datetime
    area_hectares: float


def owned_project(project_id: UUID, user_id: UUID, db):
    project = db.execute(
        "SELECT id, owner_id, name, description, created_at, is_demo FROM projects "
        "WHERE id = %s AND owner_id = %s",
        (project_id, user_id),
    ).fetchone()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post(
    "/projects",
    response_model=ProjectPublic,
    status_code=status.HTTP_201_CREATED,
    tags=["Projects"],
)
def create_project(body: ProjectCreate, user: CurrentUser, db: Database):
    return db.execute(
        "INSERT INTO projects (owner_id, name, description) VALUES (%s, %s, %s) "
        "RETURNING id, owner_id, name, description, created_at, is_demo",
        (user.id, body.name, body.description),
    ).fetchone()


@router.get("/projects", response_model=list[ProjectPublic], tags=["Projects"])
def list_projects(
    user: CurrentUser,
    db: Database,
    limit: PageLimit = 100,
    offset: PageOffset = 0,
):
    return db.execute(
        "SELECT id, owner_id, name, description, created_at, is_demo FROM projects "
        "WHERE owner_id = %s ORDER BY created_at, id LIMIT %s OFFSET %s",
        (user.id, limit, offset),
    ).fetchall()


@router.get("/projects/{project_id}", response_model=ProjectPublic, tags=["Projects"])
def get_project(project_id: UUID, user: CurrentUser, db: Database):
    return owned_project(project_id, user.id, db)


@router.post(
    "/projects/{project_id}/sites",
    response_model=SitePublic,
    status_code=status.HTTP_201_CREATED,
    tags=["Sites"],
)
def create_site(project_id: UUID, body: SiteCreate, user: CurrentUser, db: Database):
    owned_project(project_id, user.id, db)
    geometry_json = body.boundary.model_dump_json()
    geometry_check = db.execute(
        "SELECT ST_IsValid(ST_GeomFromGeoJSON(%s), 0) AS valid",
        (geometry_json,),
    ).fetchone()
    if not geometry_check["valid"]:
        raise HTTPException(
            status_code=422,
            detail="Boundary must be a valid polygon without self-intersections or invalid holes",
        )
    # Check ownership in the write as well. Normalize winding, without changing shape.
    site = db.execute(
        "INSERT INTO sites (project_id, name, boundary) "
        "SELECT id, %s, ST_ForcePolygonCCW(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)) "
        "FROM projects WHERE id = %s AND owner_id = %s "
        "RETURNING id, project_id, name, created_at, "
        "ST_AsGeoJSON(boundary, 17, 0)::json AS boundary, "
        "ST_Area(boundary::geography) / 10000 AS area_hectares",
        (body.name, geometry_json, project_id, user.id),
    ).fetchone()
    if site is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return site


@router.get(
    "/projects/{project_id}/sites",
    response_model=list[SitePublic],
    tags=["Sites"],
)
def list_sites(
    project_id: UUID,
    user: CurrentUser,
    db: Database,
    limit: PageLimit = 100,
    offset: PageOffset = 0,
):
    owned_project(project_id, user.id, db)
    return db.execute(
        "SELECT s.id, s.project_id, s.name, s.created_at, "
        "ST_AsGeoJSON(s.boundary, 17, 0)::json AS boundary, "
        "ST_Area(s.boundary::geography) / 10000 AS area_hectares "
        "FROM sites s JOIN projects p ON p.id = s.project_id "
        "WHERE s.project_id = %s AND p.owner_id = %s "
        "ORDER BY s.created_at, s.id LIMIT %s OFFSET %s",
        (project_id, user.id, limit, offset),
    ).fetchall()


@router.get("/sites/{site_id}", response_model=SitePublic, tags=["Sites"])
def get_site(site_id: UUID, user: CurrentUser, db: Database):
    return owned_site(site_id, user.id, db)


def owned_site(site_id: UUID, user_id: UUID, db):
    site = db.execute(
        "SELECT s.id, s.project_id, s.name, s.created_at, "
        "ST_AsGeoJSON(s.boundary, 17, 0)::json AS boundary, "
        "ST_Area(s.boundary::geography) / 10000 AS area_hectares "
        "FROM sites s JOIN projects p ON p.id = s.project_id "
        "WHERE s.id = %s AND p.owner_id = %s",
        (site_id, user_id),
    ).fetchone()
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")
    return site
