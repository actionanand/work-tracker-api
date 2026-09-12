const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, QUERY, POST, PATCH, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Expose-Headers": "Accept-Query",
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

export function reauthenticationRequiredResponse(): Response {
	return Response.json(
		{
			error: "Reauthentication required",
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

export function corsPreflightResponse(pathname = ""): Response {
	const queryCapable = [
		"/api/work-logs",
		"/api/feedback",
		"/api/work-links",
		"/api/jiras",
	].includes(pathname);
	const allow = allowHeaderForPath(pathname);

	return new Response(null, {
		status: 204,
		headers: {
			...CORS_HEADERS,
			...(allow ? { Allow: allow } : {}),
			...(queryCapable ? { "Accept-Query": "application/json" } : {}),
			"Access-Control-Max-Age": "86400",
		},
	});
}

function allowHeaderForPath(pathname: string): string | null {
	if (pathname === "/api/jiras") {
		return "GET, QUERY, OPTIONS";
	}

	if (["/api/work-logs", "/api/feedback", "/api/work-links"].includes(pathname)) {
		return "GET, QUERY, POST, OPTIONS";
	}

	if (
		/^\/api\/work-logs\/[^/]+$/.test(pathname) ||
		/^\/api\/feedback\/[^/]+$/.test(pathname) ||
		/^\/api\/work-links\/[^/]+$/.test(pathname)
	) {
		return "PATCH, OPTIONS";
	}

	return null;
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
