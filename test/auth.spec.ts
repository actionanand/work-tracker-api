import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { createAuthSession } from "../src/shared/auth/auth.sessions";
import {
	AUTH_AUDIENCE,
	AUTH_ISSUER,
	AUTH_SUBJECT,
	AUTH_TOKEN_TYPE,
} from "../src/shared/auth/auth.constants";
import {
	base64UrlDecode,
	base64UrlDecodeJson,
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
	getAuthMaxSessionSeconds,
	getAuthRenewWindowSeconds,
	getAuthTokenTtlSeconds,
	verifyAccessToken,
} from "../src/shared/auth/auth.token";
import type { AuthJwtHeader, AuthTokenPayload } from "../src/shared/auth/auth.types";
import type { Env } from "../src/shared/env";
import {
	createAuthHeaders,
	createTestAuthDb,
	TEST_AUTH_JWT_SECRET,
	TEST_AUTH_PASSWORD_HASH,
	TEST_AUTH_PASSWORD_ITERATIONS,
	TEST_AUTH_PASSWORD_SALT,
	TEST_AUTH_TOKEN_TTL_SECONDS,
	TEST_AUTH_RENEW_WINDOW_SECONDS,
	TEST_AUTH_MAX_SESSION_SECONDS,
	TEST_LOGIN_PASSWORD,
	type TestAuthD1Database,
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
		AUTH_RENEW_WINDOW_SECONDS: TEST_AUTH_RENEW_WINDOW_SECONDS,
		AUTH_MAX_SESSION_SECONDS: TEST_AUTH_MAX_SESSION_SECONDS,
		AUTH_RATE_LIMITER: createCountingRateLimiter().rateLimiter,
		AUTH_DB: createTestAuthDb(),
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

function loginRequestWithDevice(password: unknown, device: unknown): RequestInit {
	return {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": "Office Orbit Test/1.0",
			"CF-Connecting-IP": "203.0.113.25",
			"CF-IPCountry": "IN",
		},
		body: JSON.stringify({ password, device }),
	};
}

