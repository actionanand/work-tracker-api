const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function withCorsHeaders(response: Response): Response {
	const headers = new Headers(response.headers);

	for (const [name, value] of Object.entries(CORS_HEADERS)) {
		headers.set(name, value);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export function unauthorizedResponse(): Response {
	return Response.json(
		{
			error: "Unauthorized",
		},
		{
			status: 401,
			headers: {
				"WWW-Authenticate": "Bearer",
				"Cache-Control": "no-store",
			},
		},
	);
}

export function invalidCredentialsResponse(): Response {
	return Response.json(
		{
			error: "Invalid credentials",
		},
		{
			status: 401,
			headers: {
				"Cache-Control": "no-store",
			},
		},
	);
}

export function badLoginRequestResponse(): Response {
	return Response.json(
		{
			error: "Invalid login request",
		},
		{
			status: 400,
			headers: {
				"Cache-Control": "no-store",
			},
		},
	);
}

export function authConfigurationErrorResponse(): Response {
	return Response.json(
		{
			error: "Authentication service unavailable",
		},
		{
			status: 500,
			headers: {
				"Cache-Control": "no-store",
			},
		},
	);
}

export function tooManyLoginAttemptsResponse(): Response {
	return Response.json(
		{
			error: "Too many login attempts",
		},
		{
			status: 429,
			headers: {
				"Cache-Control": "no-store",
				"Retry-After": "60",
			},
		},
	);
}

export function corsPreflightResponse(): Response {
	return new Response(null, {
		status: 204,
		headers: {
			...CORS_HEADERS,
			"Access-Control-Max-Age": "86400",
		},
	});
}

export function internalServerErrorResponse(): Response {
	return Response.json(
		{
			error: "Internal server error",
		},
		{
			status: 500,
			headers: {
				"Cache-Control": "no-store",
			},
		},
	);
}
