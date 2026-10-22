-- مرحله ۱: زیرساخت پایگاه داده مرکزی
-- تمام جدول‌ها با کلید UUID و زمان‌های timestamptz ساخته می‌شوند.

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  name_fa text NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_permissions_is_array CHECK (jsonb_typeof(permissions) = 'array'),
  CONSTRAINT roles_name_not_empty CHECK (length(btrim(name_fa)) > 0)
);
CREATE UNIQUE INDEX roles_key_uq ON roles (key);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  full_name text NOT NULL,
  phone text,
  role_id uuid NOT NULL REFERENCES roles (id),
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  password_changed_at timestamptz,
  last_login_at timestamptz,
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT users_username_not_empty CHECK (length(btrim(username)) > 0)
);
CREATE UNIQUE INDEX users_username_active_uq ON users (lower(username)) WHERE deleted_at IS NULL;
CREATE INDEX users_role_id_idx ON users (role_id);
CREATE INDEX users_deleted_at_idx ON users (deleted_at);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text
);
CREATE UNIQUE INDEX sessions_refresh_hash_uq ON sessions (refresh_token_hash);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  username text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  description text,
  metadata jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC, id DESC);
CREATE INDEX audit_logs_user_id_idx ON audit_logs (user_id);
CREATE INDEX audit_logs_action_idx ON audit_logs (action);

CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL
);

INSERT INTO app_settings (key, value) VALUES
  ('workshop.name', '""'::jsonb),
  ('workshop.address', '""'::jsonb),
  ('workshop.phone', '""'::jsonb),
  ('security.idleTimeoutMinutes', '10'::jsonb),
  ('security.maxFailedLogins', '5'::jsonb),
  ('security.lockoutMinutes', '15'::jsonb),
  ('security.sessionDays', '7'::jsonb),
  ('backup.retentionCount', '14'::jsonb);
