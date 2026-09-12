import type { Env } from "../../shared/env";
import { parseDomainQueryRequest, withAcceptQuery } from "../../shared/http/http-query";
import { isRecord, parseJsonRequestBody } from "../../shared/http/request-body";
import {
	invalidNotionId,
	invalidRequest,
	parseDateValue,
	parseNotionIdArrayValue,
	parseStringArrayValue,
} from "../../shared/http/validation";
import { normalizeNotionId, parseNotionIdParam } from "../../shared/notion/notion-id";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { NotionQueryError } from "../../shared/notion/notion-client";
import { buildResourceMetadata } from "../../shared/notion/notion-schema";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { combineFeedbackFilters, feedbackFilters } from "./feedback.filters";
import {
	FeedbackNotWritableError,
	FeedbackWriteValidationError,
	createFeedback,
	listFeedback,
	updateFeedback,
} from "./feedback.service";

interface FeedbackRouteConfig {
	baseFilter?: NotionQueryFilter;
}

const feedbackRouteConfigs = new Map<string, FeedbackRouteConfig>([
	["/api/feedback", {}],
	[
		"/api/feedback/appraisal",
		{
			baseFilter: feedbackFilters.appraisal as NotionQueryFilter,
		},
	],
	[
		"/api/feedback/improvement-follow-up",
		{
			baseFilter: feedbackFilters.improvementFollowUp as NotionQueryFilter,
		},
	],
	[
		"/api/feedback/negative",
		{
			baseFilter: feedbackFilters.negative as NotionQueryFilter,
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

function selectParam(
	url: URL,
	name: "personType" | "context" | "feedbackType",
): string | undefined {
	const value = url.searchParams.get(name)?.trim();

	return value && value.length > 0 ? value : undefined;
}

function buildQueryFilter(
	url: URL,
	config: FeedbackRouteConfig,
): NotionQueryFilter | Response | undefined {
	if (url.searchParams.has("projectId")) {
		return invalidRequest("Feedback does not support Project filtering; use companyId or teamId", "projectId");
	}

	const companyId = parseNotionIdParam(url, "companyId");

	if (companyId instanceof Response) {
		return companyId;
	}

	const teamId = parseNotionIdParam(url, "teamId");

	if (teamId instanceof Response) {
		return teamId;
	}

	const from = parseDateParam(url, "from");

	if (from instanceof Response) {
		return from;
	}

	const to = parseDateParam(url, "to");

	if (to instanceof Response) {
		return to;
	}

	const personType = selectParam(url, "personType");
	const context = selectParam(url, "context");
	const feedbackType = selectParam(url, "feedbackType");

	return combineFeedbackFilters([
		config.baseFilter,
		companyId ? feedbackFilters.company(companyId) : undefined,
		teamId ? feedbackFilters.team(teamId) : undefined,
		personType ? feedbackFilters.personType(personType) : undefined,
		context ? feedbackFilters.context(context) : undefined,
		feedbackType ? feedbackFilters.feedbackType(feedbackType) : undefined,
		from ? feedbackFilters.from(from) : undefined,
		to ? feedbackFilters.to(to) : undefined,
	]);
}

const FEEDBACK_QUERY_FILTERS = new Set([
	"from",
	"to",
	"companyIds",
	"teamIds",
	"personTypes",
	"contexts",
	"feedbackTypes",
]);

function buildBodyFilter(
	filters: Record<string, unknown>,
	baseFilter?: NotionQueryFilter,
): NotionQueryFilter | Response | undefined {
	const from = parseDateValue(filters.from, "from");
	if (from instanceof Response) return from;

	const to = parseDateValue(filters.to, "to");
	if (to instanceof Response) return to;

	const companyIds = parseNotionIdArrayValue(filters.companyIds, "companyIds");
	if (companyIds instanceof Response) return companyIds;

	const teamIds = parseNotionIdArrayValue(filters.teamIds, "teamIds");
	if (teamIds instanceof Response) return teamIds;

	const personTypes = parseStringArrayValue(filters.personTypes, "personTypes");
	if (personTypes instanceof Response) return personTypes;

	const contexts = parseStringArrayValue(filters.contexts, "contexts");
	if (contexts instanceof Response) return contexts;

	const feedbackTypes = parseStringArrayValue(filters.feedbackTypes, "feedbackTypes");
	if (feedbackTypes instanceof Response) return feedbackTypes;

	return combineFeedbackFilters([
		baseFilter,
		from ? feedbackFilters.from(from) : undefined,
		to ? feedbackFilters.to(to) : undefined,
		companyIds ? feedbackFilters.companies(companyIds) : undefined,
		teamIds ? feedbackFilters.teams(teamIds) : undefined,
		personTypes ? feedbackFilters.personTypes(personTypes) : undefined,
		contexts ? feedbackFilters.contexts(contexts) : undefined,
		feedbackTypes ? feedbackFilters.feedbackTypes(feedbackTypes) : undefined,
	]);
}

function parseFeedbackPageId(pathname: string): string | Response | null {
	const match = pathname.match(/^\/api\/feedback\/([^/]+)$/);

	if (!match) {
		return null;
	}

	let rawPageId: string;

	try {
		rawPageId = decodeURIComponent(match[1]);
	} catch {
		return invalidNotionId("pageId");
	}

	return normalizeNotionId(rawPageId) ?? invalidNotionId("pageId");
}

async function parseMutationBody(request: Request): Promise<Record<string, unknown> | Response> {
	const parsed = await parseJsonRequestBody(request);

	if (parsed instanceof Response) {
		return parsed;
	}

	return isRecord(parsed.value) ? parsed.value : invalidRequest("Expected a JSON object");
}

function mutationHeaders(response: Response): Response {
	const headers = new Headers(response.headers);

	headers.set("Cache-Control", "no-store");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export async function handleFeedbackRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = feedbackRouteConfigs.get(url.pathname);

	if (url.pathname === "/api/feedback/meta" && request.method === "GET") {
		return Response.json(
			await buildResourceMetadata(env, env.FEEDBACK_DATA_SOURCE_ID, "feedback", [
				{ key: "feedback", property: "Feedback", writable: true },
				{ key: "date", property: "Date", writable: true },
				{ key: "feedbackFrom", property: "Feedback From", writable: true },
				{ key: "personTypeOptionId", property: "Person Type", writable: true },
				{ key: "contextOptionId", property: "Context", writable: true },
				{ key: "feedbackTypeOptionId", property: "Feedback Type", writable: true },
				{ key: "companyId", property: "Company", writable: true, optionsEndpoint: "/api/companies/active" },
				{ key: "workType", property: "Work Type", writable: false },
				{ key: "teamId", property: "Team", writable: true, optionsEndpoint: "/api/teams/active" },
				{ key: "details", property: "Details", writable: true },
				{ key: "actionFollowUp", property: "Action / Follow-up", writable: true },
			]),
		);
	}

	if (request.method === "POST" && url.pathname === "/api/feedback") {
		const body = await parseMutationBody(request);

		if (body instanceof Response) {
			return body;
		}

		try {
			return mutationHeaders(
				Response.json({ data: await createFeedback(env, body) }, { status: 201 }),
			);
		} catch (error) {
			if (error instanceof FeedbackWriteValidationError) {
				return error.response;
			}

			console.error(error);

			return Response.json({ error: "Failed to create Feedback" }, { status: 500 });
		}
	}

	if (request.method === "PATCH") {
		const pageId = parseFeedbackPageId(url.pathname);

		if (!pageId) {
			return null;
		}

		if (pageId instanceof Response) {
			return pageId;
		}

		const body = await parseMutationBody(request);

		if (body instanceof Response) {
			return body;
		}

		try {
			return mutationHeaders(
				Response.json({ data: await updateFeedback(env, pageId, body) }),
			);
		} catch (error) {
			if (error instanceof FeedbackWriteValidationError) {
				return error.response;
			}

			if (error instanceof FeedbackNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "Feedback not found" }, { status: 404 });
			}

			console.error(error);

			return Response.json({ error: "Failed to update Feedback" }, { status: 500 });
		}
	}

	if (request.method === "QUERY" && config) {
		const query = await parseDomainQueryRequest(request, FEEDBACK_QUERY_FILTERS);

		if (query instanceof Response) {
			return query;
		}

		const filter = buildBodyFilter(query.filters, config.baseFilter);

		if (filter instanceof Response) {
			return filter;
		}

		try {
			return withAcceptQuery(
				Response.json(
					await listFeedback(env, filter, {
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

			return Response.json({ error: "Failed to retrieve Feedback" }, { status: 500 });
		}
	}

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
		return withAcceptQuery(
			Response.json(
				await listFeedback(env, filter, { includeRelations, pagination }),
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
				error: "Failed to retrieve Feedback",
			},
			{
				status: 500,
			},
		);
	}
}
