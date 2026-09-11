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
	sid: string;
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
	device?: unknown;
}

export interface LoginDeviceMetadata {
	deviceId?: string | null;
	name?: string | null;
	platform?: string | null;
	model?: string | null;
	appVersion?: string | null;
}

export interface AuthSessionRecord {
	id: string;
	subject: string;
	deviceId: string | null;
	deviceName: string | null;
	platform: string | null;
	deviceModel: string | null;
	appVersion: string | null;
	userAgent: string | null;
	ipAddress: string | null;
	country: string | null;
	createdAt: number;
	lastSeenAt: number;
	expiresAt: number;
	revokedAt: number | null;
}

export interface AuthSessionDevice {
	deviceId: string | null;
	name: string | null;
	platform: string;
	model: string | null;
	appVersion: string | null;
}

export interface AuthSessionResponseItem {
	id: string;
	current: boolean;
	device: AuthSessionDevice;
	ipAddress: string | null;
	country: string | null;
	createdAt: string;
	lastSeenAt: string;
	expiresAt: string;
}

export interface RateLimitBinding {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}
