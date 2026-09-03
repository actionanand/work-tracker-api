import type { Env } from "../../shared/env";
import { parseNotionIdParam } from "../../shared/notion/notion-id";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { combineProjectFilters, projectFilters } from "./project.filters";
import { listProjects } from "./project.service";

interface ProjectRouteConfig {
	baseFilter?: NotionQueryFilter;
	supportsQueryFilters: boolean;
}

const projectRouteConfigs = new Map<string, ProjectRouteConfig>([
	[
		"/api/projects",
		{
			supportsQueryFilters: true,
		},
	],
	[
		"/api/projects/active",
		{
			baseFilter: projectFilters.active as NotionQueryFilter,
			supportsQueryFilters: true,
		},
	],
]);

function buildQueryFilter(
	url: URL,
	config: ProjectRouteConfig,
): NotionQueryFilter | Response | undefined {
	if (!config.supportsQueryFilters) {
		return config.baseFilter;
	}

	const companyId = parseNotionIdParam(url, "companyId");

	if (companyId instanceof Response) {
		return companyId;
	}

	const teamId = parseNotionIdParam(url, "teamId");

	if (teamId instanceof Response) {
		return teamId;
	}

	return combineProjectFilters([
		config.baseFilter,
		companyId ? projectFilters.company(companyId) : undefined,
		teamId ? projectFilters.team(teamId) : undefined,
	]);
}

export async function handleProjectRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = projectRouteConfigs.get(url.pathname);

	if (request.method !== "GET" || !config) {
		return null;
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
		return Response.json(await listProjects(env, filter, { includeRelations }));
	} catch (error) {
		console.error(error);

		return Response.json(
			{
				error: "Failed to retrieve Projects",
			},
			{
				status: 500,
			},
		);
	}
}
