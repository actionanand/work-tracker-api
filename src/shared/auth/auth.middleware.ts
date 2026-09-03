import type { Env } from "../env";
import { unauthorizedResponse } from "./auth.responses";
import { verifyAccessToken } from "./auth.token";
import type { AuthTokenPayload } from "./auth.types";

export interface AuthenticatedRequest {
	payload: AuthTokenPayload;
}

export async function authenticateRequest(
	request: Request,
	env: Env,
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
		payload = await verifyAccessToken(env, token);
	} catch {
		return unauthorizedResponse();
	}

	if (!payload) {
		return unauthorizedResponse();
	}

	return {
		payload,
	};
}
