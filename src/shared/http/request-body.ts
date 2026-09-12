export interface JsonRequestResult {
	value: unknown;
}

export async function parseJsonRequestBody(
	request: Request,
): Promise<JsonRequestResult | Response> {
	const contentType = request.headers.get("Content-Type");

	if (!contentType) {
		return Response.json(
			{
				error: "Missing Content-Type",
				message: "Expected application/json",
			},
			{ status: 400 },
		);
	}

	if (!contentType.toLowerCase().split(";")[0].trim().endsWith("application/json")) {
		return Response.json(
			{
				error: "Unsupported media type",
				message: "Expected application/json",
			},
			{
				status: 415,
				headers: {
					"Accept-Query": "application/json",
				},
			},
		);
	}

	const text = await request.text();

	if (text.trim().length === 0) {
		return Response.json(
			{
				error: "Invalid request",
				message: "Expected a JSON request body",
			},
			{ status: 400 },
		);
	}

	try {
		return {
			value: JSON.parse(text) as unknown,
		};
	} catch {
		return Response.json(
			{
				error: "Invalid JSON",
			},
			{ status: 400 },
		);
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
