import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import {
	AUTH_AUDIENCE,
	AUTH_ISSUER,
	AUTH_SUBJECT,
	AUTH_TOKEN_TYPE,
} from "../src/shared/auth/auth.constants";
import {
	base64UrlDecode,
	base64UrlEncode,
	base64UrlEncodeJson,
	constantTimeEqual,
	signHmacSha256,
	verifyHmacSha256,
} from "../src/shared/auth/auth.crypto";
import {
	createPasswordVerifier,
	derivePasswordHash,
	getAuthPasswordIterations,
	verifyPassword,
} from "../src/shared/auth/auth.password";
import {
	createAccessToken,
	getAuthTokenTtlSeconds,
	verifyAccessToken,
} from "../src/shared/auth/auth.token";
import type { AuthJwtHeader, AuthTokenPayload } from "../src/shared/auth/auth.types";
import type { Env } from "../src/shared/env";
import {
	createAuthHeaders,
	TEST_AUTH_JWT_SECRET,
	TEST_AUTH_PASSWORD_HASH,
	TEST_AUTH_PASSWORD_ITERATIONS,
	TEST_AUTH_PASSWORD_SALT,
	TEST_AUTH_TOKEN_TTL_SECONDS,
	TEST_LOGIN_PASSWORD,
} from "./helpers/auth";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

function createCountingRateLimiter(success = true) {
	const limit = vi.fn().mockResolvedValue({ success });

	return {
		limit,
		rateLimiter: { limit },
	};
}

function createTestEnv(overrides: Partial<Env> = {}): Env {
	return {
		NOTION_TOKEN: "test-notion-token",
		AUTH_PASSWORD_HASH: TEST_AUTH_PASSWORD_HASH,
		AUTH_PASSWORD_SALT: TEST_AUTH_PASSWORD_SALT,
		AUTH_PASSWORD_ITERATIONS: TEST_AUTH_PASSWORD_ITERATIONS,
		AUTH_JWT_SECRET: TEST_AUTH_JWT_SECRET,
		AUTH_TOKEN_TTL_SECONDS: TEST_AUTH_TOKEN_TTL_SECONDS,
		AUTH_RATE_LIMITER: createCountingRateLimiter().rateLimiter,
		JIRAS_DATA_SOURCE_ID: "test-jiras-data-source-id",
		SPRINTS_DATA_SOURCE_ID: "test-sprints-data-source-id",
		SPRINT_ALLOCATIONS_DATA_SOURCE_ID: "test-sprint-allocations-data-source-id",
		PROJECTS_DATA_SOURCE_ID: "test-projects-data-source-id",
		COMPANIES_DATA_SOURCE_ID: "test-companies-data-source-id",
		TEAMS_DATA_SOURCE_ID: "test-teams-data-source-id",
		WORK_LOGS_DATA_SOURCE_ID: "test-work-logs-data-source-id",
		RELEASE_ITEMS_DATA_SOURCE_ID: "test-release-items-data-source-id",
		FEEDBACK_DATA_SOURCE_ID: "test-feedback-data-source-id",
		WORK_LINKS_DATA_SOURCE_ID: "test-work-links-data-source-id",
		...overrides,
	};
}

async function fetchWorker(
	path: string,
	options: RequestInit = {},
	env = createTestEnv(),
): Promise<Response> {
	const request = new IncomingRequest(
		`http://example.com${path}`,
		options as ConstructorParameters<typeof IncomingRequest>[1],
	);
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);

	await waitOnExecutionContext(ctx);

	return response;
}

function loginRequest(password: unknown): RequestInit {
	return {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ password }),
	};
}

async function createCustomToken(
	env: Env,
	options: {
		header?: Record<string, unknown>;
		payload?: Record<string, unknown>;
		secret?: string;
		nowSeconds?: number;
	} = {},
): Promise<string> {
	const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
	const header = {
		alg: "HS256",
		typ: "JWT",
		...options.header,
	};
	const payload = {
		sub: AUTH_SUBJECT,
		iss: AUTH_ISSUER,
		aud: AUTH_AUDIENCE,
		iat: nowSeconds,
		exp: nowSeconds + 3600,
		jti: "test-jti",
		...options.payload,
	};
	const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
	const signature = base64UrlEncode(
		await signHmacSha256(options.secret ?? env.AUTH_JWT_SECRET, signingInput),
	);

	return `${signingInput}.${signature}`;
}

