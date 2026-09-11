import { createAccessToken } from "../../src/shared/auth/auth.token";
import { createAuthSession } from "../../src/shared/auth/auth.sessions";
import type { Env } from "../../src/shared/env";

export const TEST_LOGIN_PASSWORD = "test-auth-password";
export const TEST_AUTH_PASSWORD_HASH =
	"NtMqbdxDRxbhWz8Mn1LvjL055rVCnQYYMSRr9-iwYvk";
export const TEST_AUTH_PASSWORD_SALT =
	"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
export const TEST_AUTH_PASSWORD_ITERATIONS = "100000";
export const TEST_AUTH_JWT_SECRET =
	"test-auth-jwt-secret-with-at-least-256-bits-of-fake-test-entropy";
export const TEST_AUTH_TOKEN_TTL_SECONDS = "3600";
export const TEST_AUTH_RENEW_WINDOW_SECONDS = "900";
export const TEST_AUTH_MAX_SESSION_SECONDS = "28800";

export function createTestRateLimiter(success = true): Env["AUTH_RATE_LIMITER"] {
	return {
		limit: async () => ({ success }),
	};
}

type TestAuthSessionRow = {
	id: string;
	subject: string;
	device_id: string | null;
	device_name: string | null;
	platform: string | null;
	device_model: string | null;
	app_version: string | null;
	user_agent: string | null;
	ip_address: string | null;
	country: string | null;
	created_at: number;
	last_seen_at: number;
	expires_at: number;
	revoked_at: number | null;
};

type TestD1Result = {
	success: boolean;
	meta: { changes: number };
	results?: TestAuthSessionRow[];
};

class TestD1PreparedStatement {
	private params: unknown[] = [];

	constructor(
		private readonly sql: string,
		private readonly rows: Map<string, TestAuthSessionRow>,
		private readonly operations: string[],
	) {}

	bind(...params: unknown[]): TestD1PreparedStatement {
		this.params = params;

		return this;
	}

	async first<T = unknown>(): Promise<T | null> {
		this.operations.push(this.sql);

		if (this.sql.includes("FROM auth_sessions") && this.sql.includes("WHERE id = ?1")) {
			const [id, subject, allowExpired, nowSeconds] = this.params;
			const row = this.rows.get(String(id));

			if (
				!row ||
				row.subject !== subject ||
				row.revoked_at !== null ||
				(Number(allowExpired) !== 1 && row.expires_at <= Number(nowSeconds))
			) {
				return null;
			}

			return { ...row } as T;
		}

		return null;
	}

	async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: object }> {
		this.operations.push(this.sql);

		if (this.sql.includes("FROM auth_sessions") && this.sql.includes("ORDER BY")) {
			const [subject, nowSeconds, currentSessionId] = this.params;
			const results = [...this.rows.values()]
				.filter(
					(row) =>
						row.subject === subject &&
						row.revoked_at === null &&
						row.expires_at > Number(nowSeconds),
				)
				.sort((a, b) => {
					if (a.id === currentSessionId) return -1;
					if (b.id === currentSessionId) return 1;

					return b.last_seen_at - a.last_seen_at;
				})
				.map((row) => ({ ...row }) as T);

			return { results, success: true, meta: {} };
		}

		return { results: [], success: true, meta: {} };
	}

	async run(): Promise<TestD1Result> {
		this.operations.push(this.sql);
		let changes = 0;

		if (this.sql.includes("INSERT INTO auth_sessions")) {
			const [
				id,
				subject,
				deviceId,
				deviceName,
				platform,
				deviceModel,
				appVersion,
				userAgent,
				ipAddress,
				country,
				createdAt,
				lastSeenAt,
				expiresAt,
			] = this.params;

			this.rows.set(String(id), {
				id: String(id),
				subject: String(subject),
				device_id: deviceId === null ? null : String(deviceId),
				device_name: deviceName === null ? null : String(deviceName),
				platform: platform === null ? null : String(platform),
				device_model: deviceModel === null ? null : String(deviceModel),
				app_version: appVersion === null ? null : String(appVersion),
				user_agent: userAgent === null ? null : String(userAgent),
				ip_address: ipAddress === null ? null : String(ipAddress),
				country: country === null ? null : String(country),
				created_at: Number(createdAt),
				last_seen_at: Number(lastSeenAt),
				expires_at: Number(expiresAt),
				revoked_at: null,
			});
			changes = 1;
		} else if (this.sql.includes("device_id = ?3")) {
			const [nowSeconds, subject, deviceId] = this.params;

			for (const row of this.rows.values()) {
				if (
					row.subject === subject &&
					row.device_id === deviceId &&
					row.revoked_at === null &&
					row.expires_at > Number(nowSeconds)
				) {
					row.revoked_at = Number(nowSeconds);
					changes += 1;
				}
			}
		} else if (this.sql.includes("UPDATE auth_sessions SET last_seen_at")) {
			const [lastSeenAt, id] = this.params;
			const row = this.rows.get(String(id));

			if (row) {
				row.last_seen_at = Number(lastSeenAt);
				changes = 1;
			}
		} else if (this.sql.includes("id <> ?3")) {
			const [nowSeconds, subject, currentSessionId] = this.params;

			for (const row of this.rows.values()) {
				if (
					row.subject === subject &&
					row.id !== currentSessionId &&
					row.revoked_at === null &&
					row.expires_at > Number(nowSeconds)
				) {
					row.revoked_at = Number(nowSeconds);
					changes += 1;
				}
			}
		} else if (this.sql.includes("SET revoked_at = COALESCE")) {
			const [nowSeconds, id, subject] = this.params;
			const row = this.rows.get(String(id));

			if (row && row.subject === subject) {
				if (row.revoked_at === null) {
					row.revoked_at = Number(nowSeconds);
					changes = 1;
				}
			}
		} else if (this.sql.includes("DELETE FROM auth_sessions")) {
			const [deleteBefore] = this.params;

			for (const [id, row] of this.rows) {
				if (
					row.expires_at <= Number(deleteBefore) ||
					(row.revoked_at !== null && row.revoked_at <= Number(deleteBefore))
				) {
					this.rows.delete(id);
					changes += 1;
				}
			}
		}

		return { success: true, meta: { changes } };
	}
}

export interface TestAuthD1Database extends D1Database {
	readonly rows: Map<string, TestAuthSessionRow>;
	readonly operations: string[];
}

export function createTestAuthDb(
	initialRows: TestAuthSessionRow[] = [],
): TestAuthD1Database {
	const rows = new Map(initialRows.map((row) => [row.id, { ...row }]));
	const operations: string[] = [];

	return {
		rows,
		operations,
		prepare(sql: string) {
			return new TestD1PreparedStatement(sql, rows, operations);
		},
	} as unknown as TestAuthD1Database;
}

export async function createAuthHeaders(env: Env): Promise<HeadersInit> {
	const nowSeconds = Math.floor(Date.now() / 1000);
	const request = new Request("http://example.com/test-auth-helper");
	const session = await createAuthSession(env, request, {}, nowSeconds);
	const token = await createAccessToken(env, nowSeconds, {
		sessionId: session.id,
		sessionStartedAt: session.createdAt,
	});

	return {
		Authorization: `Bearer ${token.token}`,
	};
}
