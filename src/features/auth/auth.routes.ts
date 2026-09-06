import {
	AUTH_MAX_PASSWORD_LENGTH,
	AUTH_TOKEN_TYPE,
} from "../../shared/auth/auth.constants";
import {
	authConfigurationErrorResponse,
	badLoginRequestResponse,
	invalidCredentialsResponse,
	reauthenticationRequiredResponse,
	tooManyLoginAttemptsResponse,
	unauthorizedResponse,
} from "../../shared/auth/auth.responses";
import {
	AuthConfigurationError,
	classifyPasswordVerificationError,
	logAuthDiagnostic,
} from "../../shared/auth/auth.errors";
import { verifyPassword } from "../../shared/auth/auth.password";
import {
	getAuthMaxSessionSeconds,
	createAccessToken,
	getAuthRenewWindowSeconds,
	getAuthTokenMetadata,
	getSessionStartedAt,
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

	try {
		console.log("AUTH_LOGIN_REQUEST_RECEIVED");

		let rateLimitResponse: Response | null;

		try {
			rateLimitResponse = await rateLimitLogin(request, env);
		} catch {
			logAuthDiagnostic("AUTH_RATE_LIMIT_ERROR");

			return authConfigurationErrorResponse();
		}

		if (rateLimitResponse) {
			return rateLimitResponse;
		}

		console.log("AUTH_RATE_LIMIT_OK");

		const password = await parseLoginBody(request);

		if (password instanceof Response) {
			return password;
		}

		validateAuthConfiguration(env);
		console.log("AUTH_CONFIG_VALID");
		console.log("AUTH_PASSWORD_VERIFY_START");

		let credentialsValid: boolean;

		try {
			credentialsValid = await verifyPassword(password, env);
		} catch (error) {
			if (error instanceof AuthConfigurationError) {
				throw error;
			}

			logAuthDiagnostic(classifyPasswordVerificationError(error));

			return authConfigurationErrorResponse();
		}

		if (!credentialsValid) {
			console.log("AUTH_PASSWORD_VERIFY_FAILED");

			return invalidCredentialsResponse();
		}

		console.log("AUTH_PASSWORD_VERIFY_SUCCESS");
		console.log("AUTH_TOKEN_SIGN_START");

		let token: Awaited<ReturnType<typeof createAccessToken>>;

		try {
			token = await createAccessToken(env);
		} catch (error) {
			if (error instanceof AuthConfigurationError) {
				throw error;
			}

			logAuthDiagnostic("AUTH_TOKEN_SIGN_ERROR");

			return authConfigurationErrorResponse();
		}

		console.log("AUTH_TOKEN_SIGN_SUCCESS");

		return Response.json(
			{
				accessToken: token.token,
				tokenType: AUTH_TOKEN_TYPE,
				expiresIn: token.expiresIn,
				...getAuthTokenMetadata(env, token.payload),
			},
			{
				headers: {
					"Cache-Control": "no-store",
				},
			},
		);
	} catch (error) {
		if (error instanceof AuthConfigurationError) {
			logAuthDiagnostic(error.code);

			return authConfigurationErrorResponse();
		}

		logAuthDiagnostic("AUTH_UNEXPECTED_ERROR");

		return authConfigurationErrorResponse();
	}
}

export async function handleProtectedAuthRoutes(
	request: Request,
	url: URL,
	authenticated: AuthenticatedRequest,
	env: Env,
): Promise<Response | null> {
	if (url.pathname === "/api/auth/status") {
		if (request.method !== "GET") {
			return null;
		}

		return Response.json(
			{
				authenticated: true,
				subject: authenticated.payload.sub,
				...getAuthTokenMetadata(env, authenticated.payload),
			},
			{
				headers: {
					"Cache-Control": "no-store",
				},
			},
		);
	}

	return null;
}

export async function handleAuthRenewRoute(
	request: Request,
	url: URL,
	authenticated: AuthenticatedRequest,
	env: Env,
): Promise<Response | null> {
	if (request.method !== "POST" || url.pathname !== "/api/auth/renew") {
		return null;
	}

	try {
		console.log("AUTH_RENEW_REQUEST_RECEIVED");
		validateAuthConfiguration(env);

		const nowSeconds = Math.floor(Date.now() / 1000);
		const sessionStartedAt = getSessionStartedAt(authenticated.payload);
		const sessionExpiresAt =
			sessionStartedAt + getAuthMaxSessionSeconds(env);

		if (nowSeconds >= sessionExpiresAt) {
			console.log("AUTH_RENEW_SESSION_LIMIT_REACHED");

			return reauthenticationRequiredResponse();
		}

		const renewWindowSeconds = getAuthRenewWindowSeconds(env);
		const remainingSeconds = authenticated.payload.exp - nowSeconds;

		if (remainingSeconds > renewWindowSeconds) {
			console.log("AUTH_RENEW_NOT_DUE");

			return Response.json(
				{
					renewed: false,
					...getAuthTokenMetadata(env, authenticated.payload),
				},
				{
					headers: {
						"Cache-Control": "no-store",
					},
				},
			);
		}

		const token = await createAccessToken(env, nowSeconds, { sessionStartedAt });

		console.log("AUTH_RENEW_SUCCESS");

		return Response.json(
			{
				renewed: true,
				accessToken: token.token,
				tokenType: AUTH_TOKEN_TYPE,
				expiresIn: token.expiresIn,
				...getAuthTokenMetadata(env, token.payload),
			},
			{
				headers: {
					"Cache-Control": "no-store",
				},
			},
		);
	} catch (error) {
		if (error instanceof AuthConfigurationError) {
			console.error(`AUTH_RENEW_INTERNAL_ERROR:${error.code}`);

			return authConfigurationErrorResponse();
		}

		console.error("AUTH_RENEW_INTERNAL_ERROR:AUTH_UNEXPECTED_ERROR");

		return authConfigurationErrorResponse();
	}
}
