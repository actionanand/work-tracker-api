import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { jiraFilters } from "./jira.filters";
import { listJiras } from "./jira.service";

const jiraRouteFilters = new Map<string, NotionQueryFilter | undefined>([
	["/api/jiras", undefined],
	["/api/jiras/active", jiraFilters.active],
	["/api/jiras/blocked", jiraFilters.blocked],
	["/api/jiras/spillovers", jiraFilters.spillovers],
	["/api/jiras/appraisal", jiraFilters.appraisal],
	["/api/jiras/demo-pending", jiraFilters.demoPending],
	["/api/jiras/demoed", jiraFilters.demoed],
]);

export async function handleJiraRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (request.method !== "GET" || !jiraRouteFilters.has(url.pathname)) {
		return null;
	}

	const filter = jiraRouteFilters.get(url.pathname);

	try {
		return Response.json(await listJiras(env, filter));
	} catch (error) {
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
