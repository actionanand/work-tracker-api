export type AuthDiagnosticCode =
	| "AUTH_CONFIG_HASH_MISSING"
	| "AUTH_CONFIG_HASH_INVALID"
	| "AUTH_CONFIG_SALT_MISSING"
	| "AUTH_CONFIG_SALT_INVALID"
	| "AUTH_CONFIG_JWT_SECRET_MISSING"
	| "AUTH_CONFIG_ITERATIONS_INVALID"
	| "AUTH_CONFIG_TTL_INVALID"
	| "AUTH_CONFIG_RENEW_WINDOW_INVALID"
	| "AUTH_CONFIG_MAX_SESSION_INVALID"
	| "AUTH_CONFIG_SESSION_DB_MISSING"
	| "AUTH_RATE_LIMIT_ERROR"
	| "AUTH_SESSION_STORE_ERROR"
	| "AUTH_PASSWORD_VERIFY_UNSUPPORTED_ITERATIONS"
	| "AUTH_PASSWORD_VERIFY_ERROR"
	| "AUTH_TOKEN_SIGN_ERROR"
	| "AUTH_UNEXPECTED_ERROR";

export class AuthConfigurationError extends Error {
	constructor(readonly code: AuthDiagnosticCode) {
		super(code);
		this.name = "AuthConfigurationError";
	}
}

export function logAuthDiagnostic(code: AuthDiagnosticCode): void {
	console.error(`AUTH_LOGIN_INTERNAL_ERROR:${code}`);
}

export function classifyPasswordVerificationError(
	error: unknown,
): AuthDiagnosticCode {
	return error instanceof Error && error.name === "NotSupportedError"
		? "AUTH_PASSWORD_VERIFY_UNSUPPORTED_ITERATIONS"
		: "AUTH_PASSWORD_VERIFY_ERROR";
}
