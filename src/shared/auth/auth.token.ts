import type { Env } from "../env";
import {
	AUTH_ALGORITHM,
	AUTH_AUDIENCE,
	AUTH_ISSUER,
	AUTH_MAX_SESSION_SECONDS_MAX,
	AUTH_SUBJECT,
	AUTH_TOKEN_TTL_SECONDS_DEFAULT,
	AUTH_TOKEN_TTL_SECONDS_MAX,
	AUTH_TOKEN_TTL_SECONDS_MIN,
} from "./auth.constants";
import {
	base64UrlDecode,
	base64UrlDecodeJson,
	base64UrlEncode,
	base64UrlEncodeJson,
	signHmacSha256,
	verifyHmacSha256,
} from "./auth.crypto";
import { AuthConfigurationError } from "./auth.errors";
import { validatePasswordConfiguration } from "./auth.password";
import type { AuthJwtHeader, AuthTokenPayload } from "./auth.types";

function isNonEmptySecret(value: string | undefined): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

export function getAuthTokenTtlSeconds(env: Env): number {
	const raw = env.AUTH_TOKEN_TTL_SECONDS?.trim();
	const value = raw ? Number(raw) : AUTH_TOKEN_TTL_SECONDS_DEFAULT;

	if (
		!Number.isInteger(value) ||
		value < AUTH_TOKEN_TTL_SECONDS_MIN ||
		value > AUTH_TOKEN_TTL_SECONDS_MAX
	) {
		throw new AuthConfigurationError("AUTH_CONFIG_TTL_INVALID");
	}

	return value;
}

export function getAuthRenewWindowSeconds(env: Env): number {
	const tokenTtlSeconds = getAuthTokenTtlSeconds(env);
	const raw = env.AUTH_RENEW_WINDOW_SECONDS?.trim();
	const value = raw ? Number(raw) : Number.NaN;

	if (!Number.isInteger(value) || value <= 0 || value >= tokenTtlSeconds) {
		throw new AuthConfigurationError("AUTH_CONFIG_RENEW_WINDOW_INVALID");
	}

	return value;
}

export function getAuthMaxSessionSeconds(env: Env): number {
	const tokenTtlSeconds = getAuthTokenTtlSeconds(env);
	const raw = env.AUTH_MAX_SESSION_SECONDS?.trim();
	const value = raw ? Number(raw) : Number.NaN;

	if (
		!Number.isInteger(value) ||
		value < tokenTtlSeconds ||
		value > AUTH_MAX_SESSION_SECONDS_MAX
	) {
		throw new AuthConfigurationError("AUTH_CONFIG_MAX_SESSION_INVALID");
	}

	return value;
}

export function validateAuthConfiguration(env: Env): void {
	if (!isNonEmptySecret(env.AUTH_JWT_SECRET)) {
		throw new AuthConfigurationError("AUTH_CONFIG_JWT_SECRET_MISSING");
	}

	validatePasswordConfiguration(env);
	getAuthTokenTtlSeconds(env);
	getAuthRenewWindowSeconds(env);
	getAuthMaxSessionSeconds(env);
}

function isAuthPayload(value: unknown): value is AuthTokenPayload {
	const payload = value as Partial<AuthTokenPayload>;

	return (
		typeof payload === "object" &&
		payload !== null &&
		payload.sub === AUTH_SUBJECT &&
		payload.iss === AUTH_ISSUER &&
		payload.aud === AUTH_AUDIENCE &&
		typeof payload.iat === "number" &&
		Number.isInteger(payload.iat) &&
		typeof payload.exp === "number" &&
		Number.isInteger(payload.exp) &&
		typeof payload.jti === "string" &&
		payload.jti.length > 0 &&
		typeof payload.sid === "string" &&
		payload.sid.length > 0 &&
		(payload.sessionStartedAt === undefined ||
			(typeof payload.sessionStartedAt === "number" &&
				Number.isInteger(payload.sessionStartedAt)))
	);
}

