import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import {
	mapWorkLink,
	type NotionWorkLinkPage,
	type WorkLink,
} from "./work-link.mapper";

export interface WorkLinkListResponse {
	data: WorkLink[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export const workLinkDefaultSorts: NotionQuerySort[] = [
	{
		property: "Link",
		direction: "ascending",
	},
];

export async function listWorkLinks(
	env: Env,
	filter?: NotionQueryFilter,
): Promise<WorkLinkListResponse> {
	const notion = await queryNotionDataSource<NotionWorkLinkPage>({
		dataSourceId: env.WORK_LINKS_DATA_SOURCE_ID,
		env,
		filter,
		sorts: workLinkDefaultSorts,
	});

	const data = notion.results.map(mapWorkLink);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
