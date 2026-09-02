import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { combineSprintFilters, sprintFilters } from "./sprint.filters";
import { listSprints } from "./sprint.service";

interface SprintRouteConfig {
	baseFilter?: NotionQueryFilter;
	sorts?: NotionQuerySort[];
	supportsQueryFilters: boolean;
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

function buildQueryFilter(
	url: URL,
	config: SprintRouteConfig,
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

	return combineSprintFilters([
		config.baseFilter,
		url.searchParams.get("projectId")
			? sprintFilters.project(url.searchParams.get("projectId") ?? "")
			: undefined,
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

	if (request.method !== "GET" || !config) {
		return null;
	}

	const filter = buildQueryFilter(url, config);

	if (filter instanceof Response) {
		return filter;
	}

	try {
		return Response.json(await listSprints(env, filter, config.sorts));
	} catch (error) {
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
