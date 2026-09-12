import type { Env } from "../../shared/env";
import { parseBulkDeletePageIds } from "../../shared/http/bulk-delete";
import { parseDomainQueryRequest, withAcceptQuery } from "../../shared/http/http-query";
import { isRecord, parseJsonRequestBody } from "../../shared/http/request-body";
import {
	invalidNotionId,
	invalidRequest,
	parseDateValue,
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
import { combineTodoFilters, todoFilters } from "./todo.filters";
import {
	TodoNotWritableError,
	TodoWriteValidationError,
	bulkDeleteTodos,
	createTodo,
	deleteTodo,
	listTodos,
	updateTodo,
} from "./todo.service";

const TODO_QUERY_FILTERS = new Set([
	"statuses",
	"dueFrom",
	"dueTo",
	"dueBefore",
	"dueOnOrBefore",
	"q",
]);

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

function parseTodoPageId(pathname: string): string | Response | null {
	const match = pathname.match(/^\/api\/todos\/([^/]+)$/);
	if (!match || match[1] === "bulk-delete") return null;

	let rawPageId: string;
	try {
		rawPageId = decodeURIComponent(match[1]);
	} catch {
		return invalidNotionId("pageId");
	}

	return normalizeNotionId(rawPageId) ?? invalidNotionId("pageId");
}

function buildBodyFilter(filters: Record<string, unknown>): ReturnType<typeof combineTodoFilters> | Response {
	const statuses = parseStringArrayValue(filters.statuses, "statuses");
	if (statuses instanceof Response) return statuses;

	const dueFrom = parseDateValue(filters.dueFrom, "dueFrom");
	if (dueFrom instanceof Response) return dueFrom;
	const dueTo = parseDateValue(filters.dueTo, "dueTo");
	if (dueTo instanceof Response) return dueTo;
	const dueBefore = parseDateValue(filters.dueBefore, "dueBefore");
	if (dueBefore instanceof Response) return dueBefore;
	const dueOnOrBefore = parseDateValue(filters.dueOnOrBefore, "dueOnOrBefore");
	if (dueOnOrBefore instanceof Response) return dueOnOrBefore;

	const q = parseStringValue(filters.q, "q");
	if (q instanceof Response) return q;

	return combineTodoFilters([
		statuses ? todoFilters.statuses(statuses) : undefined,
		dueFrom ? todoFilters.dueFrom(dueFrom) : undefined,
		dueTo ? todoFilters.dueTo(dueTo) : undefined,
		dueBefore ? todoFilters.dueBefore(dueBefore) : undefined,
		dueOnOrBefore ? todoFilters.dueOnOrBefore(dueOnOrBefore) : undefined,
		q ? todoFilters.q(q) : undefined,
	]);
}

export async function handleTodoRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (url.pathname === "/api/todos/meta" && request.method === "GET") {
		return Response.json(
			await buildResourceMetadata(env, env.TODOS_DATA_SOURCE_ID, "todos", [
				{ key: "toDo", property: "To Do", writable: true },
				{ key: "statusOptionId", property: "Status", writable: true },
				{ key: "dueDate", property: "Due Date", writable: true },
				{ key: "assignee", property: "Assignee", writable: false },
				{ key: "notes", property: "Notes", writable: true },
				{ key: "created", property: "Created", writable: false },
				{ key: "lastEdited", property: "Last Edited", writable: false },
			]),
		);
	}

	if (url.pathname === "/api/todos" && request.method === "GET") {
		const pagination = parsePaginationParams(url);
		if (pagination instanceof Response) return pagination;

		try {
			return withAcceptQuery(Response.json(await listTodos(env, undefined, pagination)));
		} catch (error) {
			const invalidCursorResponse = pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;
			if (invalidCursorResponse) return invalidCursorResponse;
			console.error(error);
			return Response.json({ error: "Failed to retrieve To Dos" }, { status: 500 });
		}
	}

	if (url.pathname === "/api/todos" && request.method === "QUERY") {
		const query = await parseDomainQueryRequest(request, TODO_QUERY_FILTERS);
		if (query instanceof Response) return query;

		const filter = buildBodyFilter(query.filters);
		if (filter instanceof Response) return filter;

		try {
			return withAcceptQuery(
				noStore(Response.json(await listTodos(env, filter, query.pagination))),
			);
		} catch (error) {
			const invalidCursorResponse = query.pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;
			if (invalidCursorResponse) return invalidCursorResponse;
			console.error(error);
			return Response.json({ error: "Failed to retrieve To Dos" }, { status: 500 });
		}
	}

	if (url.pathname === "/api/todos" && request.method === "POST") {
		const body = await parseMutationBody(request);
		if (body instanceof Response) return body;

		try {
			return noStore(Response.json({ data: await createTodo(env, body) }, { status: 201 }));
		} catch (error) {
			if (error instanceof TodoWriteValidationError) return error.response;
			console.error(error);
			return Response.json({ error: "Failed to create To Do" }, { status: 500 });
		}
	}

	if (url.pathname === "/api/todos/bulk-delete" && request.method === "POST") {
		const body = await parseMutationBody(request);
		if (body instanceof Response) return body;
		const pageIds = parseBulkDeletePageIds(body);
		if (pageIds instanceof Response) return pageIds;

		try {
			return noStore(Response.json(await bulkDeleteTodos(env, pageIds)));
		} catch (error) {
			if (error instanceof TodoNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "To Do not found" }, { status: 404 });
			}
			console.error(error);
			return Response.json({ error: "Failed to delete To Dos" }, { status: 500 });
		}
	}

	const pageId = parseTodoPageId(url.pathname);
	if (!pageId) return null;
	if (pageId instanceof Response) return pageId;

	if (request.method === "PATCH") {
		const body = await parseMutationBody(request);
		if (body instanceof Response) return body;

		try {
			return noStore(Response.json({ data: await updateTodo(env, pageId, body) }));
		} catch (error) {
			if (
				error instanceof TodoWriteValidationError
			) return error.response;
			if (error instanceof TodoNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "To Do not found" }, { status: 404 });
			}
			console.error(error);
			return Response.json({ error: "Failed to update To Do" }, { status: 500 });
		}
	}

	if (request.method === "DELETE") {
		try {
			return noStore(Response.json({ data: await deleteTodo(env, pageId) }));
		} catch (error) {
			if (error instanceof TodoNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "To Do not found" }, { status: 404 });
			}
			console.error(error);
			return Response.json({ error: "Failed to delete To Do" }, { status: 500 });
		}
	}

	return null;
}
