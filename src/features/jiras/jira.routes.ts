import type { Env } from "../../shared/env";
import { parseDomainQueryRequest, withAcceptQuery } from "../../shared/http/http-query";
import {
	parseBooleanValue,
	parseNotionIdArrayValue,
	parseStringArrayValue,
	parseStringValue,
} from "../../shared/http/validation";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { combineJiraFilters, jiraFilters } from "./jira.filters";
import {
	DuplicateJiraKeyError,
	JiraNotFoundError,
	getJiraByKey,
	listJiras,
} from "./jira.service";

const jiraRouteFilters = new Map<string, NotionQueryFilter | undefined>([
	["/api/jiras", undefined],
	["/api/jiras/active", jiraFilters.active],
	["/api/jiras/blocked", jiraFilters.blocked],
	["/api/jiras/spillovers", jiraFilters.spillovers],
	["/api/jiras/appraisal", jiraFilters.appraisal],
	["/api/jiras/demo-pending", jiraFilters.demoPending],
	["/api/jiras/demoed", jiraFilters.demoed],
]);

const JIRA_QUERY_FILTERS = new Set([
	"statuses",
	"tags",
	"sprintIds",
	"projectIds",
	"inActiveSprint",
	"spillover",
	"appraisal",
	"demoRequired",
	"q",
]);

function buildBodyFilter(filters: Record<string, unknown>): NotionQueryFilter | Response | undefined {
	const statuses = parseStringArrayValue(filters.statuses, "statuses");
	if (statuses instanceof Response) return statuses;

	const tags = parseStringArrayValue(filters.tags, "tags");
	if (tags instanceof Response) return tags;

	const sprintIds = parseNotionIdArrayValue(filters.sprintIds, "sprintIds");
	if (sprintIds instanceof Response) return sprintIds;

	const projectIds = parseNotionIdArrayValue(filters.projectIds, "projectIds");
	if (projectIds instanceof Response) return projectIds;

	const inActiveSprint = parseBooleanValue(filters.inActiveSprint, "inActiveSprint");
	if (inActiveSprint instanceof Response) return inActiveSprint;

	const spillover = parseBooleanValue(filters.spillover, "spillover");
	if (spillover instanceof Response) return spillover;

	const appraisal = parseBooleanValue(filters.appraisal, "appraisal");
	if (appraisal instanceof Response) return appraisal;

	const demoRequired = parseBooleanValue(filters.demoRequired, "demoRequired");
	if (demoRequired instanceof Response) return demoRequired;

	const query = parseStringValue(filters.q, "q");
	if (query instanceof Response) return query;

	return combineJiraFilters([
		statuses ? jiraFilters.statuses(statuses) : undefined,
		tags ? jiraFilters.tags(tags) : undefined,
		sprintIds ? jiraFilters.sprints(sprintIds) : undefined,
		projectIds ? jiraFilters.projects(projectIds) : undefined,
		typeof inActiveSprint === "boolean"
			? jiraFilters.inActiveSprintValue(inActiveSprint)
			: undefined,
		typeof spillover === "boolean" ? jiraFilters.spilloverValue(spillover) : undefined,
		typeof appraisal === "boolean" ? jiraFilters.appraisalValue(appraisal) : undefined,
		typeof demoRequired === "boolean"
			? jiraFilters.demoRequiredValue(demoRequired)
			: undefined,
		query ? jiraFilters.query(query) : undefined,
	]);
}

export async function handleJiraRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (request.method === "QUERY" && url.pathname === "/api/jiras") {
		const query = await parseDomainQueryRequest(request, JIRA_QUERY_FILTERS);

		if (query instanceof Response) {
			return query;
		}

		const filter = buildBodyFilter(query.filters);

		if (filter instanceof Response) {
			return filter;
		}

		try {
			return withAcceptQuery(
				Response.json(
					await listJiras(env, filter, {
						includeRelations: query.includeRelations,
						pagination: query.pagination,
					}),
					{ headers: { "Cache-Control": "no-store" } },
				),
			);
		} catch (error) {
			const invalidCursorResponse = query.pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;

			if (invalidCursorResponse) {
				return invalidCursorResponse;
			}

			console.error(error);

			return Response.json(
				{
					error: "Failed to retrieve JIRAs",
				},
				{
					status: 500,
				},
			);
		}
	}

	if (request.method !== "GET") {
		return null;
	}

	if (jiraRouteFilters.has(url.pathname)) {
		const pagination = parsePaginationParams(url);

		if (pagination instanceof Response) {
			return pagination;
		}

		const includeRelations = parseIncludeRelations(url);

		if (includeRelations instanceof Response) {
			return includeRelations;
		}

		const filter = jiraRouteFilters.get(url.pathname);

		try {
			return withAcceptQuery(
				Response.json(
					await listJiras(env, filter, { includeRelations, pagination }),
				),
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
					error: "Failed to retrieve JIRAs",
				},
				{
					status: 500,
				},
			);
		}
	}

	const jiraKey = parseJiraKeyPath(url.pathname);

	if (!jiraKey) {
		return null;
	}

	const includeRelations = parseIncludeRelations(url);

	if (includeRelations instanceof Response) {
		return includeRelations;
	}

	try {
		return Response.json(await getJiraByKey(env, jiraKey, { includeRelations }));
	} catch (error) {
		if (error instanceof JiraNotFoundError) {
			return Response.json(
				{
					error: "JIRA not found",
				},
				{
					status: 404,
				},
			);
		}

		if (error instanceof DuplicateJiraKeyError) {
			console.error(error.message);

			return Response.json(
				{
					error: "Duplicate JIRA key found",
				},
				{
					status: 500,
				},
			);
		}

		console.error(error);

		return Response.json(
			{
				error: "Failed to retrieve JIRA",
			},
			{
				status: 500,
			},
		);
	}
}

function parseJiraKeyPath(pathname: string): string | null {
	const match = pathname.match(/^\/api\/jiras\/([^/]+)$/);

	if (!match) {
		return null;
	}

	let jiraKey: string;

	try {
		jiraKey = decodeURIComponent(match[1]).trim();
	} catch {
		return null;
	}

	return /^[A-Za-z][A-Za-z0-9]+-\d+$/.test(jiraKey) ? jiraKey : null;
}
