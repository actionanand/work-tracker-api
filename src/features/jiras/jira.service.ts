import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import { jiraFilters } from "./jira.filters";
import { mapJira, type Jira, type NotionJiraPage } from "./jira.mapper";

export interface JiraListResponse {
	data: Jira[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export class JiraNotFoundError extends Error {
	constructor(jiraKey: string) {
		super(`JIRA not found: ${jiraKey}`);
		this.name = "JiraNotFoundError";
	}
}

export class DuplicateJiraKeyError extends Error {
	constructor(jiraKey: string, count: number) {
		super(`Expected one JIRA for key ${jiraKey}, found ${count}`);
		this.name = "DuplicateJiraKeyError";
	}
}

export async function listJiras(
	env: Env,
	filter?: NotionQueryFilter,
): Promise<JiraListResponse> {
	const notion = await queryNotionDataSource<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
		filter,
	});

	const data = notion.results.map(mapJira);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

export async function getJiraByKey(env: Env, jiraKey: string): Promise<Jira> {
	const result = await listJiras(env, jiraFilters.byKey(jiraKey));

	if (result.data.length === 0) {
		throw new JiraNotFoundError(jiraKey);
	}

	if (result.data.length > 1) {
		throw new DuplicateJiraKeyError(jiraKey, result.data.length);
	}

	return result.data[0];
}
