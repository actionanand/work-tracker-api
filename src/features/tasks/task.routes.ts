import type { Env } from "../../shared/env";
import { parseBulkDeletePageIds } from "../../shared/http/bulk-delete";
import { parseDomainQueryRequest, withAcceptQuery } from "../../shared/http/http-query";
import { isRecord, parseJsonRequestBody } from "../../shared/http/request-body";
import {
	invalidNotionId,
	invalidRequest,
	parseDateValue,
	parseNotionIdArrayValue,
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
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { combineTaskFilters, taskFilters } from "./task.filters";
import {
	TaskNotWritableError,
	TaskWriteValidationError,
	bulkDeleteTasks,
	createTask,
	deleteTask,
	listTasks,
	updateTask,
} from "./task.service";

const TASK_QUERY_FILTERS = new Set([
	"statuses",
	"priorities",
	"responsibilities",
	"requestedByTypes",
	"assignedToTypes",
	"companyIds",
	"jiraIds",
	"dueFrom",
	"dueTo",
	"dueBefore",
	"dueOnOrBefore",
	"followUpFrom",
	"followUpTo",
	"followUpBefore",
	"followUpOnOrBefore",
	"completedFrom",
	"completedTo",
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

function parseTaskPageId(pathname: string): string | Response | null {
	const match = pathname.match(/^\/api\/tasks\/([^/]+)$/);
	if (!match || match[1] === "bulk-delete") return null;

	let rawPageId: string;
	try {
		rawPageId = decodeURIComponent(match[1]);
	} catch {
		return invalidNotionId("pageId");
	}

	return normalizeNotionId(rawPageId) ?? invalidNotionId("pageId");
}

function buildBodyFilter(filters: Record<string, unknown>): ReturnType<typeof combineTaskFilters> | Response {
	const statuses = parseStringArrayValue(filters.statuses, "statuses");
	if (statuses instanceof Response) return statuses;
	const priorities = parseStringArrayValue(filters.priorities, "priorities");
	if (priorities instanceof Response) return priorities;
	const responsibilities = parseStringArrayValue(filters.responsibilities, "responsibilities");
	if (responsibilities instanceof Response) return responsibilities;
	const requestedByTypes = parseStringArrayValue(filters.requestedByTypes, "requestedByTypes");
	if (requestedByTypes instanceof Response) return requestedByTypes;
	const assignedToTypes = parseStringArrayValue(filters.assignedToTypes, "assignedToTypes");
	if (assignedToTypes instanceof Response) return assignedToTypes;
	const companyIds = parseNotionIdArrayValue(filters.companyIds, "companyIds");
	if (companyIds instanceof Response) return companyIds;
	const jiraIds = parseNotionIdArrayValue(filters.jiraIds, "jiraIds");
	if (jiraIds instanceof Response) return jiraIds;
	const q = parseStringValue(filters.q, "q");
	if (q instanceof Response) return q;

	const dateFilters: Array<ReturnType<typeof combineTaskFilters>> = [];
	const dateConfig: Array<[string, string, string, string]> = [
		["dueFrom", "Due Date", "from", "dueFrom"],
		["dueTo", "Due Date", "to", "dueTo"],
		["dueBefore", "Due Date", "before", "dueBefore"],
		["dueOnOrBefore", "Due Date", "to", "dueOnOrBefore"],
		["followUpFrom", "Follow-up Date", "from", "followUpFrom"],
		["followUpTo", "Follow-up Date", "to", "followUpTo"],
		["followUpBefore", "Follow-up Date", "before", "followUpBefore"],
		["followUpOnOrBefore", "Follow-up Date", "to", "followUpOnOrBefore"],
		["completedFrom", "Completed Date", "from", "completedFrom"],
		["completedTo", "Completed Date", "to", "completedTo"],
	];

	for (const [bodyField, property, mode, apiField] of dateConfig) {
		const parsed = parseDateValue(filters[bodyField], apiField);
		if (parsed instanceof Response) return parsed;
		if (parsed) {
			dateFilters.push(
				mode === "from"
					? taskFilters.dateFrom(property, parsed)
					: mode === "before"
						? taskFilters.dateBefore(property, parsed)
						: taskFilters.dateTo(property, parsed),
			);
		}
	}

	return combineTaskFilters([
		statuses ? taskFilters.statuses(statuses) : undefined,
		priorities ? taskFilters.priorities(priorities) : undefined,
		responsibilities ? taskFilters.responsibilities(responsibilities) : undefined,
		requestedByTypes ? taskFilters.requestedByTypes(requestedByTypes) : undefined,
		assignedToTypes ? taskFilters.assignedToTypes(assignedToTypes) : undefined,
		companyIds ? taskFilters.companies(companyIds) : undefined,
		jiraIds ? taskFilters.jiras(jiraIds) : undefined,
		q ? taskFilters.q(q) : undefined,
		...dateFilters,
	]);
}

export async function handleTaskRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (url.pathname === "/api/tasks/meta" && request.method === "GET") {
		return Response.json(
			await buildResourceMetadata(env, env.TASKS_DATA_SOURCE_ID, "tasks", [
				{ key: "task", property: "Task", writable: true },
				{ key: "statusOptionId", property: "Status", writable: true },
				{ key: "priorityOptionId", property: "Priority", writable: true },
				{ key: "responsibilityOptionId", property: "Responsibility", writable: true },
				{ key: "requestedBy", property: "Requested By", writable: true },
				{ key: "requestedByTypeOptionId", property: "Requested By Type", writable: true },
				{ key: "assignedTo", property: "Assigned To", writable: true },
				{ key: "assignedToTypeOptionId", property: "Assigned To Type", writable: true },
				{ key: "dueDate", property: "Due Date", writable: true },
				{ key: "followUpDate", property: "Follow-up Date", writable: true },
				{ key: "completedDate", property: "Completed Date", writable: true },
				{ key: "companyId", property: "Company", writable: true, optionsEndpoint: "/api/companies" },
				{ key: "jiraIds", property: "JIRAs", writable: true, optionsEndpoint: "/api/jiras" },
				{ key: "notes", property: "Notes", writable: true },
				{ key: "outcomeUpdate", property: "Outcome / Update", writable: true },
				{ key: "created", property: "Created", writable: false },
				{ key: "lastEdited", property: "Last Edited", writable: false },
			]),
		);
	}

	if (url.pathname === "/api/tasks" && request.method === "GET") {
		const pagination = parsePaginationParams(url);
		if (pagination instanceof Response) return pagination;
		const includeRelations = parseIncludeRelations(url);
		if (includeRelations instanceof Response) return includeRelations;

		try {
			return withAcceptQuery(
				Response.json(await listTasks(env, undefined, { includeRelations, pagination })),
			);
		} catch (error) {
			const invalidCursorResponse = pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;
			if (invalidCursorResponse) return invalidCursorResponse;
			console.error(error);
			return Response.json({ error: "Failed to retrieve Tasks" }, { status: 500 });
		}
	}

	if (url.pathname === "/api/tasks" && request.method === "QUERY") {
		const query = await parseDomainQueryRequest(request, TASK_QUERY_FILTERS);
		if (query instanceof Response) return query;

		const filter = buildBodyFilter(query.filters);
		if (filter instanceof Response) return filter;

		try {
			return withAcceptQuery(
				noStore(
					Response.json(
						await listTasks(env, filter, {
							includeRelations: query.includeRelations,
							pagination: query.pagination,
						}),
					),
				),
			);
		} catch (error) {
			const invalidCursorResponse = query.pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;
			if (invalidCursorResponse) return invalidCursorResponse;
			console.error(error);
			return Response.json({ error: "Failed to retrieve Tasks" }, { status: 500 });
		}
	}

	if (url.pathname === "/api/tasks" && request.method === "POST") {
		const body = await parseMutationBody(request);
		if (body instanceof Response) return body;

		try {
			return noStore(Response.json({ data: await createTask(env, body) }, { status: 201 }));
		} catch (error) {
			if (error instanceof TaskWriteValidationError) return error.response;
			console.error(error);
			return Response.json({ error: "Failed to create Task" }, { status: 500 });
		}
	}

	if (url.pathname === "/api/tasks/bulk-delete" && request.method === "POST") {
		const body = await parseMutationBody(request);
		if (body instanceof Response) return body;
		const pageIds = parseBulkDeletePageIds(body);
		if (pageIds instanceof Response) return pageIds;

		try {
			return noStore(Response.json(await bulkDeleteTasks(env, pageIds)));
		} catch (error) {
			if (error instanceof TaskNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "Task not found" }, { status: 404 });
			}
			console.error(error);
			return Response.json({ error: "Failed to delete Tasks" }, { status: 500 });
		}
	}

	const pageId = parseTaskPageId(url.pathname);
	if (!pageId) return null;
	if (pageId instanceof Response) return pageId;

	if (request.method === "PATCH") {
		const body = await parseMutationBody(request);
		if (body instanceof Response) return body;

		try {
			return noStore(Response.json({ data: await updateTask(env, pageId, body) }));
		} catch (error) {
			if (error instanceof TaskWriteValidationError) return error.response;
			if (error instanceof TaskNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "Task not found" }, { status: 404 });
			}
			console.error(error);
			return Response.json({ error: "Failed to update Task" }, { status: 500 });
		}
	}

	if (request.method === "DELETE") {
		try {
			return noStore(Response.json({ data: await deleteTask(env, pageId) }));
		} catch (error) {
			if (error instanceof TaskNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "Task not found" }, { status: 404 });
			}
			console.error(error);
			return Response.json({ error: "Failed to delete Task" }, { status: 500 });
		}
	}

	return null;
}
