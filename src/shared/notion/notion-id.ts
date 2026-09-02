const HYPHENATED_NOTION_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPACT_NOTION_ID = /^[0-9a-f]{32}$/i;

export function isValidNotionId(value: string): boolean {
	return normalizeNotionId(value) !== null;
}

export function normalizeNotionId(value: string): string | null {
	const trimmed = value.trim();

	if (HYPHENATED_NOTION_ID.test(trimmed)) {
		return trimmed.toLowerCase();
	}

	if (!COMPACT_NOTION_ID.test(trimmed)) {
		return null;
	}

	const lower = trimmed.toLowerCase();

	return [
		lower.slice(0, 8),
		lower.slice(8, 12),
		lower.slice(12, 16),
		lower.slice(16, 20),
		lower.slice(20),
	].join("-");
}

export function parseNotionIdParam(
	url: URL,
	parameter: string,
): string | Response | undefined {
	const value = url.searchParams.get(parameter);

	if (value === null) {
		return undefined;
	}

	const normalized = normalizeNotionId(value);

	if (normalized) {
		return normalized;
	}

	return Response.json(
		{
			error: "Invalid query parameter",
			parameter,
			message: "Expected a valid Notion page ID",
		},
		{
			status: 400,
		},
	);
}
