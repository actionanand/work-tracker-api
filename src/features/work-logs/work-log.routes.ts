import type { Env } from "../../shared/env";
import { parseDomainQueryRequest, withAcceptQuery } from "../../shared/http/http-query";
import { isRecord, parseJsonRequestBody } from "../../shared/http/request-body";
import {
	invalidNotionId,
	invalidRequest,
	parseBooleanValue,
	parseDateValue,
	parseNotionIdArrayValue,
	parseStringArrayValue,
} from "../../shared/http/validation";
import { normalizeNotionId, parseNotionIdParam } from "../../shared/notion/notion-id";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { NotionQueryError } from "../../shared/notion/notion-client";
import { buildResourceMetadata } from "../../shared/notion/notion-schema";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { combineWorkLogFilters, workLogFilters } from "./work-log.filters";
import {
	WorkLogNotWritableError,
	WorkLogWriteValidationError,
	createWorkLog,
	listWorkLogs,
	updateWorkLog,
} from "./work-log.service";

interface WorkLogRouteConfig {
	baseFilter?: NotionQueryFilter;
	supportsQueryFilters: boolean;
}

const workLogRouteConfigs = new Map<string, WorkLogRouteConfig>([
	[
		"/api/work-logs",
		{
			supportsQueryFilters: true,
		},
	],
	[
		"/api/work-logs/appraisal",
		{
			baseFilter: workLogFilters.appraisal as NotionQueryFilter,
			supportsQueryFilters: false,
		},
	],
]);

function parseDateParam(url: URL, name: "from" | "to"): string | Response | undefined {
	const value = url.searchParams.get(name);

	if (!value) {
		return undefined;
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return invalidDateResponse(name);
	}

	const date = new Date(`${value}T00:00:00.000Z`);

	if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
		return invalidDateResponse(name);
	}

	return value;
}

function invalidDateResponse(parameter: "from" | "to"): Response {
	return Response.json(
		{
			error: "Invalid date query parameter",
			parameter,
			expectedFormat: "YYYY-MM-DD",
		},
		{
			status: 400,
		},
	);
}

function selectParam(url: URL, name: "category" | "type" | "workMode"): string | undefined {
	const value = url.searchParams.get(name)?.trim();

	return value && value.length > 0 ? value : undefined;
}

function buildQueryFilter(
	url: URL,
	config: WorkLogRouteConfig,
): NotionQueryFilter | Response | undefined {
	if (!config.supportsQueryFilters) {
		return config.baseFilter;
	}

	const from = parseDateParam(url, "from");

	if (from instanceof Response) {
		return from;
	}

	const to = parseDateParam(url, "to");

	if (to instanceof Response) {
		return to;
	}

	const projectId = parseNotionIdParam(url, "projectId");

	if (projectId instanceof Response) {
		return projectId;
	}

	const jiraId = parseNotionIdParam(url, "jiraId");

	if (jiraId instanceof Response) {
		return jiraId;
	}

	const category = selectParam(url, "category");
	const type = selectParam(url, "type");
	const workMode = selectParam(url, "workMode");

	return combineWorkLogFilters([
		config.baseFilter,
		from ? workLogFilters.from(from) : undefined,
		to ? workLogFilters.to(to) : undefined,
		projectId ? workLogFilters.project(projectId) : undefined,
		jiraId ? workLogFilters.jira(jiraId) : undefined,
		category ? workLogFilters.category(category) : undefined,
		type ? workLogFilters.type(type) : undefined,
		workMode ? workLogFilters.workMode(workMode) : undefined,
	]);
}

const WORK_LOG_QUERY_FILTERS = new Set([
	"from",
	"to",
	"categories",
	"types",
	"workModes",
	"projectIds",
	"jiraIds",
	"appraisal",
]);

function buildBodyFilter(
	filters: Record<string, unknown>,
	baseFilter?: NotionQueryFilter,
): NotionQueryFilter | Response | undefined {
	const from = parseDateValue(filters.from, "from");
	if (from instanceof Response) return from;

	const to = parseDateValue(filters.to, "to");
	if (to instanceof Response) return to;

	const categories = parseStringArrayValue(filters.categories, "categories");
	if (categories instanceof Response) return categories;

	const types = parseStringArrayValue(filters.types, "types");
	if (types instanceof Response) return types;

	const workModes = parseStringArrayValue(filters.workModes, "workModes");
	if (workModes instanceof Response) return workModes;

	const projectIds = parseNotionIdArrayValue(filters.projectIds, "projectIds");
	if (projectIds instanceof Response) return projectIds;

	const jiraIds = parseNotionIdArrayValue(filters.jiraIds, "jiraIds");
	if (jiraIds instanceof Response) return jiraIds;

	const appraisal = parseBooleanValue(filters.appraisal, "appraisal");
	if (appraisal instanceof Response) return appraisal;

	return combineWorkLogFilters([
		baseFilter,
		from ? workLogFilters.from(from) : undefined,
		to ? workLogFilters.to(to) : undefined,
		categories ? workLogFilters.categories(categories) : undefined,
		types ? workLogFilters.types(types) : undefined,
		workModes ? workLogFilters.workModes(workModes) : undefined,
		projectIds ? workLogFilters.projects(projectIds) : undefined,
		jiraIds ? workLogFilters.jiras(jiraIds) : undefined,
		typeof appraisal === "boolean" ? workLogFilters.appraisalValue(appraisal) : undefined,
	]);
}

