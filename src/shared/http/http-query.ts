import {
	DEFAULT_PAGE_SIZE,
	MAX_PAGE_SIZE,
	MIN_PAGE_SIZE,
	type PaginationParams,
} from "../pagination/pagination";
import { isRecord, parseJsonRequestBody } from "./request-body";
import { invalidRequest } from "./validation";

export const ACCEPT_QUERY_HEADER = "application/json";

export interface DomainQueryRequest {
	filters: Record<string, unknown>;
	pagination: PaginationParams;
	includeRelations: boolean;
}

const ALLOWED_TOP_LEVEL_FIELDS = new Set([
	"filters",
	"pageSize",
	"cursor",
	"includeRelations",
	"sorts",
]);

export async function parseDomainQueryRequest(
	request: Request,
	allowedFilters: Set<string>,
): Promise<DomainQueryRequest | Response> {
	const parsedBody = await parseJsonRequestBody(request);

	if (parsedBody instanceof Response) {
		return parsedBody;
	}

	if (!isRecord(parsedBody.value)) {
		return invalidRequest("Expected a JSON object");
	}

	for (const field of Object.keys(parsedBody.value)) {
		if (!ALLOWED_TOP_LEVEL_FIELDS.has(field)) {
			return invalidRequest("Unknown top-level field", field);
		}
	}

	if (parsedBody.value.sorts !== undefined) {
		return invalidRequest("Domain-safe sorts are not implemented for this resource", "sorts");
	}

	const filtersValue = parsedBody.value.filters ?? {};

	if (!isRecord(filtersValue)) {
		return invalidRequest("Expected filters to be an object", "filters");
	}

	for (const filter of Object.keys(filtersValue)) {
		if (!allowedFilters.has(filter)) {
			return invalidRequest("Unknown filter", filter);
		}
	}

	const pageSize = parsePageSize(parsedBody.value.pageSize);

	if (pageSize instanceof Response) {
		return pageSize;
	}

	const cursor = parseCursor(parsedBody.value.cursor);

	if (cursor instanceof Response) {
		return cursor;
	}

	const includeRelations = parseIncludeRelations(parsedBody.value.includeRelations);

	if (includeRelations instanceof Response) {
		return includeRelations;
	}

	return {
		filters: filtersValue,
		pagination: {
			pageSize,
			...(cursor ? { cursor } : {}),
		},
		includeRelations,
	};
}

function parsePageSize(value: unknown): number | Response {
	if (value === undefined || value === null) {
		return DEFAULT_PAGE_SIZE;
	}

	if (
		typeof value !== "number" ||
		!Number.isInteger(value) ||
		value < MIN_PAGE_SIZE ||
		value > MAX_PAGE_SIZE
	) {
		return invalidRequest(
			`Expected pageSize to be an integer from ${MIN_PAGE_SIZE} to ${MAX_PAGE_SIZE}`,
			"pageSize",
		);
	}

	return value;
}

function parseCursor(value: unknown): string | Response | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (typeof value !== "string" || value.trim().length === 0) {
		return invalidRequest("Expected cursor to be a non-empty string", "cursor");
	}

	return value.trim();
}

function parseIncludeRelations(value: unknown): boolean | Response {
	if (value === undefined || value === null) {
		return false;
	}

	if (typeof value !== "boolean") {
		return invalidRequest("Expected includeRelations to be a boolean", "includeRelations");
	}

	return value;
}

export function withAcceptQuery(response: Response): Response {
	const headers = new Headers(response.headers);

	headers.set("Accept-Query", ACCEPT_QUERY_HEADER);

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
