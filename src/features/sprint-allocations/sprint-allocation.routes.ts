import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
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
): NotionQueryFilter | undefined {
	if (!config.supportsQueryFilters) {
		return config.baseFilter;
	}

	return combineSprintAllocationFilters([
		config.baseFilter,
		url.searchParams.get("sprintId")
			? sprintAllocationFilters.sprint(url.searchParams.get("sprintId") ?? "")
			: undefined,
		url.searchParams.get("jiraId")
			? sprintAllocationFilters.jira(url.searchParams.get("jiraId") ?? "")
			: undefined,
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

	try {
		return Response.json(await listSprintAllocations(env, buildQueryFilter(url, config)));
	} catch (error) {
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
