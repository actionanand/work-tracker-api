import type { Env } from "../env";
import { AUTH_SUBJECT } from "./auth.constants";
import { AuthConfigurationError } from "./auth.errors";
import { getAuthMaxSessionSeconds } from "./auth.token";
import type {
	AuthSessionDevice,
	AuthSessionRecord,
	AuthSessionResponseItem,
	AuthTokenPayload,
	LoginDeviceMetadata,
} from "./auth.types";

const LAST_SEEN_UPDATE_THROTTLE_SECONDS = 300;
const SESSION_CLEANUP_RETENTION_SECONDS = 86400;
const DEVICE_ID_MAX_LENGTH = 128;
const DEVICE_NAME_MAX_LENGTH = 128;
const PLATFORM_MAX_LENGTH = 32;
const DEVICE_MODEL_MAX_LENGTH = 128;
const APP_VERSION_MAX_LENGTH = 64;
const USER_AGENT_MAX_LENGTH = 512;
const IP_ADDRESS_MAX_LENGTH = 64;
const COUNTRY_MAX_LENGTH = 2;

function asOptionalTrimmedString(
	value: unknown,
	maxLength: number,
): string | null | undefined {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();

	if (trimmed.length === 0) {
		return null;
	}

	return trimmed.length <= maxLength ? trimmed : undefined;
}

function getAuthDb(env: Env): D1Database {
	if (!env.AUTH_DB) {
		throw new AuthConfigurationError("AUTH_CONFIG_SESSION_DB_MISSING");
	}

	return env.AUTH_DB;
}

function toIso(seconds: number): string {
	return new Date(seconds * 1000).toISOString();
}

function coerceRecord(row: Record<string, unknown>): AuthSessionRecord {
	return {
		id: String(row.id),
		subject: String(row.subject),
		deviceId: row.device_id === null ? null : String(row.device_id),
		deviceName: row.device_name === null ? null : String(row.device_name),
		platform: row.platform === null ? null : String(row.platform),
		deviceModel: row.device_model === null ? null : String(row.device_model),
		appVersion: row.app_version === null ? null : String(row.app_version),
		userAgent: row.user_agent === null ? null : String(row.user_agent),
		ipAddress: row.ip_address === null ? null : String(row.ip_address),
		country: row.country === null ? null : String(row.country),
		createdAt: Number(row.created_at),
		lastSeenAt: Number(row.last_seen_at),
		expiresAt: Number(row.expires_at),
		revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
	};
}

export function parseLoginDeviceMetadata(value: unknown): LoginDeviceMetadata | Response {
	if (value === undefined || value === null) {
		return {};
	}

	if (typeof value !== "object" || Array.isArray(value)) {
		return Response.json(
			{ error: "Invalid login request" },
			{ status: 400, headers: { "Cache-Control": "no-store" } },
		);
	}

	const device = value as Record<string, unknown>;
	const parsed: LoginDeviceMetadata = {
		deviceId: asOptionalTrimmedString(device.deviceId, DEVICE_ID_MAX_LENGTH),
		name: asOptionalTrimmedString(device.name, DEVICE_NAME_MAX_LENGTH),
		platform: asOptionalTrimmedString(device.platform, PLATFORM_MAX_LENGTH),
		model: asOptionalTrimmedString(device.model, DEVICE_MODEL_MAX_LENGTH),
		appVersion: asOptionalTrimmedString(device.appVersion, APP_VERSION_MAX_LENGTH),
	};

	if (Object.values(parsed).some((field) => field === undefined)) {
		return Response.json(
			{ error: "Invalid login request" },
			{ status: 400, headers: { "Cache-Control": "no-store" } },
		);
	}

	return parsed;
}

export function getRequestSessionMetadata(request: Request): {
	userAgent: string | null;
	ipAddress: string | null;
	country: string | null;
} {
	return {
		userAgent:
			asOptionalTrimmedString(
				request.headers.get("User-Agent"),
				USER_AGENT_MAX_LENGTH,
			) ?? null,
		ipAddress:
			asOptionalTrimmedString(
				request.headers.get("CF-Connecting-IP"),
				IP_ADDRESS_MAX_LENGTH,
			) ?? "local-development",
		country:
			asOptionalTrimmedString(
				request.headers.get("CF-IPCountry"),
				COUNTRY_MAX_LENGTH,
			) ?? null,
	};
}

export async function cleanupOldAuthSessions(
	env: Env,
	nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
	const deleteBefore = nowSeconds - SESSION_CLEANUP_RETENTION_SECONDS;

	await getAuthDb(env)
		.prepare(
			`DELETE FROM auth_sessions
			 WHERE expires_at <= ?1 OR (revoked_at IS NOT NULL AND revoked_at <= ?1)`,
		)
		.bind(deleteBefore)
		.run();
}