async function createSessionBackedAccessToken(
	env: Env,
	nowSeconds: number,
	options: { sessionStartedAt?: number } = {},
): Promise<Awaited<ReturnType<typeof createAccessToken>>> {
	const sessionStartedAt = options.sessionStartedAt ?? nowSeconds;
	const session = await createAuthSession(
		env,
		new Request("http://example.com/session-backed-token"),
		{},
		sessionStartedAt,
	);

	return createAccessToken(env, nowSeconds, {
		sessionId: session.id,
		sessionStartedAt,
	});
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

function decodeTokenPayload(token: string): AuthTokenPayload {
	const [, encodedPayload] = token.split(".");
	const payload = base64UrlDecodeJson<AuthTokenPayload>(encodedPayload);

	if (!payload) {
		throw new Error("Token payload did not decode");
	}

	return payload;
}

function authHeaders(token: string): HeadersInit {
	return {
		Authorization: `Bearer ${token}`,
	};
}

function authDb(env: Env): TestAuthD1Database {
	return env.AUTH_DB as TestAuthD1Database;
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
		"GET, QUERY, POST, PATCH, DELETE, OPTIONS",
	);
	expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
		"Authorization",
	);
	expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
		"Content-Type",
	);
	expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
		"Accept-Query",
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
		vi.useRealTimers();
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
			expiresAt: string;
			renewAfter: string;
			sessionExpiresAt: string;
		};
		const payload = await verifyAccessToken(env, body.accessToken);

		expect(response.status).toBe(200);
		expectCorsHeaders(response);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(body.tokenType).toBe(AUTH_TOKEN_TYPE);
		expect(body.expiresIn).toBe(3600);
		expect(body.expiresAt).toEqual(expect.any(String));
		expect(body.renewAfter).toEqual(expect.any(String));
		expect(body.sessionExpiresAt).toEqual(expect.any(String));
		expect(payload).toEqual(
			expect.objectContaining({
				sub: AUTH_SUBJECT,
				iss: AUTH_ISSUER,
				aud: AUTH_AUDIENCE,
			}),
		);
		expect(payload?.sessionStartedAt).toBe(payload?.iat);
		expect(payload?.sid).toEqual(expect.any(String));
		expect(authDb(env).rows.get(payload?.sid as string)).toEqual(
			expect.objectContaining({
				id: payload?.sid,
				subject: AUTH_SUBJECT,
				revoked_at: null,
			}),
		);
		expect(limit).toHaveBeenCalledWith({ key: "local-development" });
	});

	it("logs in without optional device metadata", async () => {
		const env = createTestEnv();

		const response = await fetchWorker(
			"/api/auth/login",
			loginRequest(TEST_LOGIN_PASSWORD),
			env,
		);
		const body = (await response.json()) as { accessToken: string };
		const payload = decodeTokenPayload(body.accessToken);
		const session = authDb(env).rows.get(payload.sid as string);

		expect(response.status).toBe(200);
		expect(session).toEqual(
			expect.objectContaining({
				device_id: null,
				device_name: null,
				platform: null,
				device_model: null,
				app_version: null,
			}),
		);
	});

	it("stores and returns validated device metadata for login sessions", async () => {
		const env = createTestEnv();

		const loginResponse = await fetchWorker(
			"/api/auth/login",
			loginRequestWithDevice(TEST_LOGIN_PASSWORD, {
				deviceId: "android-installation-1",
				name: "Samsung Galaxy",
				platform: "android",
				model: "SM-S928B",
				appVersion: "2.3.4",
			}),
			env,
		);
		const loginBody = (await loginResponse.json()) as { accessToken: string };
		const sessionsResponse = await fetchWorker(
			"/api/auth/sessions",
			{ headers: authHeaders(loginBody.accessToken) },
			env,
		);
		const body = (await sessionsResponse.json()) as {
			sessions: Array<Record<string, unknown>>;
		};

		expect(loginResponse.status).toBe(200);
		expect(sessionsResponse.status).toBe(200);
		expect(body.sessions).toHaveLength(1);
		expect(body.sessions[0]).toEqual(
			expect.objectContaining({
				current: true,
				ipAddress: "203.0.113.25",
				country: "IN",
				device: {
					deviceId: "android-installation-1",
					name: "Samsung Galaxy",
					platform: "android",
					model: "SM-S928B",
					appVersion: "2.3.4",
				},
			}),
		);
		expect(body.sessions[0]).not.toHaveProperty("jti");
		expect(body.sessions[0]).not.toHaveProperty("accessToken");
	});

	it.each([
		["non-object device", "android"],
		["array device", []],
		["oversized deviceId", { deviceId: "x".repeat(129) }],
		["oversized name", { name: "x".repeat(129) }],
		["oversized platform", { platform: "x".repeat(33) }],
		["oversized model", { model: "x".repeat(129) }],
		["oversized appVersion", { appVersion: "x".repeat(65) }],
		["non-string deviceId", { deviceId: 123 }],
	])("rejects malformed device metadata: %s", async (_name, device) => {
		const env = createTestEnv();

		const response = await fetchWorker(
			"/api/auth/login",
			loginRequestWithDevice(TEST_LOGIN_PASSWORD, device),
			env,
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid login request",
		});
		expect(authDb(env).rows.size).toBe(0);
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
		["missing renew window", { AUTH_RENEW_WINDOW_SECONDS: undefined }],
		["zero renew window", { AUTH_RENEW_WINDOW_SECONDS: "0" }],
		["negative renew window", { AUTH_RENEW_WINDOW_SECONDS: "-1" }],
		["non-numeric renew window", { AUTH_RENEW_WINDOW_SECONDS: "nope" }],
		["renew window matching TTL", { AUTH_RENEW_WINDOW_SECONDS: "3600" }],
		["renew window exceeding TTL", { AUTH_RENEW_WINDOW_SECONDS: "3601" }],
		["missing max session", { AUTH_MAX_SESSION_SECONDS: undefined }],
		["max session below TTL", { AUTH_MAX_SESSION_SECONDS: "3599" }],
		["non-numeric max session", { AUTH_MAX_SESSION_SECONDS: "nope" }],
		["unreasonably high max session", { AUTH_MAX_SESSION_SECONDS: "86401" }],
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
		expect(body.renewAfter).toEqual(expect.any(String));
		expect(body.sessionStartedAt).toEqual(expect.any(String));
		expect(body.sessionExpiresAt).toEqual(expect.any(String));
		expect(body).not.toHaveProperty("accessToken");
		expect(body).not.toHaveProperty("password");
		expect(body).not.toHaveProperty("jwtSecret");
	});

	it("lists active sessions on demand with the current session first", async () => {
		const env = createTestEnv();
		const nowSeconds = 1_788_393_600;
		const current = await createSessionBackedAccessToken(env, nowSeconds);
		const older = await createSessionBackedAccessToken(env, nowSeconds - 60);
		const expired = await createSessionBackedAccessToken(env, nowSeconds - 120);
		const revoked = await createSessionBackedAccessToken(env, nowSeconds - 180);

		authDb(env).rows.get(older.payload.sid as string)!.last_seen_at =
			nowSeconds + 30;
		authDb(env).rows.get(expired.payload.sid as string)!.expires_at =
			nowSeconds - 1;
		authDb(env).rows.get(revoked.payload.sid as string)!.revoked_at =
			nowSeconds - 1;
		vi.setSystemTime(new Date(nowSeconds * 1000));

		const response = await fetchWorker(
			"/api/auth/sessions",
			{
				headers: authHeaders(current.token),
			},
			env,
		);
		const body = (await response.json()) as {
			sessions: Array<{ id: string; current: boolean }>;
		};

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(body.sessions.map((session) => session.id)).toEqual([
			current.payload.sid,
			older.payload.sid,
		]);
		expect(body.sessions[0].current).toBe(true);
		expect(body.sessions[1].current).toBe(false);
		expect(body.sessions[0]).not.toHaveProperty("accessToken");
		expect(body.sessions[0]).not.toHaveProperty("jti");
	});

	it("requires authentication before listing sessions", async () => {
		const response = await fetchWorker("/api/auth/sessions");

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
		});
	});

	it("does not run the session listing query during login, status, or renewal", async () => {
		const env = createTestEnv();
		const issuedAt = 1_788_393_600;
		vi.setSystemTime(new Date(issuedAt * 1000));

		const loginResponse = await fetchWorker(
			"/api/auth/login",
			loginRequest(TEST_LOGIN_PASSWORD),
			env,
		);
		const loginBody = (await loginResponse.json()) as { accessToken: string };
		vi.setSystemTime(new Date((issuedAt + 3300) * 1000));

		const statusResponse = await fetchWorker(
			"/api/auth/status",
			{
				headers: authHeaders(loginBody.accessToken),
			},
			env,
		);
		const renewResponse = await fetchWorker(
			"/api/auth/renew",
			{
				method: "POST",
				headers: authHeaders(loginBody.accessToken),
			},
			env,
		);

		expect(loginResponse.status).toBe(200);
		expect(statusResponse.status).toBe(200);
		expect(renewResponse.status).toBe(200);
		expect(authDb(env).operations.some((sql) => sql.includes("ORDER BY CASE"))).toBe(
			false,
		);
	});

	it("revokes a target session idempotently without revoking the current session", async () => {
		const env = createTestEnv();
		const nowSeconds = 1_788_393_600;
		const current = await createSessionBackedAccessToken(env, nowSeconds);
		const target = await createSessionBackedAccessToken(env, nowSeconds + 1);

		vi.setSystemTime(new Date((nowSeconds + 60) * 1000));

		const response = await fetchWorker(
			`/api/auth/sessions/${target.payload.sid}`,
			{
				method: "DELETE",
				headers: authHeaders(current.token),
			},
			env,
		);
		const body = await response.json();
		const secondResponse = await fetchWorker(
			`/api/auth/sessions/${target.payload.sid}`,
			{
				method: "DELETE",
				headers: authHeaders(current.token),
			},
			env,
		);

		expect(response.status).toBe(200);
		expect(body).toEqual({
			success: true,
			sessionId: target.payload.sid,
			currentSession: false,
		});
		expect(secondResponse.status).toBe(200);
		expect(authDb(env).rows.get(target.payload.sid as string)?.revoked_at).toEqual(
			expect.any(Number),
		);
		expect(authDb(env).rows.get(current.payload.sid as string)?.revoked_at).toBeNull();
	});

	it("does not allow one subject to revoke another subject's session", async () => {
		const env = createTestEnv();
		const nowSeconds = 1_788_393_600;
		const current = await createSessionBackedAccessToken(env, nowSeconds);
		const currentRow = authDb(env).rows.get(current.payload.sid as string);

		expect(currentRow).toBeDefined();
		authDb(env).rows.set("other-subject-session", {
			...currentRow!,
			id: "other-subject-session",
			subject: "someone-else",
			revoked_at: null,
		});
		vi.setSystemTime(new Date((nowSeconds + 60) * 1000));

		const response = await fetchWorker(
			"/api/auth/sessions/other-subject-session",
			{
				method: "DELETE",
				headers: authHeaders(current.token),
			},
			env,
		);

		expect(response.status).toBe(200);
		expect(authDb(env).rows.get("other-subject-session")?.revoked_at).toBeNull();
	});

	it("revokes the current session on logout", async () => {
		const env = createTestEnv();
		const nowSeconds = 1_788_393_600;
		const token = await createSessionBackedAccessToken(env, nowSeconds);

		vi.setSystemTime(new Date((nowSeconds + 60) * 1000));

		const logoutResponse = await fetchWorker(
			"/api/auth/logout",
			{
				method: "POST",
				headers: authHeaders(token.token),
			},
			env,
		);
		const statusResponse = await fetchWorker(
			"/api/auth/status",
			{
				headers: authHeaders(token.token),
			},
			env,
		);

		expect(logoutResponse.status).toBe(200);
		expect(await logoutResponse.json()).toEqual({ success: true });
		expect(statusResponse.status).toBe(401);
	});

	it("revokes other active sessions while keeping the current session usable", async () => {
		const env = createTestEnv();
		const nowSeconds = 1_788_393_600;
		const current = await createSessionBackedAccessToken(env, nowSeconds);
		const otherOne = await createSessionBackedAccessToken(env, nowSeconds + 1);
		const otherTwo = await createSessionBackedAccessToken(env, nowSeconds + 2);

		vi.setSystemTime(new Date((nowSeconds + 60) * 1000));

		const response = await fetchWorker(
			"/api/auth/sessions/logout-others",
			{
				method: "POST",
				headers: authHeaders(current.token),
			},
			env,
		);
		const body = await response.json();
		const statusResponse = await fetchWorker(
			"/api/auth/status",
			{
				headers: authHeaders(current.token),
			},
			env,
		);

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true, revokedCount: 2 });
		expect(authDb(env).rows.get(current.payload.sid as string)?.revoked_at).toBeNull();
		expect(authDb(env).rows.get(otherOne.payload.sid as string)?.revoked_at).toEqual(
			expect.any(Number),
		);
		expect(authDb(env).rows.get(otherTwo.payload.sid as string)?.revoked_at).toEqual(
			expect.any(Number),
		);
		expect(statusResponse.status).toBe(200);
	});

	it("revokes an earlier same-device session when login creates a fresh one", async () => {
		const env = createTestEnv();
		const firstResponse = await fetchWorker(
			"/api/auth/login",
			loginRequestWithDevice(TEST_LOGIN_PASSWORD, {
				deviceId: "stable-device-id",
				name: "Pixel",
			}),
			env,
		);
		const firstBody = (await firstResponse.json()) as { accessToken: string };
		const firstPayload = decodeTokenPayload(firstBody.accessToken);

		const secondResponse = await fetchWorker(
			"/api/auth/login",
			loginRequestWithDevice(TEST_LOGIN_PASSWORD, {
				deviceId: "stable-device-id",
				name: "Pixel",
			}),
			env,
		);
		const secondBody = (await secondResponse.json()) as { accessToken: string };
		const secondPayload = decodeTokenPayload(secondBody.accessToken);

		expect(secondResponse.status).toBe(200);
		expect(secondPayload.sid).not.toBe(firstPayload.sid);
		expect(authDb(env).rows.get(firstPayload.sid as string)?.revoked_at).toEqual(
			expect.any(Number),
		);
		expect(authDb(env).rows.get(secondPayload.sid as string)?.revoked_at).toBeNull();
	});

	it("rejects tokens when the backing session is missing, revoked, or expired", async () => {
		const env = createTestEnv();
		const missing = await createSessionBackedAccessToken(env, 1_788_393_600);
		const revoked = await createSessionBackedAccessToken(env, 1_788_393_601);
		const expired = await createSessionBackedAccessToken(env, 1_788_393_602);
		const nowSeconds = 1_788_393_700;

		authDb(env).rows.delete(missing.payload.sid as string);
		authDb(env).rows.get(revoked.payload.sid as string)!.revoked_at =
			nowSeconds - 1;
		authDb(env).rows.get(expired.payload.sid as string)!.expires_at =
			nowSeconds - 1;
		vi.setSystemTime(new Date(nowSeconds * 1000));

		for (const token of [missing.token, revoked.token, expired.token]) {
			const response = await fetchWorker(
				"/api/auth/status",
				{
					headers: authHeaders(token),
				},
				env,
			);

			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({
				error: "Unauthorized",
			});
		}
	});

	it("fails closed when the session store is unavailable for protected routes", async () => {
		const env = createTestEnv();
		const token = await createSessionBackedAccessToken(env, 1_788_393_600);
		const response = await fetchWorker(
			"/api/auth/status",
			{
				headers: authHeaders(token.token),
			},
			createTestEnv({
				AUTH_DB: {
					prepare: () => {
						throw new Error("D1 unavailable");
					},
				} as unknown as D1Database,
			}),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
		});
	});

	it("does not renew a revoked session", async () => {
		const env = createTestEnv();
		const token = await createSessionBackedAccessToken(env, 1_788_393_600);

		authDb(env).rows.get(token.payload.sid as string)!.revoked_at =
			1_788_393_700;
		vi.setSystemTime(new Date(1_788_396_900 * 1000));

		const response = await fetchWorker(
			"/api/auth/renew",
			{
				method: "POST",
				headers: authHeaders(token.token),
			},
			env,
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
		});
	});

	it("throttles last_seen_at writes while checking the session every request", async () => {
		const env = createTestEnv();
		const issuedAt = 1_788_393_600;
		const token = await createSessionBackedAccessToken(env, issuedAt);
		const sessionId = token.payload.sid as string;

		vi.setSystemTime(new Date((issuedAt + 299) * 1000));
		const firstResponse = await fetchWorker(
			"/api/auth/status",
			{
				headers: authHeaders(token.token),
			},
			env,
		);

		expect(firstResponse.status).toBe(200);
		expect(authDb(env).rows.get(sessionId)?.last_seen_at).toBe(issuedAt);

		vi.setSystemTime(new Date((issuedAt + 301) * 1000));
		const secondResponse = await fetchWorker(
			"/api/auth/status",
			{
				headers: authHeaders(token.token),
			},
			env,
		);

		expect(secondResponse.status).toBe(200);
		expect(authDb(env).rows.get(sessionId)?.last_seen_at).toBe(issuedAt + 301);
		expect(
			authDb(env).operations.filter((sql) => sql.includes("WHERE id = ?1")),
		).toHaveLength(2);
	});

	it.each([
		["missing authorization", {}],
		["malformed bearer token", { Authorization: "Bearer malformed-token" }],
		[
			"bad signature",
			async (env: Env) => {
				const token = await createAccessToken(env);
				return { Authorization: `Bearer ${token.token.replace(/\.[^.]+$/, ".bad")}` };
			},
		],
		[
			"expired token",
			async (env: Env) => {
				const nowSeconds = 1_788_393_600;
				const token = await createAccessToken(env, nowSeconds - 7200);
				vi.setSystemTime(new Date(nowSeconds * 1000));
				return { Authorization: `Bearer ${token.token}` };
			},
		],
		[
			"wrong issuer",
			async (env: Env) => ({
				Authorization: `Bearer ${await createCustomToken(env, {
					nowSeconds: 1_788_393_600,
					payload: { iss: "other-api", sessionStartedAt: 1_788_393_600 },
				})}`,
			}),
		],
		[
			"wrong audience",
			async (env: Env) => ({
				Authorization: `Bearer ${await createCustomToken(env, {
					nowSeconds: 1_788_393_600,
					payload: { aud: "other-app", sessionStartedAt: 1_788_393_600 },
				})}`,
			}),
		],
		[
			"wrong subject",
			async (env: Env) => ({
				Authorization: `Bearer ${await createCustomToken(env, {
					nowSeconds: 1_788_393_600,
					payload: { sub: "someone-else", sessionStartedAt: 1_788_393_600 },
				})}`,
			}),
		],
		[
			"unsupported algorithm",
			async (env: Env) => ({
				Authorization: `Bearer ${await createCustomToken(env, {
					header: { alg: "none" },
					nowSeconds: 1_788_393_600,
					payload: { sessionStartedAt: 1_788_393_600 },
				})}`,
			}),
		],
	])("returns generic 401 for renew with %s", async (_name, headersOrBuild) => {
		const env = createTestEnv();
		vi.setSystemTime(new Date(1_788_393_600 * 1000));
		const headers =
			typeof headersOrBuild === "function"
				? await headersOrBuild(env)
				: headersOrBuild;

		const response = await fetchWorker(
			"/api/auth/renew",
			{
				method: "POST",
				headers,
			},
			env,
		);

		expect(response.status).toBe(401);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
		});
	});

	it("does not renew a token before the renewal window", async () => {
		const env = createTestEnv();
		const nowSeconds = 1_788_393_600;
		const token = await createSessionBackedAccessToken(env, nowSeconds - 1800);
		vi.setSystemTime(new Date(nowSeconds * 1000));

		const response = await fetchWorker(
			"/api/auth/renew",
			{
				method: "POST",
				headers: { Authorization: `Bearer ${token.token}` },
			},
			env,
		);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expectCorsHeaders(response);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(body.renewed).toBe(false);
		expect(body).not.toHaveProperty("accessToken");
		expect(body.expiresAt).toBe(new Date(token.payload.exp * 1000).toISOString());
		expect(body.renewAfter).toBe(
			new Date((token.payload.exp - 900) * 1000).toISOString(),
		);
		expect(body.sessionExpiresAt).toBe(
			new Date((token.payload.sessionStartedAt as number) * 1000 + 28_800_000).toISOString(),
		);
	});

	it.each([
		["15 minutes remaining", 2700],
		["5 minutes remaining", 3300],
	])("renews a token with %s", async (_name, elapsedSeconds) => {
		const env = createTestEnv();
		const issuedAt = 1_788_393_600;
		const nowSeconds = issuedAt + elapsedSeconds;
		const original = await createSessionBackedAccessToken(env, issuedAt);
		vi.setSystemTime(new Date(nowSeconds * 1000));

		const response = await fetchWorker(
			"/api/auth/renew",
			{
				method: "POST",
				headers: { Authorization: `Bearer ${original.token}` },
			},
			env,
		);
		const body = (await response.json()) as {
			renewed: boolean;
			accessToken: string;
			tokenType: string;
			expiresIn: number;
			expiresAt: string;
			sessionExpiresAt: string;
		};
		const renewedPayload = decodeTokenPayload(body.accessToken);

		expect(response.status).toBe(200);
		expect(body.renewed).toBe(true);
		expect(body.tokenType).toBe(AUTH_TOKEN_TYPE);
		expect(body.expiresIn).toBe(3600);
		expect(renewedPayload.iat).toBe(nowSeconds);
		expect(renewedPayload.exp).toBe(nowSeconds + 3600);
		expect(renewedPayload.jti).not.toBe(original.payload.jti);
		expect(renewedPayload.sessionStartedAt).toBe(original.payload.sessionStartedAt);
		expect(await verifyAccessToken(env, body.accessToken, nowSeconds)).toEqual(
			renewedPayload,
		);
		expect(body.expiresAt).toBe(new Date(renewedPayload.exp * 1000).toISOString());
		expect(body.sessionExpiresAt).toBe(
			new Date((issuedAt + 28_800) * 1000).toISOString(),
		);
	});

	it("renewed tokens authenticate status and protected API routes without calling Notion during renewal", async () => {
		const env = createTestEnv();
		const issuedAt = 1_788_393_600;
		const nowSeconds = issuedAt + 3300;
		const original = await createSessionBackedAccessToken(env, issuedAt);
		const fetchMock = stubEmptyNotionFetch();
		vi.setSystemTime(new Date(nowSeconds * 1000));

		const renewResponse = await fetchWorker(
			"/api/auth/renew",
			{
				method: "POST",
				headers: { Authorization: `Bearer ${original.token}` },
			},
			env,
		);
		const renewBody = (await renewResponse.json()) as { accessToken: string };

		expect(fetchMock).not.toHaveBeenCalled();

		const statusResponse = await fetchWorker(
			"/api/auth/status",
			{
				headers: { Authorization: `Bearer ${renewBody.accessToken}` },
			},
			env,
		);
		const jirasResponse = await fetchWorker(
			"/api/jiras",
			{
				headers: { Authorization: `Bearer ${renewBody.accessToken}` },
			},
			env,
		);

		expect(statusResponse.status).toBe(200);
		expect(jirasResponse.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(await verifyAccessToken(env, original.token, nowSeconds)).toEqual(
			original.payload,
		);
	});

	it("caps renewed token expiry at the absolute session limit", async () => {
		const env = createTestEnv();
		const sessionStartedAt = 1_788_393_600;
		const nowSeconds = sessionStartedAt + 28_200;
		const original = await createSessionBackedAccessToken(env, sessionStartedAt + 25_200, {
			sessionStartedAt,
		});
		vi.setSystemTime(new Date(nowSeconds * 1000));

		const response = await fetchWorker(
			"/api/auth/renew",
			{
				method: "POST",
				headers: { Authorization: `Bearer ${original.token}` },
			},
			env,
		);
		const body = (await response.json()) as {
			renewed: boolean;
			accessToken: string;
			expiresIn: number;
		};
		const renewedPayload = decodeTokenPayload(body.accessToken);

		expect(response.status).toBe(200);
		expect(body.renewed).toBe(true);
		expect(body.expiresIn).toBe(600);
		expect(renewedPayload.exp).toBe(sessionStartedAt + 28_800);
	});

	it("requires reauthentication after the absolute session limit", async () => {
		const env = createTestEnv();
		const sessionStartedAt = 1_788_393_600;
		const nowSeconds = sessionStartedAt + 28_800;
		const original = await createSessionBackedAccessToken(env, sessionStartedAt + 27_000, {
			sessionStartedAt,
		});
		const token = await createCustomToken(env, {
			nowSeconds: sessionStartedAt + 27_000,
			payload: {
				sid: original.payload.sid,
				sessionStartedAt,
				exp: nowSeconds + 300,
			},
		});
		vi.setSystemTime(new Date(nowSeconds * 1000));

		const response = await fetchWorker(
			"/api/auth/renew",
			{
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			},
			env,
		);

		expect(response.status).toBe(401);
		expectCorsHeaders(response);
		expect(await response.json()).toEqual({
			error: "Reauthentication required",
		});
	});

	it("rejects legacy tokens without sid so the user performs one fresh login", async () => {
		const env = createTestEnv();
		const issuedAt = 1_788_393_600;
		const nowSeconds = issuedAt + 3300;
		const legacyToken = await createCustomToken(env, { nowSeconds: issuedAt });
		vi.setSystemTime(new Date(nowSeconds * 1000));

		const response = await fetchWorker(
			"/api/auth/renew",
			{
				method: "POST",
				headers: { Authorization: `Bearer ${legacyToken}` },
			},
			env,
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
		});
	});

	it.each([
		["future sessionStartedAt", { sessionStartedAt: 1_788_393_601 }],
		[
			"sessionStartedAt after iat",
			{ iat: 1_788_393_500, sessionStartedAt: 1_788_393_501 },
		],
		["non-integer sessionStartedAt", { sessionStartedAt: 1.5 }],
		["expired absolute session", { sessionStartedAt: 1_788_393_600 - 28_801 }],
	])("rejects tokens with malformed %s", async (_name, payload) => {
		const env = createTestEnv();
		const nowSeconds = 1_788_393_600;
		const token = await createCustomToken(env, {
			nowSeconds,
			payload: {
				...payload,
				exp: nowSeconds + 3600,
			},
		});

		expect(await verifyAccessToken(env, token, nowSeconds)).toBeNull();
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

	it("validates renewal window and max session configuration", () => {
		expect(getAuthRenewWindowSeconds(createTestEnv())).toBe(900);
		expect(getAuthMaxSessionSeconds(createTestEnv())).toBe(28800);
		expect(() =>
			getAuthRenewWindowSeconds(
				createTestEnv({ AUTH_RENEW_WINDOW_SECONDS: undefined }),
			),
		).toThrow();
		expect(() =>
			getAuthRenewWindowSeconds(createTestEnv({ AUTH_RENEW_WINDOW_SECONDS: "3600" })),
		).toThrow();
		expect(() =>
			getAuthMaxSessionSeconds(createTestEnv({ AUTH_MAX_SESSION_SECONDS: undefined })),
		).toThrow();
		expect(() =>
			getAuthMaxSessionSeconds(createTestEnv({ AUTH_MAX_SESSION_SECONDS: "3599" })),
		).toThrow();
		expect(() =>
			getAuthMaxSessionSeconds(createTestEnv({ AUTH_MAX_SESSION_SECONDS: "86401" })),
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
