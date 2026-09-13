import type { Env } from "../../shared/env";
import { parseDomainQueryRequest, withAcceptQuery } from "../../shared/http/http-query";
import {
	invalidNotionId,
	invalidRequest,
	parseStringArrayValue,
	parseStringValue,
} from "../../shared/http/validation";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { normalizeNotionId } from "../../shared/notion/notion-id";
import { buildResourceMetadata } from "../../shared/notion/notion-schema";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import {
	combineReferenceLibraryFilters,
	referenceLibraryFilters,
} from "./reference-library.filters";
import {
	ReferenceLibraryValidationError,
	getReferenceImportStatus,
	getReferenceLibraryDetail,
	importReferenceMarkdown,
	isReferenceNotFound,
	listReferenceLibrary,
} from "./reference-library.service";

const REFERENCE_LIBRARY_QUERY_FILTERS = new Set(["categories", "tags", "q"]);

function noStore(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", "no-store");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function buildBodyFilter(
	filters: Record<string, unknown>,
): NotionQueryFilter | Response | undefined {
	const categories = parseStringArrayValue(filters.categories, "categories");
	if (categories instanceof Response) return categories;

	const tags = parseStringArrayValue(filters.tags, "tags");
	if (tags instanceof Response) return tags;

	const query = parseStringValue(filters.q, "q");
	if (query instanceof Response) return query;

	return combineReferenceLibraryFilters([
		categories ? referenceLibraryFilters.categories(categories) : undefined,
		tags ? referenceLibraryFilters.tags(tags) : undefined,
		query ? referenceLibraryFilters.query(query) : undefined,
	]);
}

function parseReferencePageId(pathname: string): string | Response | null {
	const match = pathname.match(/^\/api\/reference-library\/([^/]+)$/);
	if (!match || ["meta", "import", "imports"].includes(match[1])) return null;

	let rawPageId: string;
	try {
		rawPageId = decodeURIComponent(match[1]);
	} catch {
		return invalidNotionId("pageId");
	}

	return normalizeNotionId(rawPageId) ?? invalidNotionId("pageId");
}

function parseImportTaskId(pathname: string): string | Response | null {
	const match = pathname.match(/^\/api\/reference-library\/imports\/([^/]+)$/);
	if (!match) return null;

	let taskId: string;
	try {
		taskId = decodeURIComponent(match[1]).trim();
	} catch {
		return invalidRequest("Expected a valid import task ID", "taskId");
	}

	return taskId || invalidRequest("Expected a valid import task ID", "taskId");
}

export async function handleReferenceLibraryRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (url.pathname === "/api/reference-library/meta" && request.method === "GET") {
		return Response.json(
			await buildResourceMetadata(
				env,
				env.REFERENCE_LIBRARY_DATA_SOURCE_ID,
				"reference-library",
				[
					{ key: "article", property: "Article", writable: true },
					{ key: "categoryOptionId", property: "Category", writable: true },
					{ key: "tagOptionIds", property: "Tags", writable: true },
					{ key: "created", property: "Created", writable: false },
					{ key: "lastEdited", property: "Last Edited", writable: false },
				],
			),
		);
	}

	if (url.pathname === "/api/reference-library" && request.method === "GET") {
		const pagination = parsePaginationParams(url);
		if (pagination instanceof Response) return pagination;

		try {
			return withAcceptQuery(
				Response.json(await listReferenceLibrary(env, pagination)),
			);
		} catch (error) {
			const invalidCursorResponse = pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;
			if (invalidCursorResponse) return invalidCursorResponse;
			console.error(error);
			return Response.json(
				{ error: "Failed to retrieve Reference Library" },
				{ status: 500 },
			);
		}
	}

	if (url.pathname === "/api/reference-library" && request.method === "QUERY") {
		const query = await parseDomainQueryRequest(
			request,
			REFERENCE_LIBRARY_QUERY_FILTERS,
		);
		if (query instanceof Response) return query;
		if (query.includeRelations) {
			return invalidRequest(
				"Relation enrichment is not supported for Reference Library",
				"includeRelations",
			);
		}

		const filter = buildBodyFilter(query.filters);
		if (filter instanceof Response) return filter;

		try {
			return withAcceptQuery(
				noStore(
					Response.json(
						await listReferenceLibrary(env, query.pagination, filter),
					),
				),
			);
		} catch (error) {
			const invalidCursorResponse = query.pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;
			if (invalidCursorResponse) return invalidCursorResponse;
			console.error(error);
			return Response.json(
				{ error: "Failed to retrieve Reference Library" },
				{ status: 500 },
			);
		}
	}

	if (url.pathname === "/api/reference-library/import" && request.method === "POST") {
		try {
			return await importReferenceMarkdown(env, request);
		} catch (error) {
			if (error instanceof ReferenceLibraryValidationError) return error.response;
			console.error(error);
			return Response.json(
				{ error: "Failed to import Reference Library item" },
				{ status: 500, headers: { "Cache-Control": "no-store" } },
			);
		}
	}

	const taskId = parseImportTaskId(url.pathname);
	if (taskId) {
		if (taskId instanceof Response) return taskId;
		if (request.method !== "GET") return null;

		try {
			return await getReferenceImportStatus(env, taskId);
		} catch (error) {
			console.error(error);
			return Response.json(
				{ error: "Failed to retrieve Reference Library import status" },
				{ status: 500, headers: { "Cache-Control": "no-store" } },
			);
		}
	}

	const pageId = parseReferencePageId(url.pathname);
	if (!pageId) return null;
	if (pageId instanceof Response) return pageId;
	if (request.method !== "GET") return null;

	try {
		return Response.json(await getReferenceLibraryDetail(env, pageId), {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (error) {
		if (isReferenceNotFound(error)) {
			return Response.json(
				{ error: "Reference Library item not found" },
				{ status: 404 },
			);
		}
		console.error(error);
		return Response.json(
			{ error: "Failed to retrieve Reference Library item" },
			{ status: 500 },
		);
	}
}
