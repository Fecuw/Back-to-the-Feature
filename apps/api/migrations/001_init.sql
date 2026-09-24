CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub text UNIQUE NOT NULL,
  email text,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('INITIALIZING', 'OBSERVING', 'EDITING', 'SIMULATING', 'CLEARED', 'ENDED', 'ERROR')),
  current_checkpoint text NOT NULL DEFAULT 'cp0',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS sessions_owner_state_idx ON sessions(user_id, state);

CREATE TABLE IF NOT EXISTS progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage_id text NOT NULL,
  cleared_at timestamptz,
  best_time_seconds integer,
  hints_used integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, stage_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
