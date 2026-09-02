import type { Env } from "../../shared/env";
import { parseNotionIdParam } from "../../shared/notion/notion-id";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { combineWorkLogFilters, workLogFilters } from "./work-log.filters";
import { listWorkLogs } from "./work-log.service";

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

export async function handleWorkLogRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = workLogRouteConfigs.get(url.pathname);

	if (request.method !== "GET" || !config) {
		return null;
	}

	const filter = buildQueryFilter(url, config);

	if (filter instanceof Response) {
		return filter;
	}

	try {
		return Response.json(await listWorkLogs(env, filter));
	} catch (error) {
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
