import type { Env } from "../../shared/env";
import { parseBulkDeletePageIds } from "../../shared/http/bulk-delete";
import { parseDomainQueryRequest, withAcceptQuery } from "../../shared/http/http-query";
import { isRecord, parseJsonRequestBody } from "../../shared/http/request-body";
import {
	invalidNotionId,
	invalidRequest,
	parseBooleanValue,
	parseStringArrayValue,
	parseStringValue,
} from "../../shared/http/validation";
import { normalizeNotionId } from "../../shared/notion/notion-id";
import { NotionQueryError } from "../../shared/notion/notion-client";
import { buildResourceMetadata } from "../../shared/notion/notion-schema";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import { combineMemoFilters, memoFilters } from "./memo.filters";
import {
	MemoNotWritableError,
	MemoWriteValidationError,
	bulkDeleteMemos,
	createMemo,
	deleteMemo,
	getMemoDetail,
	listMemos,
	updateMemo,
} from "./memo.service";

const MEMO_QUERY_FILTERS = new Set(["categories", "tags", "pinned", "q"]);

function noStore(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", "no-store");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

async function parseMutationBody(request: Request): Promise<Record<string, unknown> | Response> {
	const parsed = await parseJsonRequestBody(request);
	if (parsed instanceof Response) return parsed;
	if (!isRecord(parsed.value)) return invalidRequest("Expected a JSON object");

	return parsed.value;
}

function parseMemoPageId(pathname: string): string | Response | null {
	const match = pathname.match(/^\/api\/memos\/([^/]+)$/);
	if (!match || match[1] === "bulk-delete") return null;

	let rawPageId: string;
	try {
		rawPageId = decodeURIComponent(match[1]);
	} catch {
		return invalidNotionId("pageId");
	}

	return normalizeNotionId(rawPageId) ?? invalidNotionId("pageId");
}

function buildBodyFilter(filters: Record<string, unknown>): ReturnType<typeof combineMemoFilters> | Response {
	const categories = parseStringArrayValue(filters.categories, "categories");
	if (categories instanceof Response) return categories;
	const tags = parseStringArrayValue(filters.tags, "tags");
	if (tags instanceof Response) return tags;
	const pinned = parseBooleanValue(filters.pinned, "pinned");
	if (pinned instanceof Response) return pinned;
	const q = parseStringValue(filters.q, "q");
	if (q instanceof Response) return q;

	return combineMemoFilters([
		categories ? memoFilters.categories(categories) : undefined,
		tags ? memoFilters.tags(tags) : undefined,
		typeof pinned === "boolean" ? memoFilters.pinned(pinned) : undefined,
		q ? memoFilters.q(q) : undefined,
	]);
}

export async function handleMemoRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (url.pathname === "/api/memos/meta" && request.method === "GET") {
		return Response.json(
			await buildResourceMetadata(env, env.MEMOS_DATA_SOURCE_ID, "memos", [
				{ key: "memo", property: "Memo", writable: true },
				{ key: "categoryOptionId", property: "Category", writable: true },
				{ key: "tagOptionIds", property: "Tags", writable: true },
				{ key: "pinned", property: "Pinned", writable: true },
				{ key: "created", property: "Created", writable: false },
				{ key: "lastEdited", property: "Last Edited", writable: false },
			]),
		);
	}

	if (url.pathname === "/api/memos" && request.method === "GET") {
		const pagination = parsePaginationParams(url);
		if (pagination instanceof Response) return pagination;

		try {
			return withAcceptQuery(Response.json(await listMemos(env, undefined, pagination)));
		} catch (error) {
			const invalidCursorResponse = pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;
			if (invalidCursorResponse) return invalidCursorResponse;
			console.error(error);
			return Response.json({ error: "Failed to retrieve Memos" }, { status: 500 });
		}
	}

	if (url.pathname === "/api/memos" && request.method === "QUERY") {
		const query = await parseDomainQueryRequest(request, MEMO_QUERY_FILTERS);
		if (query instanceof Response) return query;

		const filter = buildBodyFilter(query.filters);
		if (filter instanceof Response) return filter;

		try {
			return withAcceptQuery(
				noStore(Response.json(await listMemos(env, filter, query.pagination))),
			);
		} catch (error) {
			const invalidCursorResponse = query.pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;
			if (invalidCursorResponse) return invalidCursorResponse;
			console.error(error);
			return Response.json({ error: "Failed to retrieve Memos" }, { status: 500 });
		}
	}

	if (url.pathname === "/api/memos" && request.method === "POST") {
		const body = await parseMutationBody(request);
		if (body instanceof Response) return body;

		try {
			return noStore(Response.json({ data: await createMemo(env, body) }, { status: 201 }));
		} catch (error) {
			if (error instanceof MemoWriteValidationError) return error.response;
			console.error(error);
			return Response.json({ error: "Failed to create Memo" }, { status: 500 });
		}
	}

	if (url.pathname === "/api/memos/bulk-delete" && request.method === "POST") {
		const body = await parseMutationBody(request);
		if (body instanceof Response) return body;
		const pageIds = parseBulkDeletePageIds(body);
		if (pageIds instanceof Response) return pageIds;

		try {
			return noStore(Response.json(await bulkDeleteMemos(env, pageIds)));
		} catch (error) {
			if (error instanceof MemoNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "Memo not found" }, { status: 404 });
			}
			console.error(error);
			return Response.json({ error: "Failed to delete Memos" }, { status: 500 });
		}
	}

	const pageId = parseMemoPageId(url.pathname);
	if (!pageId) return null;
	if (pageId instanceof Response) return pageId;

	if (request.method === "GET") {
		try {
			return noStore(Response.json(await getMemoDetail(env, pageId)));
		} catch (error) {
			if (error instanceof MemoNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "Memo not found" }, { status: 404 });
			}
			console.error(error);
			return Response.json({ error: "Failed to retrieve Memo" }, { status: 500 });
		}
	}

	if (request.method === "PATCH") {
		const body = await parseMutationBody(request);
		if (body instanceof Response) return body;

		try {
			return noStore(Response.json({ data: await updateMemo(env, pageId, body) }));
		} catch (error) {
			if (error instanceof MemoWriteValidationError) return error.response;
			if (error instanceof MemoNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "Memo not found" }, { status: 404 });
			}
			console.error(error);
			return Response.json({ error: "Failed to update Memo" }, { status: 500 });
		}
	}

	if (request.method === "DELETE") {
		try {
			return noStore(Response.json({ data: await deleteMemo(env, pageId) }));
		} catch (error) {
			if (error instanceof MemoNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "Memo not found" }, { status: 404 });
			}
			console.error(error);
			return Response.json({ error: "Failed to delete Memo" }, { status: 500 });
		}
	}

	return null;
}
