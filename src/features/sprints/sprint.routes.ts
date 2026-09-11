import type { Env } from "../../shared/env";
import { normalizeNotionId, parseNotionIdParam } from "../../shared/notion/notion-id";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { listProjectIdsByCompany } from "../projects/project.service";
import { combineSprintFilters, sprintFilters } from "./sprint.filters";
import { SprintNotFoundError, getSprintById, listSprints } from "./sprint.service";

interface SprintRouteConfig {
	baseFilter?: NotionQueryFilter;
	sorts?: NotionQuerySort[];
	supportsQueryFilters: boolean;
	supportsCompanyFilter?: boolean;
}

const sprintRouteConfigs = new Map<string, SprintRouteConfig>([
	[
		"/api/sprints",
		{
			supportsQueryFilters: true,
		},
	],
	[
		"/api/sprints/active",
		{
			baseFilter: sprintFilters.active as NotionQueryFilter,
			supportsQueryFilters: false,
		},
	],
	[
		"/api/sprints/history",
		{
			baseFilter: sprintFilters.history as NotionQueryFilter,
			sorts: [{ property: "Start Date", direction: "descending" }],
			supportsQueryFilters: true,
			supportsCompanyFilter: true,
		},
	],
]);

const emptySprintListResponse = {
	data: [],
	count: 0,
	hasMore: false,
	nextCursor: null,
};

const reservedSprintRouteSegments = new Set(["active", "history"]);

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

async function buildQueryFilter(
	url: URL,
	config: SprintRouteConfig,
	env: Env,
): Promise<NotionQueryFilter | Response | undefined> {
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

	const companyId = config.supportsCompanyFilter
		? parseNotionIdParam(url, "companyId")
		: undefined;

	if (companyId instanceof Response) {
		return companyId;
	}

	const companyProjectIds = companyId
		? await listProjectIdsByCompany(env, companyId)
		: undefined;

	if (companyProjectIds && companyProjectIds.length === 0) {
		return Response.json(emptySprintListResponse);
	}

	return combineSprintFilters([
		config.baseFilter,
		projectId ? sprintFilters.project(projectId) : undefined,
		companyProjectIds ? sprintFilters.projects(companyProjectIds) : undefined,
		from ? sprintFilters.from(from) : undefined,
		to ? sprintFilters.to(to) : undefined,
	]);
}

export async function handleSprintRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = sprintRouteConfigs.get(url.pathname);

	if (request.method !== "GET") {
		return null;
	}

	if (!config) {
		return handleSprintDetailRoute(url, env);
	}

	const pagination = parsePaginationParams(url);

	if (pagination instanceof Response) {
		return pagination;
	}

	const includeRelations = parseIncludeRelations(url);

	if (includeRelations instanceof Response) {
		return includeRelations;
	}

	const filter = await buildQueryFilter(url, config, env);

	if (filter instanceof Response) {
		return filter;
	}

	try {
		return Response.json(
			await listSprints(env, filter, config.sorts, {
				includeRelations,
				pagination,
			}),
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
				error: "Failed to retrieve Sprints",
			},
			{
				status: 500,
			},
		);
	}
}

function invalidSprintIdResponse(): Response {
	return Response.json(
		{
			error: "Invalid query parameter",
			parameter: "sprintId",
			message: "Expected a valid Notion page ID",
		},
		{
			status: 400,
		},
	);
}

function parseSprintIdPath(pathname: string): string | Response | null {
	const match = pathname.match(/^\/api\/sprints\/([^/]+)$/);

	if (!match) {
		return null;
	}

	let segment: string;

	try {
		segment = decodeURIComponent(match[1]).trim();
	} catch {
		return invalidSprintIdResponse();
	}

	if (reservedSprintRouteSegments.has(segment)) {
		return null;
	}

	return normalizeNotionId(segment) ?? invalidSprintIdResponse();
}

async function handleSprintDetailRoute(
	url: URL,
	env: Env,
): Promise<Response | null> {
	const sprintId = parseSprintIdPath(url.pathname);

	if (!sprintId) {
		return null;
	}

	if (sprintId instanceof Response) {
		return sprintId;
	}

	try {
		return Response.json(await getSprintById(env, sprintId));
	} catch (error) {
		if (error instanceof SprintNotFoundError) {
			return Response.json(
				{
					error: "Sprint not found",
				},
				{
					status: 404,
				},
			);
		}

		console.error(error);

		return Response.json(
			{
				error: "Failed to retrieve Sprint",
			},
			{
				status: 500,
			},
		);
	}
}
