CREATE TABLE IF NOT EXISTS alter_controls (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	alter_sprint_enabled_until INTEGER,
	alter_release_enabled_until INTEGER,
	updated_at INTEGER NOT NULL
);
