import type { Env } from "../../shared/env";
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

function buildQueryFilter(
	url: URL,
	config: SprintAllocationRouteConfig,
): NotionQueryFilter | Response | undefined {
	if (!config.supportsQueryFilters) {
		return config.baseFilter;
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
		config.baseFilter,
		sprintId ? sprintAllocationFilters.sprint(sprintId) : undefined,
		jiraId ? sprintAllocationFilters.jira(jiraId) : undefined,
	]);
}

export async function handleSprintAllocationRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = sprintAllocationRouteConfigs.get(url.pathname);

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
		return Response.json(await listSprintAllocations(env, filter, { pagination }));
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
