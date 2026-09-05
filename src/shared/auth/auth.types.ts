export interface AuthJwtHeader {
	alg: "HS256";
	typ: "JWT";
}

export interface AuthTokenPayload {
	sub: "owner";
	iss: "work-tracker-api";
	aud: "work-tracker-app";
	iat: number;
	exp: number;
	jti: string;
	sessionStartedAt?: number;
}

export interface AuthStatus {
	authenticated: true;
	subject: "owner";
	expiresAt: string;
	renewAfter: string;
	sessionStartedAt: string;
	sessionExpiresAt: string;
}

export interface LoginRequestBody {
	password?: unknown;
}

export interface RateLimitBinding {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}
