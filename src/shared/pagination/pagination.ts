import { NotionQueryError } from "../notion/notion-client";

export const DEFAULT_PAGE_SIZE = 25;
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;

export interface PaginationParams {
	pageSize: number;
	cursor?: string;
}

export function parsePaginationParams(url: URL): PaginationParams | Response {
	const pageSize = parsePageSize(url);

	if (pageSize instanceof Response) {
		return pageSize;
	}

	const cursor = parseCursor(url);

	if (cursor instanceof Response) {
		return cursor;
	}

	return {
		pageSize,
		...(cursor ? { cursor } : {}),
	};
}

function parsePageSize(url: URL): number | Response {
	const value = url.searchParams.get("pageSize");

	if (value === null) {
		return DEFAULT_PAGE_SIZE;
	}

	const trimmed = value.trim();
	const parsed = Number(trimmed);

	if (
		trimmed.length === 0 ||
		!/^\d+$/.test(trimmed) ||
		!Number.isInteger(parsed) ||
		parsed < MIN_PAGE_SIZE ||
		parsed > MAX_PAGE_SIZE
	) {
		return invalidPaginationParameterResponse(
			"pageSize",
			`Expected an integer from ${MIN_PAGE_SIZE} to ${MAX_PAGE_SIZE}`,
		);
	}

	return parsed;
}

function parseCursor(url: URL): string | Response | undefined {
	if (!url.searchParams.has("cursor")) {
		return undefined;
	}

	const value = url.searchParams.get("cursor")?.trim();

	if (!value) {
		return invalidPaginationParameterResponse(
			"cursor",
			"Expected a non-empty pagination cursor",
		);
	}

	return value;
}

function invalidPaginationParameterResponse(
	parameter: "pageSize" | "cursor",
	message: string,
): Response {
	return Response.json(
		{
			error: "Invalid pagination query parameter",
			parameter,
			message,
		},
		{
			status: 400,
		},
	);
}

export function invalidPaginationCursorResponse(error: unknown): Response | null {
	if (!(error instanceof NotionQueryError) || error.status !== 400) {
		return null;
	}

	const responseText = error.responseText.toLowerCase();

	if (!responseText.includes("cursor") && !responseText.includes("start_cursor")) {
		return null;
	}

	return Response.json(
		{
			error: "Invalid pagination cursor",
		},
		{
			status: 400,
		},
	);
}
