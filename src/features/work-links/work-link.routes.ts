import type { Env } from "../../shared/env";
import { parseNotionIdParam } from "../../shared/notion/notion-id";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { combineWorkLinkFilters, workLinkFilters } from "./work-link.filters";
import { listWorkLinks } from "./work-link.service";

interface WorkLinkRouteConfig {
	baseFilter?: NotionQueryFilter;
}

const workLinkRouteConfigs = new Map<string, WorkLinkRouteConfig>([
	["/api/work-links", {}],
	[
		"/api/work-links/active",
		{
			baseFilter: workLinkFilters.active as NotionQueryFilter,
		},
	],
]);

function textParam(url: URL, name: "type" | "q"): string | undefined {
	const value = url.searchParams.get(name)?.trim();

	return value && value.length > 0 ? value : undefined;
}

function buildQueryFilter(
	url: URL,
	config: WorkLinkRouteConfig,
): NotionQueryFilter | Response | undefined {
	const companyId = parseNotionIdParam(url, "companyId");

	if (companyId instanceof Response) {
		return companyId;
	}

	const projectId = parseNotionIdParam(url, "projectId");

	if (projectId instanceof Response) {
		return projectId;
	}

	const type = textParam(url, "type");
	const query = textParam(url, "q");

	return combineWorkLinkFilters([
		config.baseFilter,
		companyId ? workLinkFilters.company(companyId) : undefined,
		projectId ? workLinkFilters.project(projectId) : undefined,
		type ? workLinkFilters.type(type) : undefined,
		query ? workLinkFilters.query(query) : undefined,
	]);
}

export async function handleWorkLinkRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = workLinkRouteConfigs.get(url.pathname);

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
		return Response.json(await listWorkLinks(env, filter, { includeRelations }));
	} catch (error) {
		console.error(error);

		return Response.json(
			{
				error: "Failed to retrieve Work Links",
			},
			{
				status: 500,
			},
		);
	}
}
