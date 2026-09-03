import { createAccessToken } from "../../src/shared/auth/auth.token";
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

export function createTestRateLimiter(success = true): Env["AUTH_RATE_LIMITER"] {
	return {
		limit: async () => ({ success }),
	};
}

export async function createAuthHeaders(env: Env): Promise<HeadersInit> {
	const token = await createAccessToken(env);

	return {
		Authorization: `Bearer ${token.token}`,
	};
}
