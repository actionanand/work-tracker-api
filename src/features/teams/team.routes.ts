import type { Env } from "../../shared/env";
import { parseNotionIdParam } from "../../shared/notion/notion-id";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import { combineTeamFilters, teamFilters } from "./team.filters";
import { listTeams } from "./team.service";

interface TeamRouteConfig {
	baseFilter?: NotionQueryFilter;
	supportsQueryFilters: boolean;
}

const teamRouteConfigs = new Map<string, TeamRouteConfig>([
	[
		"/api/teams",
		{
			supportsQueryFilters: true,
		},
	],
	[
		"/api/teams/active",
		{
			baseFilter: teamFilters.active as NotionQueryFilter,
			supportsQueryFilters: true,
		},
	],
]);

function buildQueryFilter(
	url: URL,
	config: TeamRouteConfig,
): NotionQueryFilter | Response | undefined {
	if (!config.supportsQueryFilters) {
		return config.baseFilter;
	}

	const companyId = parseNotionIdParam(url, "companyId");

	if (companyId instanceof Response) {
		return companyId;
	}

	return combineTeamFilters([
		config.baseFilter,
		companyId ? teamFilters.company(companyId) : undefined,
	]);
}

export async function handleTeamRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = teamRouteConfigs.get(url.pathname);

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
		return Response.json(await listTeams(env, filter, { pagination }));
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
				error: "Failed to retrieve Teams",
			},
			{
				status: 500,
			},
		);
	}
}
