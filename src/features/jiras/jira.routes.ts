import type { Env } from "../../shared/env";
import { parseDomainQueryRequest, withAcceptQuery } from "../../shared/http/http-query";
import { isRecord, parseJsonRequestBody } from "../../shared/http/request-body";
import {
	parseBooleanValue,
	invalidRequest,
	parseNotionIdArrayValue,
	parseStringArrayValue,
	parseStringValue,
} from "../../shared/http/validation";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { buildResourceMetadata } from "../../shared/notion/notion-schema";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { combineJiraFilters, jiraFilters } from "./jira.filters";
import {
	ActiveSprintConfigurationError,
	DuplicateJiraKeyError,
	JiraAlreadyExistsError,
	JiraNotFoundError,
	JiraWriteValidationError,
	createJira,
	getJiraByKey,
	listJiraOptions,
	listJiras,
} from "./jira.service";
import { normalizeJiraKey } from "./jira.validation";

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
	"linkedJiraIds",
	"linkedFromIds",
	"linkTypes",
	"resolved",
	"q",
]);

const JIRA_OPTIONS_QUERY_FILTERS = new Set(["q"]);
const JIRA_OPTIONS_DEFAULT_PAGE_SIZE = 20;

function buildBodyFilter(filters: Record<string, unknown>): NotionQueryFilter | Response | undefined {
	const statuses = parseStringArrayValue(filters.statuses, "statuses");
	if (statuses instanceof Response) return statuses;

	const tags = parseStringArrayValue(filters.tags, "tags");
	if (tags instanceof Response) return tags;

	const sprintIds = parseNotionIdArrayValue(filters.sprintIds, "sprintIds");
	if (sprintIds instanceof Response) return sprintIds;

	const projectIds = parseNotionIdArrayValue(filters.projectIds, "projectIds");
	if (projectIds instanceof Response) return projectIds;

	const linkedJiraIds = parseNotionIdArrayValue(
		filters.linkedJiraIds,
		"linkedJiraIds",
	);
	if (linkedJiraIds instanceof Response) return linkedJiraIds;

	const linkedFromIds = parseNotionIdArrayValue(
		filters.linkedFromIds,
		"linkedFromIds",
	);
	if (linkedFromIds instanceof Response) return linkedFromIds;

	const linkTypes = parseStringArrayValue(filters.linkTypes, "linkTypes");
	if (linkTypes instanceof Response) return linkTypes;

	const inActiveSprint = parseBooleanValue(filters.inActiveSprint, "inActiveSprint");
	if (inActiveSprint instanceof Response) return inActiveSprint;

	const spillover = parseBooleanValue(filters.spillover, "spillover");
	if (spillover instanceof Response) return spillover;

	const appraisal = parseBooleanValue(filters.appraisal, "appraisal");
	if (appraisal instanceof Response) return appraisal;

	const demoRequired = parseBooleanValue(filters.demoRequired, "demoRequired");
	if (demoRequired instanceof Response) return demoRequired;

	const resolved = parseBooleanValue(filters.resolved, "resolved");
	if (resolved instanceof Response) return resolved;

	const query = parseStringValue(filters.q, "q");
	if (query instanceof Response) return query;

	return combineJiraFilters([
		statuses ? jiraFilters.statuses(statuses) : undefined,
		tags ? jiraFilters.tags(tags) : undefined,
		sprintIds ? jiraFilters.sprints(sprintIds) : undefined,
		projectIds ? jiraFilters.projects(projectIds) : undefined,
		linkedJiraIds ? jiraFilters.linkedJiras(linkedJiraIds) : undefined,
		linkedFromIds ? jiraFilters.linkedFromMany(linkedFromIds) : undefined,
		linkTypes ? jiraFilters.linkTypes(linkTypes) : undefined,
		typeof inActiveSprint === "boolean"
			? jiraFilters.inActiveSprintValue(inActiveSprint)
			: undefined,
		typeof spillover === "boolean" ? jiraFilters.spilloverValue(spillover) : undefined,
		typeof appraisal === "boolean" ? jiraFilters.appraisalValue(appraisal) : undefined,
		typeof demoRequired === "boolean"
			? jiraFilters.demoRequiredValue(demoRequired)
			: undefined,
		typeof resolved === "boolean" ? jiraFilters.resolved(resolved) : undefined,
		query ? jiraFilters.query(query) : undefined,
	]);
}

