import type { Env } from "../../shared/env";
import { parseDomainQueryRequest, withAcceptQuery } from "../../shared/http/http-query";
import {
	parseBooleanValue,
	parseNotionIdArrayValue,
} from "../../shared/http/validation";
import { parseNotionIdParam } from "../../shared/notion/notion-id";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import {
	combineSprintAllocationFilters,
	sprintAllocationFilters,
} from "./sprint-allocation.filters";
import { listSprintAllocations } from "./sprint-allocation.service";

interface SprintAllocationRouteConfig {
	baseFilter?: NotionQueryFilter;
	supportsQueryFilters: boolean;
}

const sprintAllocationRouteConfigs = new Map<
	string,
	SprintAllocationRouteConfig
>([
	[
		"/api/sprint-allocations",
		{
			supportsQueryFilters: true,
		},
	],
	[
		"/api/sprint-allocations/current",
		{
			baseFilter: sprintAllocationFilters.current as NotionQueryFilter,
			supportsQueryFilters: false,
		},
	],
]);

const SPRINT_ALLOCATION_QUERY_FILTERS = new Set([
	"sprintIds",
	"jiraIds",
	"spilled",
]);

function buildQueryFilter(
	url: URL,
	config: SprintAllocationRouteConfig,
): NotionQueryFilter | Response | undefined {
	if (!config.supportsQueryFilters) {
		return combineSprintAllocationFilters([
			sprintAllocationFilters.validForList as NotionQueryFilter,
			config.baseFilter,
		]);
	}

	const sprintId = parseNotionIdParam(url, "sprintId");

	if (sprintId instanceof Response) {
		return sprintId;
	}

	const jiraId = parseNotionIdParam(url, "jiraId");

	if (jiraId instanceof Response) {
		return jiraId;
	}

	return combineSprintAllocationFilters([
		sprintAllocationFilters.validForList as NotionQueryFilter,
		config.baseFilter,
		sprintId ? sprintAllocationFilters.sprint(sprintId) : undefined,
		jiraId ? sprintAllocationFilters.jira(jiraId) : undefined,
	]);
}

function buildBodyFilter(
	filters: Record<string, unknown>,
): NotionQueryFilter | Response | undefined {
	const sprintIds = parseNotionIdArrayValue(filters.sprintIds, "sprintIds");
	if (sprintIds instanceof Response) return sprintIds;

	const jiraIds = parseNotionIdArrayValue(filters.jiraIds, "jiraIds");
	if (jiraIds instanceof Response) return jiraIds;

	const spilled = parseBooleanValue(filters.spilled, "spilled");
	if (spilled instanceof Response) return spilled;

	return combineSprintAllocationFilters([
		sprintAllocationFilters.validForList as NotionQueryFilter,
		sprintIds ? sprintAllocationFilters.sprints(sprintIds) : undefined,
		jiraIds ? sprintAllocationFilters.jiras(jiraIds) : undefined,
		typeof spilled === "boolean"
			? sprintAllocationFilters.spilled(spilled)
			: undefined,
	]);
}

export async function handleSprintAllocationRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = sprintAllocationRouteConfigs.get(url.pathname);

	if (request.method === "QUERY" && url.pathname === "/api/sprint-allocations") {
		const query = await parseDomainQueryRequest(
			request,
			SPRINT_ALLOCATION_QUERY_FILTERS,
		);
		if (query instanceof Response) return query;
		if (query.includeRelations) {
			return Response.json(
				{
					error: "Invalid request",
					field: "includeRelations",
					message: "Relation enrichment is not supported for Sprint Allocations",
				},
				{ status: 400 },
			);
		}

		const filter = buildBodyFilter(query.filters);
		if (filter instanceof Response) return filter;

		try {
			return withAcceptQuery(
				Response.json(
					await listSprintAllocations(env, filter, { pagination: query.pagination }),
					{ headers: { "Cache-Control": "no-store" } },
				),
			);
		} catch (error) {
			const invalidCursorResponse = query.pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;
			if (invalidCursorResponse) return invalidCursorResponse;

			console.error(error);
			return Response.json(
				{ error: "Failed to retrieve Sprint Allocations" },
				{ status: 500 },
			);
		}
	}

	if (request.method !== "GET" || !config) {
		return null;
	}

	const pagination = parsePaginationParams(url);

	if (pagination instanceof Response) {
		return pagination;
	}

	const filter = buildQueryFilter(url, config);

	if (filter instanceof Response) {
		return filter;
	}

	try {
		const response = Response.json(
			await listSprintAllocations(env, filter, { pagination }),
		);

		return url.pathname === "/api/sprint-allocations"
			? withAcceptQuery(response)
			: response;
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
				error: "Failed to retrieve Sprint Allocations",
			},
			{
				status: 500,
			},
		);
	}
}
