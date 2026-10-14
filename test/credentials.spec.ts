import { env as runtimeEnv } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/shared/env";
import type { Credential, CredentialVault } from "../src/features/credentials/credential.types";
import { credentialResponse } from "../src/features/credentials/credential.routes";
import { MAX_CREDENTIAL_BYTES, MAX_CREDENTIAL_REQUEST_BYTES } from "../src/features/credentials/credential.validation";
import authMigration from "../migrations/0001_auth_sessions.sql?raw";
import vaultMigration from "../migrations/0004_credential_vault.sql?raw";
import { managementEnv } from "./helpers/management";
import { createAuthHeaders } from "./helpers/auth";

const base = "/api/credentials";
const missingId = "00000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-10-14T12:00:00Z");
const b64 = (bytes: number, char = "a") => btoa(char.repeat(bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const metadata = { cryptoVersion: 1, kdf: "PBKDF2-SHA-256", kdfIterations: 310000, salt: b64(32), keyCheckIv: b64(12), keyCheckCiphertext: b64(48) };
const envelope = { cryptoVersion: 1, iv: b64(12), ciphertext: b64(64) };
const changed = { ...envelope, iv: b64(12, "b"), ciphertext: b64(100, "b") };
const db = (runtimeEnv as unknown as Env).AUTH_DB;
let env: Env;
let headers: HeadersInit;

async function api(path = base, method = "GET", body?: unknown) {
	const response = await worker.fetch(new Request(`https://example.test${path}`, {
		method, headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
		body: body === undefined ? undefined : JSON.stringify(body),
	}), env);
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(response.headers.get("Pragma")).toBe("no-cache");
	expect(response.headers.get("Accept-Query")).toBeNull();
	return response;
}

async function initialize() {
	const response = await api(`${base}/vault`, "POST", metadata);
	expect(response.status).toBe(201);
	return response.json<CredentialVault>();
}

async function create(input = envelope): Promise<Credential> {
	const response = await api(base, "POST", input);
	expect(response.status).toBe(201);
	return (await response.json<{ data: Credential }>()).data;
}

beforeAll(async () => {
	// Execute the checked-in schema only inside the isolated Vitest D1 binding.
	for (const sql of [authMigration, vaultMigration]) {
		await db.batch(sql.split(";").map((statement) => statement.trim()).filter(Boolean).map((statement) => db.prepare(statement)));
	}
});

beforeEach(async () => {
	await db.batch([
		db.prepare("DROP TRIGGER IF EXISTS credential_delete_failure"),
		db.prepare("DELETE FROM credentials"), db.prepare("DELETE FROM credential_vault_meta"), db.prepare("DELETE FROM auth_sessions"),
	]);
	vi.spyOn(Date, "now").mockReturnValue(now);
	env = { ...managementEnv(), AUTH_DB: db };
	headers = await createAuthHeaders(env);
	vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Credential API must not call Notion"); }));
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Credential Vault metadata with real D1", () => {
	it("returns uninitialized metadata and an empty list before initialization", async () => {
		expect(await (await api(`${base}/vault`)).json()).toEqual({ initialized: false });
		expect(await (await api()).json()).toEqual({ data: [], count: 0 });
	});

	it("initializes once and returns exactly the client metadata on subsequent reads", async () => {
		const result = await initialize();
		expect(result).toEqual({ initialized: true, ...metadata, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
		expect(await (await api(`${base}/vault`)).json()).toEqual(result);
		const conflict = await api(`${base}/vault`, "POST", { ...metadata, salt: b64(32, "b") });
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toEqual({ error: "Credential Vault is already initialized", code: "CREDENTIAL_VAULT_ALREADY_INITIALIZED" });
		expect(await (await api(`${base}/vault`)).json()).toEqual(result);
	});

	it("initializes exactly once under competing requests", async () => {
		const responses = await Promise.all([api(`${base}/vault`, "POST", metadata), api(`${base}/vault`, "POST", metadata)]);
		expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
		expect(await db.prepare("SELECT COUNT(*) AS count FROM credential_vault_meta").first("count")).toBe(1);
	});

	it.each([
		{ cryptoVersion: 2 }, { cryptoVersion: "1" }, { kdf: "Argon2" },
		{ kdfIterations: 99999 }, { kdfIterations: 2000001 }, { kdfIterations: 310000.5 }, { kdfIterations: "310000" },
		{ salt: "" }, { salt: "bad+base64/==" }, { salt: b64(15) }, { salt: b64(65) },
		{ keyCheckIv: b64(11) }, { keyCheckIv: b64(13) }, { keyCheckIv: null },
		{ keyCheckCiphertext: "x" }, { keyCheckCiphertext: b64(1025) },
		{ passphrase: "must-not-be-stored" }, { key: "must-not-be-stored" },
	])("rejects invalid vault metadata %j without storing it", async (override) => {
		const response = await api(`${base}/vault`, "POST", { ...metadata, ...override });
		expect(response.status).toBe(400);
		expect(await (await api(`${base}/vault`)).json()).toEqual({ initialized: false });
	});

	it("contains only encrypted envelope and operational columns in the migration", async () => {
		const columns = async (sql: string) => (await db.prepare(sql).all<{ name: string }>()).results.map((row) => row.name);
		expect(await columns("PRAGMA table_info(credentials)")).toEqual(["id", "crypto_version", "iv", "ciphertext", "revision", "created_at", "updated_at"]);
		expect(await columns("PRAGMA table_info(credential_vault_meta)")).toEqual(["id", "crypto_version", "kdf", "kdf_iterations", "salt", "key_check_iv", "key_check_ciphertext", "created_at", "updated_at"]);
		expect((await db.prepare("PRAGMA index_info(idx_credentials_updated_at)").all<{ name: string }>()).results.map((row) => row.name)).toEqual(["updated_at", "id"]);
		await expect(db.prepare("INSERT INTO credential_vault_meta (id, crypto_version, kdf, kdf_iterations, salt, key_check_iv, key_check_ciphertext, created_at, updated_at) VALUES (2, 1, 'PBKDF2-SHA-256', 310000, 'a', 'a', 'a', 0, 0)").run()).rejects.toThrow();
	});
});

describe("encrypted credential CRUD with real D1", () => {
	it("requires initialization before creation", async () => {
		const response = await api(base, "POST", envelope);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "Credential Vault is not initialized", code: "CREDENTIAL_VAULT_NOT_INITIALIZED" });
		expect(await (await api()).json()).toEqual({ data: [], count: 0 });
	});

	it("creates UUIDs, server timestamps and revision 1, returning only exact envelopes", async () => {
		await initialize();
		const item = await create();
		expect(item.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
		expect(item).toEqual({ id: item.id, ...envelope, revision: 1, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
		expect(await (await api(`${base}/${item.id.toUpperCase()}`)).json()).toEqual({ data: item });
		expect(await (await api()).json()).toEqual({ data: [item], count: 1 });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("sorts by updated_at descending and then ID ascending", async () => {
		await initialize();
		const first = await create(); const second = await create();
		vi.mocked(Date.now).mockReturnValue(now + 1000);
		const newest = await create();
		const body = await (await api()).json<{ data: Credential[]; count: number }>();
		expect(body.data.map((item) => item.id)).toEqual([newest.id, ...[first.id, second.id].sort()]);
		expect(body.count).toBe(3);
	});

	it("increments revision atomically and rejects stale updates without overwriting", async () => {
		await initialize(); const item = await create();
		vi.mocked(Date.now).mockReturnValue(now + 1000);
		const update = await api(`${base}/${item.id}`, "PATCH", { ...changed, expectedRevision: 1 });
		expect(update.status).toBe(200);
		const stored = (await update.json<{ data: Credential }>()).data;
		expect(stored).toEqual({ ...item, ...changed, revision: 2, updatedAt: new Date(now + 1000).toISOString() });
		const stale = await api(`${base}/${item.id}`, "PATCH", { ...envelope, expectedRevision: 1 });
		expect(stale.status).toBe(409);
		expect(await stale.json()).toEqual({ error: "Credential changed on another device", code: "CREDENTIAL_VERSION_CONFLICT" });
		expect(await (await api(`${base}/${item.id}`)).json()).toEqual({ data: stored });
	});

	it("allows only one competing update at the same revision", async () => {
		await initialize(); const item = await create();
		const results = await Promise.all([
			api(`${base}/${item.id}`, "PATCH", { ...changed, expectedRevision: 1 }),
			api(`${base}/${item.id}`, "PATCH", { ...envelope, expectedRevision: 1 }),
		]);
		expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
		const winner = await results.find((result) => result.status === 200)!.json();
		expect(await (await api(`${base}/${item.id}`)).json()).toEqual(winner);
	});

	it.each(["GET", "PATCH", "DELETE"])("returns a safe 404 for unknown %s targets", async (method) => {
		const response = await api(`${base}/${missingId}`, method, method === "PATCH" ? { ...envelope, expectedRevision: 1 } : undefined);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Credential not found", code: "CREDENTIAL_NOT_FOUND" });
	});

	it("hard-deletes the credential without deleting vault metadata", async () => {
		await initialize(); const item = await create();
		const deleted = await api(`${base}/${item.id}`, "DELETE");
		expect(deleted.status).toBe(204);
		expect(await deleted.text()).toBe("");
		expect(await db.prepare("SELECT COUNT(*) AS count FROM credentials").first("count")).toBe(0);
		expect((await api(`${base}/${item.id}`)).status).toBe(404);
		expect(await (await api(`${base}/vault`)).json()).toMatchObject({ initialized: true });
	});

	it("accepts the maximum ciphertext size without modifying its bytes", async () => {
		await initialize();
		const input = { ...envelope, ciphertext: b64(MAX_CREDENTIAL_BYTES) };
		expect((await create(input)).ciphertext).toBe(input.ciphertext);
	});

	it.each([
		{ cryptoVersion: 2 }, { iv: "" }, { iv: b64(13) }, { ciphertext: "" }, { ciphertext: "abcd==" },
		{ ciphertext: "abc+" }, { ciphertext: "ab" }, { ciphertext: b64(15) }, { ciphertext: b64(MAX_CREDENTIAL_BYTES + 1) },
		{ name: "secret" }, { username: "secret" }, { password: "secret" }, { url: "secret" }, { host: "secret" },
		{ environment: "secret" }, { notes: "secret" }, { tags: ["secret"] }, { credentialType: "secret" },
		{ token: "secret" }, { createdAt: "secret" }, { revision: 42 }, { expectedRevision: 1 },
	])("rejects invalid or plaintext create fields without leaking them (#%#)", async (override) => {
		await initialize();
		const response = await api(base, "POST", { ...envelope, ...override });
		expect(response.status).toBe(400);
		expect(await response.text()).not.toContain("secret");
		expect(await db.prepare("SELECT COUNT(*) AS count FROM credentials").first("count")).toBe(0);
	});

	it.each([undefined, 0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER])("requires a safe expectedRevision (%s)", async (expectedRevision) => {
		await initialize(); const item = await create();
		const response = await api(`${base}/${item.id}`, "PATCH", { ...changed, expectedRevision });
		expect(response.status).toBe(400);
		expect(await (await api(`${base}/${item.id}`)).json()).toEqual({ data: item });
	});

	it("rejects plaintext on PATCH too", async () => {
		await initialize(); const item = await create();
		expect((await api(`${base}/${item.id}`, "PATCH", { ...changed, expectedRevision: 1, password: "must-not-leak" })).status).toBe(400);
		expect(await (await api(`${base}/${item.id}`)).json()).toEqual({ data: item });
	});
});

describe("credential bulk delete with real D1", () => {
	it.each([1, 3, 25])("deletes %s credentials without ciphertext in the result", async (count) => {
		await initialize();
		const items: Credential[] = [];
		for (let index = 0; index < count; index++) items.push(await create());
		const response = await api(`${base}/bulk-delete`, "POST", { credentialIds: items.map((item) => item.id) });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ requested: count, deleted: count, failed: [], allSucceeded: true });
		expect(await (await api()).json()).toEqual({ data: [], count: 0 });
	});

	it.each([
		{}, { credentialIds: [] }, { credentialIds: "bad" }, { credentialIds: [null] },
		{ credentialIds: ["bad"] }, { credentialIds: [missingId.replaceAll("-", "")] },
		{ credentialIds: Array.from({ length: 26 }, () => missingId) },
		{ credentialIds: [missingId], extra: true },
	])("rejects malformed bulk-delete input %j", async (body) => {
		expect((await api(`${base}/bulk-delete`, "POST", body)).status).toBe(400);
	});

	it("rejects duplicates after UUID normalization before deleting anything", async () => {
		await initialize(); const item = await create();
		const response = await api(`${base}/bulk-delete`, "POST", { credentialIds: [item.id, ` ${item.id.toUpperCase()} `] });
		expect(response.status).toBe(400);
		expect((await api(`${base}/${item.id}`)).status).toBe(200);
	});

	it("deletes existing IDs and reports missing IDs without treating no-op deletes as SQL failures", async () => {
		await initialize(); const item = await create();
		const response = await api(`${base}/bulk-delete`, "POST", { credentialIds: [item.id, missingId] });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ requested: 2, deleted: 1, failed: [{ id: missingId, deleted: false, error: "Credential not found", code: "CREDENTIAL_NOT_FOUND" }], allSucceeded: false });
		expect((await api(`${base}/${item.id}`)).status).toBe(404);
	});

	it("rolls back the whole D1 batch on a SQL error and never logs sensitive errors", async () => {
		await initialize(); const first = await create(); const second = await create();
		await db.prepare("CREATE TRIGGER credential_delete_failure BEFORE DELETE ON credentials WHEN OLD.id = (SELECT id FROM credentials ORDER BY id DESC LIMIT 1) BEGIN SELECT RAISE(ABORT, 'sensitive SQL details'); END").run();
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await api(`${base}/bulk-delete`, "POST", { credentialIds: [first.id, second.id].sort() });
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Credential Vault unavailable", code: "CREDENTIAL_VAULT_INTERNAL_ERROR" });
		expect(log.mock.calls).toEqual([["CREDENTIAL_VAULT_INTERNAL_ERROR"]]);
		expect(await db.prepare("SELECT COUNT(*) AS count FROM credentials").first("count")).toBe(2);
	});
});

describe("credential route security", () => {
	it.each([
		[`${base}/vault`, "GET"], [`${base}/vault`, "POST"], [base, "GET"], [base, "POST"],
		[`${base}/${missingId}`, "GET"], [`${base}/${missingId}`, "PATCH"], [`${base}/${missingId}`, "DELETE"], [`${base}/bulk-delete`, "POST"],
	])("requires existing global authentication for %s %s", async (path, method) => {
		const response = await worker.fetch(new Request(`https://example.test${path}`, { method }), env);
		expect(response.status).toBe(401);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("Pragma")).toBe("no-cache");
		expect(fetch).not.toHaveBeenCalled();
	});

	it.each([
		[base, "GET, POST, OPTIONS"], [`${base}/vault`, "GET, POST, OPTIONS"],
		[`${base}/bulk-delete`, "POST, OPTIONS"], [`${base}/${missingId}`, "GET, PATCH, DELETE, OPTIONS"],
	])("advertises only supported methods for %s", async (path, allow) => {
		const response = await api(path, "OPTIONS");
		expect(response.status).toBe(204);
		expect(response.headers.get("Allow")).toBe(allow);
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, QUERY, POST, PATCH, DELETE, OPTIONS");
	});

	it.each([`${base}/vault`, `${base}/bulk-delete`, base])("matches static %s before credential IDs and rejects QUERY", async (path) => {
		const response = await api(path, "QUERY");
		expect(response.status).toBe(405);
	});

	it.each(["abc", missingId.replaceAll("-", ""), "%E0%A4%A"])("safely rejects invalid credential UUID %s", async (segment) => {
		expect((await api(`${base}/${segment}`)).status).toBe(400);
	});

	it("does not expose vault reset or deeper unknown routes", async () => {
		await initialize();
		expect((await api(`${base}/vault`, "DELETE")).status).toBe(405);
		expect((await api(`${base}/vault/reset`, "POST", {})).status).toBe(404);
		expect(await (await api(`${base}/vault`)).json()).toMatchObject({ initialized: true });
	});

	it.each(["not-json", "[]", "null", ""])("rejects invalid JSON body %s", async (body) => {
		const response = await worker.fetch(new Request(`https://example.test${base}`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body }), env);
		expect(response.status).toBe(400);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("rejects oversized requests before parsing or storage", async () => {
		const response = await worker.fetch(new Request(`https://example.test${base}`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "x".repeat(MAX_CREDENTIAL_REQUEST_BYTES + 1) }), env);
		expect(response.status).toBe(413);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("rejects non-JSON media without advertising QUERY", async () => {
		const response = await worker.fetch(new Request(`https://example.test${base}`, { method: "POST", headers: { ...headers, "Content-Type": "text/plain" }, body: "secret" }), env);
		expect(response.status).toBe(415);
		expect(response.headers.get("Accept-Query")).toBeNull();
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("makes the response wrapper idempotent without consuming the body", async () => {
		const original = credentialResponse(Response.json({ initialized: false }));
		expect(credentialResponse(original)).toBe(original);
		expect(await original.json()).toEqual({ initialized: false });
	});

	it("returns a generic uncached error for unavailable D1 metadata without logging SQL or envelope values", async () => {
		const prepare = db.prepare.bind(db);
		env = { ...env, AUTH_DB: {
			prepare(sql: string) {
				if (sql.includes("credential_vault_meta")) throw new Error(`SQL failure with sensitive salt ${metadata.salt}`);
				return prepare(sql);
			},
		} as D1Database };
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await api(`${base}/vault`);
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Credential Vault unavailable", code: "CREDENTIAL_VAULT_INTERNAL_ERROR" });
		expect(log.mock.calls).toEqual([["CREDENTIAL_VAULT_INTERNAL_ERROR"]]);
	});
});
