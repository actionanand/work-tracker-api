CREATE TABLE IF NOT EXISTS auth_sessions (
	id TEXT PRIMARY KEY,
	subject TEXT NOT NULL,
	device_id TEXT NULL,
	device_name TEXT NULL,
	platform TEXT NULL,
	device_model TEXT NULL,
	app_version TEXT NULL,
	user_agent TEXT NULL,
	ip_address TEXT NULL,
	country TEXT NULL,
	created_at INTEGER NOT NULL,
	last_seen_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	revoked_at INTEGER NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_subject_active
	ON auth_sessions (subject, revoked_at, expires_at, last_seen_at);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_device_active
	ON auth_sessions (subject, device_id, revoked_at, expires_at);

