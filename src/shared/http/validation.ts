import { normalizeNotionId } from "../notion/notion-id";

export function invalidRequest(message: string, field?: string): Response {
	return Response.json(
		{
			error: "Invalid request",
			...(field ? { field } : {}),
			message,
		},
		{ status: 400 },
	);
}

export function invalidDate(field: string): Response {
	return invalidRequest("Expected date in YYYY-MM-DD format", field);
}

export function invalidNotionId(field: string): Response {
	return invalidRequest("Expected a valid Notion page ID", field);
}

export function unknownField(field: string): Response {
	return invalidRequest("Unknown or read-only field", field);
}

export function invalidOption(field: string): Response {
	return invalidRequest("Unknown option ID", field);
}

export function parseDateValue(
	value: unknown,
	field: string,
): string | null | Response | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	if (typeof value !== "string") {
		return invalidDate(field);
	}

	const trimmed = value.trim();

	if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		return invalidDate(field);
	}

	const date = new Date(`${trimmed}T00:00:00.000Z`);

	if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
		return invalidDate(field);
	}

	return trimmed;
}

export function parseStringValue(
	value: unknown,
	field: string,
): string | null | Response | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	if (typeof value !== "string") {
		return invalidRequest("Expected a string", field);
	}

	return value.trim();
}

export function parseBooleanValue(
	value: unknown,
	field: string,
): boolean | Response | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "boolean") {
		return invalidRequest("Expected a boolean", field);
	}

	return value;
}

export function parseNotionIdValue(
	value: unknown,
	field: string,
): string | null | Response | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	if (typeof value !== "string") {
		return invalidNotionId(field);
	}

	return normalizeNotionId(value) ?? invalidNotionId(field);
}

export function parseNotionIdArrayValue(
	value: unknown,
	field: string,
): string[] | Response | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!Array.isArray(value)) {
		return invalidRequest("Expected an array of Notion page IDs", field);
	}

	const ids: string[] = [];

	for (const item of value) {
		if (typeof item !== "string") {
			return invalidNotionId(field);
		}

		const normalized = normalizeNotionId(item);

		if (!normalized) {
			return invalidNotionId(field);
		}

		ids.push(normalized);
	}

	return ids;
}

export function parseStringArrayValue(
	value: unknown,
	field: string,
): string[] | Response | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!Array.isArray(value)) {
		return invalidRequest("Expected an array of strings", field);
	}

	const values: string[] = [];

	for (const item of value) {
		if (typeof item !== "string") {
			return invalidRequest("Expected an array of strings", field);
		}

		const trimmed = item.trim();

		if (trimmed.length > 0) {
			values.push(trimmed);
		}
	}

	return values;
}

export function parseOptionIdValue(
	value: unknown,
	field: string,
): string | null | Response | undefined {
	return parseStringValue(value, field);
}

export function ensureAllowedFields(
	body: Record<string, unknown>,
	allowedFields: Set<string>,
): Response | undefined {
	for (const field of Object.keys(body)) {
		if (!allowedFields.has(field)) {
			return unknownField(field);
		}
	}

	return undefined;
}
