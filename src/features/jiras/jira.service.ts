import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import {
	queryAllNotionDataSourcePages,
	queryNotionDataSource,
} from "../../shared/notion/notion-client";
import {
	enrichJira,
	enrichJiras,
	type EnrichedJira,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import { jiraFilters } from "./jira.filters";
import { mapJira, type Jira, type NotionJiraPage } from "./jira.mapper";

export interface JiraListResponse<TJira = Jira> {
	data: TJira[];
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
	options: IncludeRelationsOption = {},
): Promise<JiraListResponse<Jira | EnrichedJira>> {
	const notion = await queryNotionDataSource<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
		filter,
	});

	const data = notion.results.map(mapJira);
	const responseData = options.includeRelations ? await enrichJiras(env, data) : data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

export async function getJiraByKey(
	env: Env,
	jiraKey: string,
	options: IncludeRelationsOption = {},
): Promise<Jira | EnrichedJira> {
	const result = await listJiras(env, jiraFilters.byKey(jiraKey));

	if (result.data.length === 0) {
		throw new JiraNotFoundError(jiraKey);
	}

	if (result.data.length > 1) {
		throw new DuplicateJiraKeyError(jiraKey, result.data.length);
	}

	return options.includeRelations
		? enrichJira(env, result.data[0])
		: result.data[0];
}

export async function listJiraIdsByProjects(
	env: Env,
	projectIds: string[],
): Promise<string[]> {
	const filter = jiraFilters.projects(projectIds);

	if (!filter) {
		return [];
	}

	const pages = await queryAllNotionDataSourcePages<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
		filter,
	});

	return pages.map((page) => page.id);
}