export async function createAccessToken(
	env: Env,
	nowSeconds = Math.floor(Date.now() / 1000),
	options: { sessionStartedAt?: number; sessionId?: string } = {},
): Promise<{ token: string; payload: AuthTokenPayload; expiresIn: number }> {
	validateAuthConfiguration(env);

	const tokenTtlSeconds = getAuthTokenTtlSeconds(env);
	const maxSessionSeconds = getAuthMaxSessionSeconds(env);
	const sessionStartedAt = options.sessionStartedAt ?? nowSeconds;
	const sessionId = options.sessionId ?? crypto.randomUUID();
	const sessionExpiresAt = sessionStartedAt + maxSessionSeconds;
	const exp = Math.min(nowSeconds + tokenTtlSeconds, sessionExpiresAt);
	const expiresIn = exp - nowSeconds;

	if (
		!Number.isInteger(sessionStartedAt) ||
		sessionStartedAt > nowSeconds ||
		sessionId.trim().length === 0 ||
		expiresIn <= 0
	) {
		throw new AuthConfigurationError("AUTH_CONFIG_MAX_SESSION_INVALID");
	}

	const header: AuthJwtHeader = {
		alg: AUTH_ALGORITHM,
		typ: "JWT",
	};
	const payload: AuthTokenPayload = {
		sub: AUTH_SUBJECT,
		iss: AUTH_ISSUER,
		aud: AUTH_AUDIENCE,
		iat: nowSeconds,
		exp,
		jti: crypto.randomUUID(),
		sid: sessionId,
		sessionStartedAt,
	};
	const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
	const signature = base64UrlEncode(
		await signHmacSha256(env.AUTH_JWT_SECRET, signingInput),
	);

	return {
		token: `${signingInput}.${signature}`,
		payload,
		expiresIn,
	};
}

export function getSessionStartedAt(payload: AuthTokenPayload): number {
	return payload.sessionStartedAt ?? payload.iat;
}

export function getAuthTokenMetadata(
	env: Env,
	payload: AuthTokenPayload,
): {
	expiresAt: string;
	renewAfter: string;
	sessionStartedAt: string;
	sessionExpiresAt: string;
} {
	const renewWindowSeconds = getAuthRenewWindowSeconds(env);
	const maxSessionSeconds = getAuthMaxSessionSeconds(env);
	const sessionStartedAt = getSessionStartedAt(payload);

	return {
		expiresAt: new Date(payload.exp * 1000).toISOString(),
		renewAfter: new Date((payload.exp - renewWindowSeconds) * 1000).toISOString(),
		sessionStartedAt: new Date(sessionStartedAt * 1000).toISOString(),
		sessionExpiresAt: new Date(
			(sessionStartedAt + maxSessionSeconds) * 1000,
		).toISOString(),
	};
}

export async function verifyAccessToken(
	env: Env,
	token: string,
	nowSeconds = Math.floor(Date.now() / 1000),
	options: { enforceSessionLifetime?: boolean } = {},
): Promise<AuthTokenPayload | null> {
	validateAuthConfiguration(env);

	const segments = token.split(".");

	if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
		return null;
	}

	const [encodedHeader, encodedPayload, encodedSignature] = segments;
	const header = base64UrlDecodeJson<Partial<AuthJwtHeader>>(encodedHeader);
	const payload = base64UrlDecodeJson<unknown>(encodedPayload);
	const signature = base64UrlDecode(encodedSignature);

	if (!header || !signature || header.alg !== AUTH_ALGORITHM || header.typ !== "JWT") {
		return null;
	}

	const validSignature = await verifyHmacSha256(
		env.AUTH_JWT_SECRET,
		`${encodedHeader}.${encodedPayload}`,
		signature,
	);

	if (!validSignature || !isAuthPayload(payload)) {
		return null;
	}

	if (payload.iat > nowSeconds || payload.exp <= nowSeconds || payload.exp <= payload.iat) {
		return null;
	}

	if (payload.sessionStartedAt !== undefined) {
		const maxSessionSeconds = getAuthMaxSessionSeconds(env);

		if (
			payload.sessionStartedAt > nowSeconds ||
			payload.sessionStartedAt > payload.iat ||
			(options.enforceSessionLifetime !== false &&
				payload.exp > payload.sessionStartedAt + maxSessionSeconds)
		) {
			return null;
		}
	}

	return payload;
}
