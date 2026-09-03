import type { Env } from "../../shared/env";
import { parseNotionIdParam } from "../../shared/notion/notion-id";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { combineFeedbackFilters, feedbackFilters } from "./feedback.filters";
import { listFeedback } from "./feedback.service";

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
	const companyId = parseNotionIdParam(url, "companyId");

	if (companyId instanceof Response) {
		return companyId;
	}

	const projectId = parseNotionIdParam(url, "projectId");

	if (projectId instanceof Response) {
		return projectId;
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
		projectId ? feedbackFilters.project(projectId) : undefined,
		teamId ? feedbackFilters.team(teamId) : undefined,
		personType ? feedbackFilters.personType(personType) : undefined,
		context ? feedbackFilters.context(context) : undefined,
		feedbackType ? feedbackFilters.feedbackType(feedbackType) : undefined,
		from ? feedbackFilters.from(from) : undefined,
		to ? feedbackFilters.to(to) : undefined,
	]);
}

export async function handleFeedbackRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = feedbackRouteConfigs.get(url.pathname);

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
		return Response.json(await listFeedback(env, filter, { includeRelations }));
	} catch (error) {
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
