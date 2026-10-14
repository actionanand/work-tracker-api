import type { Env } from "../../shared/env";
import { domainError } from "../../shared/http/managed-write";
import type { Credential, CredentialEnvelope, CredentialUpdate, CredentialVault, VaultInitialization } from "./credential.types";

interface CredentialRow {
	id: string;
	crypto_version: 1;
	iv: string;
	ciphertext: string;
	revision: number;
	created_at: number;
	updated_at: number;
}

interface VaultRow {
	crypto_version: 1;
	kdf: "PBKDF2-SHA-256";
	kdf_iterations: number;
	salt: string;
	key_check_iv: string;
	key_check_ciphertext: string;
	created_at: number;
	updated_at: number;
}

function credential(row: CredentialRow): Credential {
	return {
		id: row.id, cryptoVersion: row.crypto_version, iv: row.iv, ciphertext: row.ciphertext,
		revision: row.revision, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
	};
}

function vault(row: VaultRow): CredentialVault {
	return {
		initialized: true, cryptoVersion: row.crypto_version, kdf: row.kdf, kdfIterations: row.kdf_iterations,
		salt: row.salt, keyCheckIv: row.key_check_iv, keyCheckCiphertext: row.key_check_ciphertext,
		createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
	};
}

const notFound = () => domainError(404, "Credential not found", "CREDENTIAL_NOT_FOUND");

export async function getCredentialVault(env: Env): Promise<CredentialVault> {
	const row = await env.AUTH_DB.prepare(
		"SELECT crypto_version, kdf, kdf_iterations, salt, key_check_iv, key_check_ciphertext, created_at, updated_at FROM credential_vault_meta WHERE id = 1",
	).first<VaultRow>();
	return row ? vault(row) : { initialized: false };
}

export async function initializeCredentialVault(env: Env, input: VaultInitialization): Promise<CredentialVault> {
	const now = Date.now();
	const result = await env.AUTH_DB.prepare(
		`INSERT INTO credential_vault_meta (id, crypto_version, kdf, kdf_iterations, salt, key_check_iv, key_check_ciphertext, created_at, updated_at)
		 VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING
		 RETURNING crypto_version, kdf, kdf_iterations, salt, key_check_iv, key_check_ciphertext, created_at, updated_at`,
	).bind(input.cryptoVersion, input.kdf, input.kdfIterations, input.salt, input.keyCheckIv, input.keyCheckCiphertext, now, now).all<VaultRow>();
	if (!result.results.length) throw domainError(409, "Credential Vault is already initialized", "CREDENTIAL_VAULT_ALREADY_INITIALIZED");
	return vault(result.results[0]);
}

export async function listCredentials(env: Env) {
	const result = await env.AUTH_DB.prepare(
		"SELECT id, crypto_version, iv, ciphertext, revision, created_at, updated_at FROM credentials ORDER BY updated_at DESC, id ASC",
	).all<CredentialRow>();
	const data = result.results.map(credential);
	return { data, count: data.length };
}

export async function getCredential(env: Env, id: string): Promise<Credential> {
	const row = await env.AUTH_DB.prepare(
		"SELECT id, crypto_version, iv, ciphertext, revision, created_at, updated_at FROM credentials WHERE id = ?",
	).bind(id).first<CredentialRow>();
	if (!row) throw notFound();
	return credential(row);
}

export async function createCredential(env: Env, input: CredentialEnvelope): Promise<Credential> {
	if (!(await getCredentialVault(env)).initialized) throw domainError(409, "Credential Vault is not initialized", "CREDENTIAL_VAULT_NOT_INITIALIZED");
	const now = Date.now();
	const result = await env.AUTH_DB.prepare(
		`INSERT INTO credentials (id, crypto_version, iv, ciphertext, revision, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 1, ?, ?) RETURNING id, crypto_version, iv, ciphertext, revision, created_at, updated_at`,
	).bind(crypto.randomUUID(), input.cryptoVersion, input.iv, input.ciphertext, now, now).all<CredentialRow>();
	return credential(result.results[0]);
}

export async function updateCredential(env: Env, id: string, input: CredentialUpdate): Promise<Credential> {
	const result = await env.AUTH_DB.prepare(
		`UPDATE credentials SET crypto_version = ?, iv = ?, ciphertext = ?, revision = revision + 1, updated_at = ?
		 WHERE id = ? AND revision = ? RETURNING id, crypto_version, iv, ciphertext, revision, created_at, updated_at`,
	).bind(input.cryptoVersion, input.iv, input.ciphertext, Date.now(), id, input.expectedRevision).all<CredentialRow>();
	if (result.results[0]) return credential(result.results[0]);
	await getCredential(env, id);
	throw domainError(409, "Credential changed on another device", "CREDENTIAL_VERSION_CONFLICT");
}

export async function deleteCredential(env: Env, id: string): Promise<void> {
	const result = await env.AUTH_DB.prepare("DELETE FROM credentials WHERE id = ?").bind(id).run();
	if (!result.meta.changes) throw notFound();
}

export async function bulkDeleteCredentials(env: Env, ids: string[]) {
	// D1 batch is transactional. Missing rows are no-ops, not SQL failures.
	const results = await env.AUTH_DB.batch(ids.map((id) => env.AUTH_DB.prepare("DELETE FROM credentials WHERE id = ?").bind(id)));
	const failed = ids.filter((_, index) => !results[index].meta.changes).map((id) => ({ id, deleted: false, error: "Credential not found", code: "CREDENTIAL_NOT_FOUND" }));
	return { requested: ids.length, deleted: ids.length - failed.length, failed, allSucceeded: failed.length === 0 };
}
