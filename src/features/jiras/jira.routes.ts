import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { jiraFilters } from "./jira.filters";
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

export async function handleJiraRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (request.method !== "GET") {
		return null;
	}

	if (jiraRouteFilters.has(url.pathname)) {
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

	const jiraKey = parseJiraKeyPath(url.pathname);

	if (!jiraKey) {
		return null;
	}

	try {
		return Response.json(await getJiraByKey(env, jiraKey));
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
