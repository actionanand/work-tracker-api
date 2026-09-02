import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { combineCompanyFilters, companyFilters } from "./company.filters";
import { listCompanies } from "./company.service";

interface CompanyRouteConfig {
	baseFilter?: NotionQueryFilter;
	supportsQueryFilters: boolean;
}

const companyRouteConfigs = new Map<string, CompanyRouteConfig>([
	[
		"/api/companies",
		{
			supportsQueryFilters: true,
		},
	],
	[
		"/api/companies/active",
		{
			baseFilter: companyFilters.active as NotionQueryFilter,
			supportsQueryFilters: true,
		},
	],
]);

function buildQueryFilter(
	url: URL,
	config: CompanyRouteConfig,
): NotionQueryFilter | undefined {
	if (!config.supportsQueryFilters) {
		return config.baseFilter;
	}

	const category = url.searchParams.get("category")?.trim();

	return combineCompanyFilters([
		config.baseFilter,
		category ? companyFilters.category(category) : undefined,
	]);
}

export async function handleCompanyRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = companyRouteConfigs.get(url.pathname);

	if (request.method !== "GET" || !config) {
		return null;
	}

	try {
		return Response.json(await listCompanies(env, buildQueryFilter(url, config)));
	} catch (error) {
		console.error(error);

		return Response.json(
			{
				error: "Failed to retrieve Companies",
			},
			{
				status: 500,
			},
		);
	}
}
