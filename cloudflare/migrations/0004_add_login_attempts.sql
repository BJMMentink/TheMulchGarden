CREATE TABLE IF NOT EXISTS login_attempts (
  key_digest TEXT PRIMARY KEY,
  window_started INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS login_attempts_window_idx ON login_attempts(window_started);