export async function createAuthSession(
	env: Env,
	request: Request,
	device: LoginDeviceMetadata,
	nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AuthSessionRecord> {
	const db = getAuthDb(env);
	const id = crypto.randomUUID();
	const expiresAt = nowSeconds + getAuthMaxSessionSeconds(env);
	const requestMetadata = getRequestSessionMetadata(request);

	await cleanupOldAuthSessions(env, nowSeconds);

	if (device.deviceId) {
		await db
			.prepare(
				`UPDATE auth_sessions
				 SET revoked_at = ?1
				 WHERE subject = ?2
				   AND device_id = ?3
				   AND revoked_at IS NULL
				   AND expires_at > ?1`,
			)
			.bind(nowSeconds, AUTH_SUBJECT, device.deviceId)
			.run();
	}

	await db
		.prepare(
			`INSERT INTO auth_sessions (
				id, subject, device_id, device_name, platform, device_model,
				app_version, user_agent, ip_address, country, created_at,
				last_seen_at, expires_at, revoked_at
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL)`,
		)
		.bind(
			id,
			AUTH_SUBJECT,
			device.deviceId ?? null,
			device.name ?? null,
			device.platform ?? null,
			device.model ?? null,
			device.appVersion ?? null,
			requestMetadata.userAgent,
			requestMetadata.ipAddress,
			requestMetadata.country,
			nowSeconds,
			nowSeconds,
			expiresAt,
		)
		.run();

	return {
		id,
		subject: AUTH_SUBJECT,
		deviceId: device.deviceId ?? null,
		deviceName: device.name ?? null,
		platform: device.platform ?? null,
		deviceModel: device.model ?? null,
		appVersion: device.appVersion ?? null,
		userAgent: requestMetadata.userAgent,
		ipAddress: requestMetadata.ipAddress,
		country: requestMetadata.country,
		createdAt: nowSeconds,
		lastSeenAt: nowSeconds,
		expiresAt,
		revokedAt: null,
	};
}

export async function getAuthSessionForPayload(
	env: Env,
	payload: AuthTokenPayload,
	nowSeconds = Math.floor(Date.now() / 1000),
	options: { allowExpired?: boolean } = {},
): Promise<AuthSessionRecord | null> {
	if (!payload.sid) {
		return null;
	}

	const row = await getAuthDb(env)
		.prepare(
			`SELECT *
			 FROM auth_sessions
			 WHERE id = ?1
			   AND subject = ?2
			   AND revoked_at IS NULL
			   AND (?3 = 1 OR expires_at > ?4)
			 LIMIT 1`,
		)
		.bind(payload.sid, payload.sub, options.allowExpired ? 1 : 0, nowSeconds)
		.first<Record<string, unknown>>();

	if (!row) {
		return null;
	}

	const session = coerceRecord(row);

	if (
		session.expiresAt > nowSeconds &&
		session.lastSeenAt <= nowSeconds - LAST_SEEN_UPDATE_THROTTLE_SECONDS
	) {
		await getAuthDb(env)
			.prepare("UPDATE auth_sessions SET last_seen_at = ?1 WHERE id = ?2")
			.bind(nowSeconds, session.id)
			.run();
		session.lastSeenAt = nowSeconds;
	}

	return session;
}

export async function listActiveAuthSessions(
	env: Env,
	subject: string,
	currentSessionId: string,
	nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AuthSessionResponseItem[]> {
	await cleanupOldAuthSessions(env, nowSeconds);

	const result = await getAuthDb(env)
		.prepare(
			`SELECT *
			 FROM auth_sessions
			 WHERE subject = ?1
			   AND revoked_at IS NULL
			   AND expires_at > ?2
			 ORDER BY CASE WHEN id = ?3 THEN 0 ELSE 1 END, last_seen_at DESC`,
		)
		.bind(subject, nowSeconds, currentSessionId)
		.all<Record<string, unknown>>();

	return (result.results ?? []).map((row) =>
		mapSessionForResponse(coerceRecord(row), currentSessionId),
	);
}

export async function revokeAuthSession(
	env: Env,
	subject: string,
	sessionId: string,
	nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
	await getAuthDb(env)
		.prepare(
			`UPDATE auth_sessions
			 SET revoked_at = COALESCE(revoked_at, ?1)
			 WHERE id = ?2
			   AND subject = ?3`,
		)
		.bind(nowSeconds, sessionId, subject)
		.run();
}

export async function revokeOtherAuthSessions(
	env: Env,
	subject: string,
	currentSessionId: string,
	nowSeconds = Math.floor(Date.now() / 1000),
): Promise<number> {
	const result = await getAuthDb(env)
		.prepare(
			`UPDATE auth_sessions
			 SET revoked_at = ?1
			 WHERE subject = ?2
			   AND id <> ?3
			   AND revoked_at IS NULL
			   AND expires_at > ?1`,
		)
		.bind(nowSeconds, subject, currentSessionId)
		.run();

	return result.meta.changes ?? 0;
}

export function mapSessionForResponse(
	session: AuthSessionRecord,
	currentSessionId: string,
): AuthSessionResponseItem {
	const device: AuthSessionDevice = {
		deviceId: session.deviceId,
		name: session.deviceName,
		platform: session.platform ?? "unknown",
		model: session.deviceModel,
		appVersion: session.appVersion,
	};

	return {
		id: session.id,
		current: session.id === currentSessionId,
		device,
		ipAddress: session.ipAddress,
		country: session.country,
		createdAt: toIso(session.createdAt),
		lastSeenAt: toIso(session.lastSeenAt),
		expiresAt: toIso(session.expiresAt),
	};
}

