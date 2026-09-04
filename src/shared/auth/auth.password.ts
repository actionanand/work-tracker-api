import type { Env } from "../env";
import {
	AUTH_PASSWORD_HASH_BYTES,
	AUTH_PASSWORD_ITERATIONS_DEFAULT,
	AUTH_PASSWORD_ITERATIONS_MAX,
	AUTH_PASSWORD_ITERATIONS_MIN,
	AUTH_PASSWORD_SALT_BYTES,
} from "./auth.constants";
import { AuthConfigurationError } from "./auth.errors";
import {
	base64UrlDecode,
	base64UrlEncode,
	constantTimeEqual,
} from "./auth.crypto";

const textEncoder = new TextEncoder();

function isNonEmptySecret(value: string | undefined): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

export function getAuthPasswordIterations(env: Env): number {
	const raw = env.AUTH_PASSWORD_ITERATIONS?.trim();
	const value = raw ? Number(raw) : AUTH_PASSWORD_ITERATIONS_DEFAULT;

	if (
		!Number.isInteger(value) ||
		value < AUTH_PASSWORD_ITERATIONS_MIN ||
		value > AUTH_PASSWORD_ITERATIONS_MAX
	) {
		throw new AuthConfigurationError("AUTH_CONFIG_ITERATIONS_INVALID");
	}

	return value;
}

function decodeStoredBytes(
	value: string,
	expectedLength: number,
	code: "AUTH_CONFIG_HASH_INVALID" | "AUTH_CONFIG_SALT_INVALID",
): Uint8Array {
	const decoded = base64UrlDecode(value.trim());

	if (!decoded || decoded.length !== expectedLength) {
		throw new AuthConfigurationError(code);
	}

	return decoded;
}

export function validatePasswordConfiguration(env: Env): void {
	if (
		!isNonEmptySecret(env.AUTH_PASSWORD_HASH) ||
		!isNonEmptySecret(env.AUTH_PASSWORD_SALT)
	) {
		throw new AuthConfigurationError(
			!isNonEmptySecret(env.AUTH_PASSWORD_HASH)
				? "AUTH_CONFIG_HASH_MISSING"
				: "AUTH_CONFIG_SALT_MISSING",
		);
	}

	getAuthPasswordIterations(env);
	decodeStoredBytes(
		env.AUTH_PASSWORD_HASH,
		AUTH_PASSWORD_HASH_BYTES,
		"AUTH_CONFIG_HASH_INVALID",
	);
	decodeStoredBytes(
		env.AUTH_PASSWORD_SALT,
		AUTH_PASSWORD_SALT_BYTES,
		"AUTH_CONFIG_SALT_INVALID",
	);
}

export async function derivePasswordHash(
	password: string,
	salt: Uint8Array,
	iterations: number,
): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations,
			hash: "SHA-256",
		},
		key,
		AUTH_PASSWORD_HASH_BYTES * 8,
	);

	return new Uint8Array(bits);
}

export async function verifyPassword(
	password: string,
	env: Env,
): Promise<boolean> {
	const iterations = getAuthPasswordIterations(env);
	const salt = decodeStoredBytes(
		env.AUTH_PASSWORD_SALT,
		AUTH_PASSWORD_SALT_BYTES,
		"AUTH_CONFIG_SALT_INVALID",
	);
	const expectedHash = decodeStoredBytes(
		env.AUTH_PASSWORD_HASH,
		AUTH_PASSWORD_HASH_BYTES,
		"AUTH_CONFIG_HASH_INVALID",
	);
	const suppliedHash = await derivePasswordHash(password, salt, iterations);

	return constantTimeEqual(suppliedHash, expectedHash);
}

export async function createPasswordVerifier(
	password: string,
	iterations = AUTH_PASSWORD_ITERATIONS_DEFAULT,
): Promise<{
	hash: string;
	salt: string;
	iterations: number;
}> {
	const salt = crypto.getRandomValues(new Uint8Array(AUTH_PASSWORD_SALT_BYTES));
	const hash = await derivePasswordHash(password, salt, iterations);

	return {
		hash: base64UrlEncode(hash),
		salt: base64UrlEncode(salt),
		iterations,
	};
}