function stubEmptyNotionFetch() {
	const fetchMock = vi.fn().mockResolvedValue(
		Response.json({
			results: [],
			has_more: false,
			next_cursor: null,
		}),
	);

	vi.stubGlobal("fetch", fetchMock);

	return fetchMock;
}

function expectCorsHeaders(response: Response): void {
	expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
	expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
		"GET, POST, OPTIONS",
	);
	expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
		"Authorization",
	);
	expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
		"Content-Type",
	);
}

function expectAuthServiceUnavailableResponse(response: Response): Promise<unknown> {
	expect(response.status).toBe(500);
	expectCorsHeaders(response);

	return expect(response.json()).resolves.toEqual({
		error: "Authentication service unavailable",
	});
}

describe("Authentication API", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("keeps the root health endpoint public", async () => {
		const response = await fetchWorker("/");

		expect(response.status).toBe(200);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			name: "Work Tracker API",
			status: "ok",
		});
	});

	it("allows CORS preflight without authentication", async () => {
		const response = await fetchWorker("/api/jiras", {
			method: "OPTIONS",
		});

		expect(response.status).toBe(204);
		expectCorsHeaders(response);
		expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
			"Authorization",
		);
		expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
			"Content-Type",
		);
	});

	it("logs in with the configured password and returns a bearer token", async () => {
		const { limit, rateLimiter } = createCountingRateLimiter();
		const env = createTestEnv({ AUTH_RATE_LIMITER: rateLimiter });

		const response = await fetchWorker(
			"/api/auth/login",
			loginRequest(TEST_LOGIN_PASSWORD),
			env,
		);
		const body = (await response.json()) as {
			accessToken: string;
			tokenType: string;
			expiresIn: number;
		};

		expect(response.status).toBe(200);
		expectCorsHeaders(response);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(body.tokenType).toBe(AUTH_TOKEN_TYPE);
		expect(body.expiresIn).toBe(3600);
		expect(await verifyAccessToken(env, body.accessToken)).toEqual(
			expect.objectContaining({
				sub: AUTH_SUBJECT,
				iss: AUTH_ISSUER,
				aud: AUTH_AUDIENCE,
			}),
		);
		expect(limit).toHaveBeenCalledWith({ key: "local-development" });
	});

	it("keeps POST /api/auth/login public before bearer auth middleware", async () => {
		const fetchMock = stubEmptyNotionFetch();

		const response = await fetchWorker(
			"/api/auth/login",
			loginRequest(TEST_LOGIN_PASSWORD),
		);

		expect(response.status).toBe(200);
		expectCorsHeaders(response);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not use GET /api/auth/login as the public login route", async () => {
		const response = await fetchWorker("/api/auth/login");

		expect(response.status).toBe(401);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
		});
	});

	it("uses CF-Connecting-IP as the login rate limit key", async () => {
		const { limit, rateLimiter } = createCountingRateLimiter();
		const env = createTestEnv({ AUTH_RATE_LIMITER: rateLimiter });

		const response = await fetchWorker(
			"/api/auth/login",
			{
				...loginRequest(TEST_LOGIN_PASSWORD),
				headers: {
					"Content-Type": "application/json",
					"CF-Connecting-IP": "203.0.113.10",
				},
			},
			env,
		);

		expect(response.status).toBe(200);
		expect(limit).toHaveBeenCalledWith({ key: "203.0.113.10" });
	});

	it.each([
		["missing JSON body", undefined],
		["null body", null],
		["array body", []],
		["missing password", {}],
		["non-string password", { password: 123 }],
		["empty password", { password: "" }],
		["oversized password", { password: "x".repeat(257) }],
	])("returns 400 for %s", async (_name, body) => {
		const { limit, rateLimiter } = createCountingRateLimiter();
		const requestInit: RequestInit =
			body === undefined
				? { method: "POST" }
				: {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(body),
					};

		const response = await fetchWorker(
			"/api/auth/login",
			requestInit,
			createTestEnv({ AUTH_RATE_LIMITER: rateLimiter }),
		);

		expect(response.status).toBe(400);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			error: "Invalid login request",
		});
		expect(limit).toHaveBeenCalledWith({ key: "local-development" });
	});

	it("returns 400 for malformed JSON", async () => {
		const { limit, rateLimiter } = createCountingRateLimiter();

		const response = await fetchWorker(
			"/api/auth/login",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{",
			},
			createTestEnv({ AUTH_RATE_LIMITER: rateLimiter }),
		);

		expect(response.status).toBe(400);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			error: "Invalid login request",
		});
		expect(limit).toHaveBeenCalledWith({ key: "local-development" });
	});

	it("returns 429 when the login rate limiter denies the request", async () => {
		const { rateLimiter } = createCountingRateLimiter(false);

		const response = await fetchWorker(
			"/api/auth/login",
			loginRequest(TEST_LOGIN_PASSWORD),
			createTestEnv({ AUTH_RATE_LIMITER: rateLimiter }),
		);

		expect(response.status).toBe(429);
		expectCorsHeaders(response);
		expect(response.headers.get("Retry-After")).toBe("60");
		expect(await response.json()).toEqual({
			error: "Too many login attempts",
		});
	});

	it("returns a safe 500 when the login rate limiter throws", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		const limit = vi.fn().mockRejectedValue(new Error("rate limiter failed"));

		const response = await fetchWorker(
			"/api/auth/login",
			loginRequest(TEST_LOGIN_PASSWORD),
			createTestEnv({ AUTH_RATE_LIMITER: { limit } }),
		);

		await expectAuthServiceUnavailableResponse(response);
		expect(consoleError).toHaveBeenCalledWith(
			"AUTH_LOGIN_INTERNAL_ERROR:AUTH_RATE_LIMIT_ERROR",
		);
	});

	it("returns 401 for an incorrect password", async () => {
		const response = await fetchWorker(
			"/api/auth/login",
			loginRequest("wrong-password"),
		);

		expect(response.status).toBe(401);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			error: "Invalid credentials",
		});
	});

	it.each([
		["missing password hash", { AUTH_PASSWORD_HASH: "" }],
		["missing password salt", { AUTH_PASSWORD_SALT: "" }],
		["malformed password hash", { AUTH_PASSWORD_HASH: "not valid!" }],
		["malformed password salt", { AUTH_PASSWORD_SALT: "not valid!" }],
		["missing JWT secret", { AUTH_JWT_SECRET: "" }],
		["too-low password iterations", { AUTH_PASSWORD_ITERATIONS: "99999" }],
		["unsupported password iterations", { AUTH_PASSWORD_ITERATIONS: "600000" }],
		["too-high password iterations", { AUTH_PASSWORD_ITERATIONS: "100001" }],
		["non-numeric password iterations", { AUTH_PASSWORD_ITERATIONS: "nope" }],
		["too-short TTL", { AUTH_TOKEN_TTL_SECONDS: "60" }],
		["too-long TTL", { AUTH_TOKEN_TTL_SECONDS: "86401" }],
		["non-numeric TTL", { AUTH_TOKEN_TTL_SECONDS: "not-a-number" }],
	])("fails closed when auth configuration has %s", async (_name, overrides) => {
		const response = await fetchWorker(
			"/api/auth/login",
			loginRequest(TEST_LOGIN_PASSWORD),
			createTestEnv(overrides),
		);

		await expectAuthServiceUnavailableResponse(response);
	});

	it("rejects 600000 password iterations before PBKDF2 derivation", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		const deriveBits = vi.spyOn(crypto.subtle, "deriveBits");

		const response = await fetchWorker(
			"/api/auth/login",
			loginRequest(TEST_LOGIN_PASSWORD),
			createTestEnv({ AUTH_PASSWORD_ITERATIONS: "600000" }),
		);

		await expectAuthServiceUnavailableResponse(response);
		expect(deriveBits).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith(
			"AUTH_LOGIN_INTERNAL_ERROR:AUTH_CONFIG_ITERATIONS_INVALID",
		);

		deriveBits.mockRestore();
	});

	it("returns a safe 500 when PBKDF2 derivation fails", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		const deriveBits = vi
			.spyOn(crypto.subtle, "deriveBits")
			.mockRejectedValueOnce(new Error("derive failed"));

		const response = await fetchWorker(
			"/api/auth/login",
			loginRequest(TEST_LOGIN_PASSWORD),
		);

		await expectAuthServiceUnavailableResponse(response);
		expect(consoleError).toHaveBeenCalledWith(
			"AUTH_LOGIN_INTERNAL_ERROR:AUTH_PASSWORD_VERIFY_ERROR",
		);
		deriveBits.mockRestore();
	});

	it("logs a safe diagnostic for unsupported PBKDF2 runtime failures", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		const error = new Error("unsupported");
		error.name = "NotSupportedError";
		const deriveBits = vi
			.spyOn(crypto.subtle, "deriveBits")
			.mockRejectedValueOnce(error);

		const response = await fetchWorker(
			"/api/auth/login",
			loginRequest(TEST_LOGIN_PASSWORD),
		);

		await expectAuthServiceUnavailableResponse(response);
		expect(consoleError).toHaveBeenCalledWith(
			"AUTH_LOGIN_INTERNAL_ERROR:AUTH_PASSWORD_VERIFY_UNSUPPORTED_ITERATIONS",
		);
		deriveBits.mockRestore();
	});

	it("returns a safe 500 when JWT signing fails", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		const sign = vi
			.spyOn(crypto.subtle, "sign")
			.mockRejectedValueOnce(new Error("sign failed"));

		const response = await fetchWorker(
			"/api/auth/login",
			loginRequest(TEST_LOGIN_PASSWORD),
		);

		await expectAuthServiceUnavailableResponse(response);
		expect(consoleError).toHaveBeenCalledWith(
			"AUTH_LOGIN_INTERNAL_ERROR:AUTH_TOKEN_SIGN_ERROR",
		);
		sign.mockRestore();
	});

	it("returns auth status for a valid token", async () => {
		const env = createTestEnv();
		const response = await fetchWorker(
			"/api/auth/status",
			{
				headers: await createAuthHeaders(env),
			},
			env,
		);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expectCorsHeaders(response);
		expect(body.authenticated).toBe(true);
		expect(body.subject).toBe(AUTH_SUBJECT);
		expect(body.expiresAt).toEqual(expect.any(String));
	});

	it.each([
		["missing authorization", {}],
		["wrong scheme", { Authorization: "Basic abc" }],
		["extra bearer parts", { Authorization: "Bearer one two" }],
		["malformed token", { Authorization: "Bearer malformed-token" }],
	])("returns generic 401 for %s", async (_name, headers) => {
		const response = await fetchWorker("/api/auth/status", { headers });

		expect(response.status).toBe(401);
		expectCorsHeaders(response);
		expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
		expect(await response.json()).toEqual({
			error: "Unauthorized",
		});
	});

	it("returns generic 401 for expired tokens", async () => {
		const env = createTestEnv();
		const token = await createAccessToken(env, Math.floor(Date.now() / 1000) - 7200);

		const response = await fetchWorker(
			"/api/auth/status",
			{
				headers: { Authorization: `Bearer ${token.token}` },
			},
			env,
		);

		expect(response.status).toBe(401);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
		});
	});

	it.each([
		["bad signature", async (env: Env) => {
			const token = await createAccessToken(env);
			return token.token.replace(/\.[^.]+$/, ".invalidsignature");
		}],
		["wrong issuer", (env: Env) =>
			createCustomToken(env, { payload: { iss: "other-api" } })],
		["wrong audience", (env: Env) =>
			createCustomToken(env, { payload: { aud: "other-app" } })],
		["wrong subject", (env: Env) =>
			createCustomToken(env, { payload: { sub: "someone-else" } })],
		["unsupported algorithm", (env: Env) =>
			createCustomToken(env, { header: { alg: "none" } })],
		["future issued-at", (env: Env) =>
			createCustomToken(env, {
				payload: { iat: Math.floor(Date.now() / 1000) + 60 },
			})],
	])("returns generic 401 for token with %s", async (_name, buildToken) => {
		const env = createTestEnv();
		const token = await buildToken(env);

		const response = await fetchWorker(
			"/api/auth/status",
			{
				headers: { Authorization: `Bearer ${token}` },
			},
			env,
		);

		expect(response.status).toBe(401);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
		});
	});

	it("protects existing API routes before they call Notion", async () => {
		const fetchMock = stubEmptyNotionFetch();

		const response = await fetchWorker("/api/jiras");

		expect(response.status).toBe(401);
		expectCorsHeaders(response);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("fails protected routes closed when auth configuration is invalid", async () => {
		const env = createTestEnv();
		const token = await createAccessToken(env);

		const response = await fetchWorker(
			"/api/auth/status",
			{
				headers: { Authorization: `Bearer ${token.token}` },
			},
			createTestEnv({ AUTH_JWT_SECRET: "" }),
		);

		expect(response.status).toBe(401);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
		});
	});

	it("allows protected API routes when a valid bearer token is supplied", async () => {
		const env = createTestEnv();
		const fetchMock = stubEmptyNotionFetch();

		const response = await fetchWorker(
			"/api/jiras",
			{
				headers: await createAuthHeaders(env),
			},
			env,
		);

		expect(response.status).toBe(200);
		expectCorsHeaders(response);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.notion.com/v1/data_sources/test-jiras-data-source-id/query",
			expect.any(Object),
		);
		expect(await response.json()).toEqual({
			data: [],
			count: 0,
			hasMore: false,
			nextCursor: null,
		});
	});

	it("adds CORS headers to feature-level 500 responses", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const env = createTestEnv();
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("notion failed")));

		const response = await fetchWorker(
			"/api/jiras",
			{
				headers: await createAuthHeaders(env),
			},
			env,
		);

		expect(response.status).toBe(500);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			error: "Failed to retrieve JIRAs",
		});
	});

	it("keeps unknown non-API paths on the common 404", async () => {
		const response = await fetchWorker("/missing");

		expect(response.status).toBe(404);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("keeps unknown API paths protected before the common 404", async () => {
		const env = createTestEnv();
		const unauthenticated = await fetchWorker("/api/random");
		const authenticated = await fetchWorker(
			"/api/random",
			{
				headers: await createAuthHeaders(env),
			},
			env,
		);

		expect(unauthenticated.status).toBe(401);
		expectCorsHeaders(unauthenticated);
		expect(authenticated.status).toBe(404);
		expectCorsHeaders(authenticated);
		expect(await authenticated.json()).toEqual({
			error: "Not found",
		});
	});
});

