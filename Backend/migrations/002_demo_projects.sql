ALTER TABLE projects ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;

-- The sample workspace can be requested repeatedly without duplicating data.
CREATE UNIQUE INDEX projects_one_demo_per_owner ON projects (owner_id) WHERE is_demo;
