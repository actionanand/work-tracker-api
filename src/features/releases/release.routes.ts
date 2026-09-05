import type { Env } from "../../shared/env";
import { parseNotionIdParam } from "../../shared/notion/notion-id";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { combineReleaseFilters, releaseFilters } from "./release.filters";
import {
	listReleaseItems,
	releaseAnnouncedDateSorts,
	releaseConfirmedDateSorts,
} from "./release.service";

interface ReleaseRouteConfig {
	baseFilter?: NotionQueryFilter;
	sorts: NotionQuerySort[];
}

const releaseRouteConfigs = new Map<string, ReleaseRouteConfig>([
	[
		"/api/releases",
		{
			sorts: releaseAnnouncedDateSorts,
		},
	],
	[
		"/api/releases/pending",
		{
			baseFilter: releaseFilters.pending as NotionQueryFilter,
			sorts: releaseAnnouncedDateSorts,
		},
	],
	[
		"/api/releases/confirmed",
		{
			baseFilter: releaseFilters.confirmed as NotionQueryFilter,
			sorts: releaseConfirmedDateSorts,
		},
	],
	[
		"/api/releases/not-announced",
		{
			baseFilter: releaseFilters.notAnnounced as NotionQueryFilter,
			sorts: releaseAnnouncedDateSorts,
		},
	],
]);

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

function textParam(
	url: URL,
	name: "deploymentType" | "component",
): string | undefined {
	const value = url.searchParams.get(name)?.trim();

	return value && value.length > 0 ? value : undefined;
}

function buildQueryFilter(
	url: URL,
	config: ReleaseRouteConfig,
): NotionQueryFilter | Response | undefined {
	const jiraId = parseNotionIdParam(url, "jiraId");

	if (jiraId instanceof Response) {
		return jiraId;
	}

	const from = parseDateParam(url, "from");

	if (from instanceof Response) {
		return from;
	}

	const to = parseDateParam(url, "to");

	if (to instanceof Response) {
		return to;
	}

	const deploymentType = textParam(url, "deploymentType");
	const component = textParam(url, "component");

	return combineReleaseFilters([
		config.baseFilter,
		jiraId ? releaseFilters.jira(jiraId) : undefined,
		deploymentType ? releaseFilters.deploymentType(deploymentType) : undefined,
		component ? releaseFilters.component(component) : undefined,
		from ? releaseFilters.from(from) : undefined,
		to ? releaseFilters.to(to) : undefined,
	]);
}

export async function handleReleaseRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = releaseRouteConfigs.get(url.pathname);

	if (request.method !== "GET" || !config) {
		return null;
	}

	const pagination = parsePaginationParams(url);

	if (pagination instanceof Response) {
		return pagination;
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
		return Response.json(
			await listReleaseItems(env, filter, config.sorts, {
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
				error: "Failed to retrieve Release Items",
			},
			{
				status: 500,
			},
		);
	}
}
