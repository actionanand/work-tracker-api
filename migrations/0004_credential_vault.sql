CREATE TABLE credential_vault_meta (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	crypto_version INTEGER NOT NULL CHECK (crypto_version = 1),
	kdf TEXT NOT NULL CHECK (kdf = 'PBKDF2-SHA-256'),
	kdf_iterations INTEGER NOT NULL CHECK (kdf_iterations BETWEEN 100000 AND 2000000),
	salt TEXT NOT NULL,
	key_check_iv TEXT NOT NULL,
	key_check_ciphertext TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE TABLE credentials (
	id TEXT PRIMARY KEY NOT NULL,
	crypto_version INTEGER NOT NULL CHECK (crypto_version = 1),
	iv TEXT NOT NULL,
	ciphertext TEXT NOT NULL,
	revision INTEGER NOT NULL CHECK (revision >= 1),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX idx_credentials_updated_at ON credentials (updated_at DESC, id ASC);
