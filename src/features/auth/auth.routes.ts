import {
	AUTH_MAX_PASSWORD_LENGTH,
	AUTH_TOKEN_TYPE,
} from "../../shared/auth/auth.constants";
import {
	authConfigurationErrorResponse,
	badLoginRequestResponse,
	invalidCredentialsResponse,
	tooManyLoginAttemptsResponse,
} from "../../shared/auth/auth.responses";
import { AuthConfigurationError } from "../../shared/auth/auth.errors";
import { verifyPassword } from "../../shared/auth/auth.password";
import {
	createAccessToken,
	validateAuthConfiguration,
} from "../../shared/auth/auth.token";
import type { AuthenticatedRequest } from "../../shared/auth/auth.middleware";
import type { LoginRequestBody } from "../../shared/auth/auth.types";
import type { Env } from "../../shared/env";

async function parseLoginBody(request: Request): Promise<string | Response> {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return badLoginRequestResponse();
	}

	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return badLoginRequestResponse();
	}

	const loginBody = body as LoginRequestBody;

	if (
		typeof loginBody.password !== "string" ||
		loginBody.password.length === 0 ||
		loginBody.password.length > AUTH_MAX_PASSWORD_LENGTH
	) {
		return badLoginRequestResponse();
	}

	return loginBody.password;
}

async function rateLimitLogin(request: Request, env: Env): Promise<Response | null> {
	const key = request.headers.get("CF-Connecting-IP") ?? "local-development";
	const outcome = await env.AUTH_RATE_LIMITER.limit({ key });

	return outcome.success ? null : tooManyLoginAttemptsResponse();
}

export async function handlePublicAuthRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (request.method !== "POST" || url.pathname !== "/api/auth/login") {
		return null;
	}

	const password = await parseLoginBody(request);

	if (password instanceof Response) {
		return password;
	}

	try {
		validateAuthConfiguration(env);

		const rateLimitResponse = await rateLimitLogin(request, env);

		if (rateLimitResponse) {
			return rateLimitResponse;
		}

		const credentialsValid = await verifyPassword(password, env);

		if (!credentialsValid) {
			return invalidCredentialsResponse();
		}

		const token = await createAccessToken(env);

		return Response.json(
			{
				accessToken: token.token,
				tokenType: AUTH_TOKEN_TYPE,
				expiresIn: token.expiresIn,
			},
			{
				headers: {
					"Cache-Control": "no-store",
				},
			},
		);
	} catch (error) {
		if (error instanceof AuthConfigurationError) {
			return authConfigurationErrorResponse();
		}

		console.error("auth.login.failed");

		return authConfigurationErrorResponse();
	}
}

export async function handleProtectedAuthRoutes(
	request: Request,
	url: URL,
	_authenticated: AuthenticatedRequest,
): Promise<Response | null> {
	if (request.method !== "GET" || url.pathname !== "/api/auth/status") {
		return null;
	}

	return Response.json(
		{
			authenticated: true,
			subject: _authenticated.payload.sub,
			expiresAt: new Date(_authenticated.payload.exp * 1000).toISOString(),
		},
		{
			headers: {
				"Cache-Control": "no-store",
			},
		},
	);
}
