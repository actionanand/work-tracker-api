CREATE TABLE IF NOT EXISTS work_calendar_settings (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	week_off_days TEXT NOT NULL,
	updated_at INTEGER NOT NULL
);