function buildOptionsBodyFilter(filters: Record<string, unknown>): NotionQueryFilter | Response {
	const query = parseStringValue(filters.q, "q");

	if (query instanceof Response) {
		return query;
	}

	return query ? jiraFilters.query(query) : jiraFilters.active;
}

function noStore(response: Response): Response {
	const headers = new Headers(response.headers);

	headers.set("Cache-Control", "no-store");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

async function parseMutationBody(
	request: Request,
): Promise<Record<string, unknown> | Response> {
	const parsed = await parseJsonRequestBody(request);

	if (parsed instanceof Response) return parsed;
	if (!isRecord(parsed.value)) return invalidRequest("Expected a JSON object");

	return parsed.value;
}

export async function handleJiraRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (request.method === "GET" && url.pathname === "/api/jiras/meta") {
		const metadata = await buildResourceMetadata(
			env,
			env.JIRAS_DATA_SOURCE_ID,
			"jiras",
			[
				{ key: "jiraKey", property: "JIRA Key", writable: true },
				{ key: "summary", property: "Summary", writable: true },
				{
					key: "projectId",
					property: "Project",
					writable: true,
					optionsEndpoint: "/api/projects/active",
				},
				{ key: "statusOptionId", property: "Status", writable: true },
				{ key: "tagOptionIds", property: "Tags", writable: true },
				{ key: "demoRequired", property: "Demo Required", writable: true },
				{ key: "appraisal", property: "Appraisal", writable: true },
			],
		);

		metadata.fields.splice(4, 0, {
			key: "inActiveSprint",
			label: "In Active Sprint",
			type: "checkbox",
			writable: true,
		});

		return Response.json(metadata);
	}

	if (request.method === "POST" && url.pathname === "/api/jiras") {
		const body = await parseMutationBody(request);
		if (body instanceof Response) return body;

		try {
			return noStore(
				Response.json({ data: await createJira(env, body) }, { status: 201 }),
			);
		} catch (error) {
			if (error instanceof JiraWriteValidationError) return error.response;

			if (error instanceof JiraAlreadyExistsError) {
				return Response.json(
					{ error: "JIRA already exists", field: "jiraKey" },
					{ status: 409 },
				);
			}

			if (error instanceof ActiveSprintConfigurationError) {
				return Response.json(
					{ error: error.message, field: "inActiveSprint" },
					{ status: 409 },
				);
			}

			console.error(error);

			return Response.json({ error: "Failed to create JIRA" }, { status: 500 });
		}
	}

	if (request.method === "QUERY" && url.pathname === "/api/jiras/options") {
		const query = await parseDomainQueryRequest(
			request,
			JIRA_OPTIONS_QUERY_FILTERS,
			{ defaultPageSize: JIRA_OPTIONS_DEFAULT_PAGE_SIZE },
		);

		if (query instanceof Response) {
			return query;
		}

		if (query.includeRelations) {
			return invalidRequest(
				"Relation enrichment is not supported for JIRA options",
				"includeRelations",
			);
		}

		const filter = buildOptionsBodyFilter(query.filters);

		if (filter instanceof Response) {
			return filter;
		}

		try {
			return withAcceptQuery(
				noStore(
					Response.json(
						await listJiraOptions(env, filter, query.pagination),
					),
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
					error: "Failed to retrieve JIRA options",
				},
				{
					status: 500,
				},
			);
		}
	}

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

	return normalizeJiraKey(jiraKey);
}