describe("Authentication crypto helpers", () => {
	it("compares SHA-256 digests without accepting different lengths", () => {
		expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(
			true,
		);
		expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1]))).toBe(
			false,
		);
		expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(
			false,
		);
	});

	it("encodes and decodes base64url bytes", () => {
		const bytes = new TextEncoder().encode("hello?");
		const encoded = base64UrlEncode(bytes);

		expect(encoded).toBe("aGVsbG8_");
		expect(base64UrlDecode(encoded)).toEqual(bytes);
		expect(base64UrlDecode("not valid!")).toBeNull();
		expect(base64UrlDecode("abcde")).toBeNull();
	});

	it("signs and verifies HS256 data", async () => {
		const signature = await signHmacSha256(TEST_AUTH_JWT_SECRET, "payload");

		expect(await verifyHmacSha256(TEST_AUTH_JWT_SECRET, "payload", signature)).toBe(
			true,
		);
		expect(
			await verifyHmacSha256(TEST_AUTH_JWT_SECRET, "tampered", signature),
		).toBe(false);
	});

	it("uses a default token TTL and enforces configured bounds", () => {
		expect(getAuthTokenTtlSeconds(createTestEnv({ AUTH_TOKEN_TTL_SECONDS: undefined }))).toBe(
			3600,
		);
		expect(getAuthTokenTtlSeconds(createTestEnv({ AUTH_TOKEN_TTL_SECONDS: "300" }))).toBe(
			300,
		);
		expect(getAuthTokenTtlSeconds(createTestEnv({ AUTH_TOKEN_TTL_SECONDS: "86400" }))).toBe(
			86400,
		);
		expect(() =>
			getAuthTokenTtlSeconds(createTestEnv({ AUTH_TOKEN_TTL_SECONDS: "299" })),
		).toThrow();
		expect(() =>
			getAuthTokenTtlSeconds(createTestEnv({ AUTH_TOKEN_TTL_SECONDS: "86401" })),
		).toThrow();
	});

	it("uses default password iterations and enforces configured bounds", () => {
		expect(
			getAuthPasswordIterations(
				createTestEnv({ AUTH_PASSWORD_ITERATIONS: undefined }),
			),
		).toBe(100000);
		expect(
			getAuthPasswordIterations(createTestEnv({ AUTH_PASSWORD_ITERATIONS: "100000" })),
		).toBe(100000);
		expect(() =>
			getAuthPasswordIterations(createTestEnv({ AUTH_PASSWORD_ITERATIONS: "99999" })),
		).toThrow();
		expect(() =>
			getAuthPasswordIterations(createTestEnv({ AUTH_PASSWORD_ITERATIONS: "100001" })),
		).toThrow();
		expect(() =>
			getAuthPasswordIterations(createTestEnv({ AUTH_PASSWORD_ITERATIONS: "600000" })),
		).toThrow();
	});

	it("derives a matching verifier for the correct password", async () => {
		expect(await verifyPassword(TEST_LOGIN_PASSWORD, createTestEnv())).toBe(true);
	});

	it("derives a different verifier for the wrong password", async () => {
		expect(await verifyPassword("wrong-password", createTestEnv())).toBe(false);
	});

	it("is deterministic for the same password, salt, and iterations", async () => {
		const salt = base64UrlDecode(TEST_AUTH_PASSWORD_SALT);

		expect(salt).not.toBeNull();
		expect(
			await derivePasswordHash(
				TEST_LOGIN_PASSWORD,
				salt as Uint8Array,
				Number(TEST_AUTH_PASSWORD_ITERATIONS),
			),
		).toEqual(
			await derivePasswordHash(
				TEST_LOGIN_PASSWORD,
				salt as Uint8Array,
				Number(TEST_AUTH_PASSWORD_ITERATIONS),
			),
		);
	});

	it("derives different hashes for the same password with different salts", async () => {
		const firstSalt = new Uint8Array(32).fill(1);
		const secondSalt = new Uint8Array(32).fill(2);

		expect(
			await derivePasswordHash(TEST_LOGIN_PASSWORD, firstSalt, 100000),
		).not.toEqual(
			await derivePasswordHash(TEST_LOGIN_PASSWORD, secondSalt, 100000),
		);
	});

	it("generates verifier values without returning the original password", async () => {
		const verifier = await createPasswordVerifier(TEST_LOGIN_PASSWORD, 100000);

		expect(verifier.hash).toEqual(expect.any(String));
		expect(verifier.salt).toEqual(expect.any(String));
		expect(verifier.iterations).toBe(100000);
		expect(verifier).not.toHaveProperty("password");
		expect(base64UrlDecode(verifier.hash)).toHaveLength(32);
		expect(base64UrlDecode(verifier.salt)).toHaveLength(32);
	});

	it("creates verifier values compatible with Worker password verification", async () => {
		const verifier = await createPasswordVerifier(TEST_LOGIN_PASSWORD);
		const env = createTestEnv({
			AUTH_PASSWORD_HASH: verifier.hash,
			AUTH_PASSWORD_SALT: verifier.salt,
			AUTH_PASSWORD_ITERATIONS: String(verifier.iterations),
		});

		expect(verifier.iterations).toBe(100000);
		expect(await verifyPassword(TEST_LOGIN_PASSWORD, env)).toBe(true);
		expect(await verifyPassword("wrong-password", env)).toBe(false);
	});

	it("creates and verifies JWT-compatible access tokens", async () => {
		const env = createTestEnv();
		const issued = await createAccessToken(env, 1_788_393_600);

		expect(issued.expiresIn).toBe(3600);
		expect(issued.token.split(".")).toHaveLength(3);
		expect(await verifyAccessToken(env, issued.token, 1_788_393_601)).toEqual(
			issued.payload,
		);
		expect(await verifyAccessToken(env, issued.token, 1_788_397_200)).toBeNull();
	});
});
