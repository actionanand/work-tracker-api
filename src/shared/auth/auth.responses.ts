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
			error: "Authentication is not configured",
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
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Authorization, Content-Type",
			"Access-Control-Max-Age": "86400",
		},
	});
}
