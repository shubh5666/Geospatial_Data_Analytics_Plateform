CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL CHECK (btrim(full_name) <> ''),
    email VARCHAR(254) NOT NULL CHECK (email = btrim(email) AND email <> ''),
    password_hash TEXT NOT NULL CHECK (password_hash <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL CHECK (btrim(name) <> ''),
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX projects_owner_id_idx ON projects (owner_id);

CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL CHECK (btrim(name) <> ''),
    boundary geometry(POLYGON, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sites_boundary_valid CHECK (ST_IsValid(boundary)),
    CONSTRAINT sites_boundary_not_empty CHECK (NOT ST_IsEmpty(boundary)),
    CONSTRAINT sites_boundary_in_world CHECK (
        ST_XMin(Box3D(boundary)) >= -180 AND ST_XMax(Box3D(boundary)) <= 180
        AND ST_YMin(Box3D(boundary)) >= -90 AND ST_YMax(Box3D(boundary)) <= 90
    )
);

CREATE INDEX sites_project_id_idx ON sites (project_id);
CREATE INDEX sites_boundary_gist_idx ON sites USING GIST (boundary);

-- Illustrative analytics fields chosen for the demo; the PDF does not prescribe
-- a scientific model. Later demo records will be explicitly labeled as mock.
CREATE TABLE site_measurements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    recorded_on DATE NOT NULL,
    carbon_tonnes_co2e NUMERIC(14, 3) NOT NULL
        CHECK (carbon_tonnes_co2e BETWEEN 0 AND 99999999999.999),
    biodiversity_score NUMERIC(5, 2) NOT NULL
        CHECK (biodiversity_score BETWEEN 0 AND 100),
    is_mock BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT site_measurements_site_date_key UNIQUE (site_id, recorded_on)
);