function parseWorkLogPageId(pathname: string): string | Response | null {
	const match = pathname.match(/^\/api\/work-logs\/([^/]+)$/);

	if (!match) {
		return null;
	}

	let rawPageId: string;

	try {
		rawPageId = decodeURIComponent(match[1]);
	} catch {
		return invalidNotionId("pageId");
	}

	const normalized = normalizeNotionId(rawPageId);

	return normalized ?? invalidNotionId("pageId");
}

function mutationHeaders(response: Response): Response {
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

	if (parsed instanceof Response) {
		return parsed;
	}

	if (!isRecord(parsed.value)) {
		return invalidRequest("Expected a JSON object");
	}

	return parsed.value;
}

export async function handleWorkLogRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = workLogRouteConfigs.get(url.pathname);

	if (url.pathname === "/api/work-logs/meta" && request.method === "GET") {
		return Response.json(
			await buildResourceMetadata(env, env.WORK_LOGS_DATA_SOURCE_ID, "work-logs", [
				{ key: "update", property: "Update", writable: true },
				{ key: "date", property: "Date", writable: true },
				{ key: "categoryOptionId", property: "Category", writable: true },
				{ key: "typeOptionId", property: "Type", writable: true },
				{ key: "workModeOptionId", property: "Work Mode", writable: true },
				{ key: "projectId", property: "Project", writable: true, optionsEndpoint: "/api/projects/active" },
				{ key: "jiraIds", property: "JIRAs", writable: true, optionsEndpoint: "/api/jiras" },
				{ key: "comment", property: "Comment", writable: true },
				{ key: "wentWrong", property: "Went Wrong", writable: true },
				{ key: "appraisal", property: "Appraisal", writable: true },
				{ key: "companyIds", property: "Company", writable: false },
				{ key: "teamIds", property: "Team", writable: false },
				{ key: "jiraStatuses", property: "Jira Status", writable: false },
				{ key: "sprintIds", property: "Sprints", writable: false },
				{ key: "spilloverCount", property: "Spillover Count", writable: false },
			]),
		);
	}

	if (request.method === "POST" && url.pathname === "/api/work-logs") {
		const body = await parseMutationBody(request);

		if (body instanceof Response) {
			return body;
		}

		try {
			return mutationHeaders(
				Response.json(
					{
						data: await createWorkLog(env, body),
					},
					{ status: 201 },
				),
			);
		} catch (error) {
			if (error instanceof WorkLogWriteValidationError) {
				return error.response;
			}

			console.error(error);

			return Response.json({ error: "Failed to create Work Log" }, { status: 500 });
		}
	}

	if (request.method === "PATCH") {
		const pageId = parseWorkLogPageId(url.pathname);

		if (!pageId) {
			return null;
		}

		if (pageId instanceof Response) {
			return pageId;
		}

		const body = await parseMutationBody(request);

		if (body instanceof Response) {
			return body;
		}

		try {
			return mutationHeaders(
				Response.json({
					data: await updateWorkLog(env, pageId, body),
				}),
			);
		} catch (error) {
			if (error instanceof WorkLogWriteValidationError) {
				return error.response;
			}

			if (error instanceof WorkLogNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "Work Log not found" }, { status: 404 });
			}

			console.error(error);

			return Response.json({ error: "Failed to update Work Log" }, { status: 500 });
		}
	}

	if (request.method === "QUERY" && config) {
		const query = await parseDomainQueryRequest(request, WORK_LOG_QUERY_FILTERS);

		if (query instanceof Response) {
			return query;
		}

		const filter = buildBodyFilter(query.filters, config.baseFilter);

		if (filter instanceof Response) {
			return filter;
		}

		try {
			return withAcceptQuery(
				Response.json(
					await listWorkLogs(env, filter, {
						includeRelations: query.includeRelations,
						pagination: query.pagination,
					}),
					{ headers: { "Cache-Control": "no-store" } },
				),
			);
		} catch (error) {
			const invalidCursorResponse = query.pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;

			if (invalidCursorResponse) {
				return invalidCursorResponse;
			}

			console.error(error);

			return Response.json({ error: "Failed to retrieve Work Logs" }, { status: 500 });
		}
	}

	if (request.method !== "GET" || !config) {
		return null;
	}

	const pagination = parsePaginationParams(url);

	if (pagination instanceof Response) {
		return pagination;
	}

	const includeRelations = parseIncludeRelations(url);

	if (includeRelations instanceof Response) {
		return includeRelations;
	}

	const filter = buildQueryFilter(url, config);

	if (filter instanceof Response) {
		return filter;
	}

	try {
		return withAcceptQuery(
			Response.json(
				await listWorkLogs(env, filter, { includeRelations, pagination }),
			),
		);
	} catch (error) {
		const invalidCursorResponse = pagination.cursor
			? invalidPaginationCursorResponse(error)
			: null;

		if (invalidCursorResponse) {
			return invalidCursorResponse;
		}

		console.error(error);

		return Response.json(
			{
				error: "Failed to retrieve Work Logs",
			},
			{
				status: 500,
			},
		);
	}
}
