import type { Env } from "../env";
import {
	AUTH_ALGORITHM,
	AUTH_AUDIENCE,
	AUTH_ISSUER,
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
		throw new AuthConfigurationError();
	}

	return value;
}

export function validateAuthConfiguration(env: Env): void {
	if (!isNonEmptySecret(env.AUTH_JWT_SECRET)) {
		throw new AuthConfigurationError();
	}

	validatePasswordConfiguration(env);
	getAuthTokenTtlSeconds(env);
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
		payload.jti.length > 0
	);
}

export async function createAccessToken(
	env: Env,
	nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ token: string; payload: AuthTokenPayload; expiresIn: number }> {
	validateAuthConfiguration(env);

	const expiresIn = getAuthTokenTtlSeconds(env);
	const header: AuthJwtHeader = {
		alg: AUTH_ALGORITHM,
		typ: "JWT",
	};
	const payload: AuthTokenPayload = {
		sub: AUTH_SUBJECT,
		iss: AUTH_ISSUER,
		aud: AUTH_AUDIENCE,
		iat: nowSeconds,
		exp: nowSeconds + expiresIn,
		jti: crypto.randomUUID(),
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

export async function verifyAccessToken(
	env: Env,
	token: string,
	nowSeconds = Math.floor(Date.now() / 1000),
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

	return payload;
}
