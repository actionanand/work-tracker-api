import type { Env } from "../env";
import { unauthorizedResponse } from "./auth.responses";
import { getAuthSessionForPayload } from "./auth.sessions";
import { verifyAccessToken } from "./auth.token";
import type { AuthSessionRecord, AuthTokenPayload } from "./auth.types";

export interface AuthenticatedRequest {
	payload: AuthTokenPayload;
	session: AuthSessionRecord;
}

export async function authenticateRequest(
	request: Request,
	env: Env,
	options: { enforceSessionLifetime?: boolean; allowExpiredSession?: boolean } = {},
): Promise<AuthenticatedRequest | Response> {
	const authorization = request.headers.get("Authorization");

	if (!authorization) {
		return unauthorizedResponse();
	}

	const [scheme, token, extra] = authorization.trim().split(/\s+/);

	if (scheme !== "Bearer" || !token || extra) {
		return unauthorizedResponse();
	}

	let payload: AuthTokenPayload | null;

	try {
		payload = await verifyAccessToken(env, token, undefined, options);
	} catch {
		return unauthorizedResponse();
	}

	if (!payload) {
		return unauthorizedResponse();
	}

	let session: AuthSessionRecord | null;

	try {
		session = await getAuthSessionForPayload(env, payload, undefined, {
			allowExpired: options.allowExpiredSession,
		});
	} catch {
		return unauthorizedResponse();
	}

	if (!session) {
		return unauthorizedResponse();
	}

	return {
		payload,
		session,
	};
}
