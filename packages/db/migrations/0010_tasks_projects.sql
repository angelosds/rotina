CREATE TABLE IF NOT EXISTS project (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_user_name_idx ON project(user_id, lower(name));

CREATE TABLE IF NOT EXISTS task (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  project_id text REFERENCES project(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_date date,
  due_time text CHECK (due_time IS NULL OR due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  tags text NOT NULL DEFAULT '[]',
  completed_at timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_user_due_idx ON task(user_id, due_date);
CREATE INDEX IF NOT EXISTS task_project_idx ON task(project_id);
CREATE INDEX IF NOT EXISTS task_user_completed_idx ON task(user_id, completed_at);
