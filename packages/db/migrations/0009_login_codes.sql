CREATE TABLE IF NOT EXISTS login_code (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_code_expires_idx ON login_code(expires_at);
