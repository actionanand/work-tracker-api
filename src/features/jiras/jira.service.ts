import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import { mapJira, type Jira, type NotionJiraPage } from "./jira.mapper";

export interface JiraListResponse {
	data: Jira[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
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
