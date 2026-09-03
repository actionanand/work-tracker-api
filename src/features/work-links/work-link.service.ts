import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import {
	enrichWorkLinks,
	type EnrichedWorkLink,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import {
	mapWorkLink,
	type NotionWorkLinkPage,
	type WorkLink,
} from "./work-link.mapper";

export interface WorkLinkListResponse<TWorkLink = WorkLink> {
	data: TWorkLink[];
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
	options: IncludeRelationsOption = {},
): Promise<WorkLinkListResponse<WorkLink | EnrichedWorkLink>> {
	const notion = await queryNotionDataSource<NotionWorkLinkPage>({
		dataSourceId: env.WORK_LINKS_DATA_SOURCE_ID,
		env,
		filter,
		sorts: workLinkDefaultSorts,
	});

	const data = notion.results.map(mapWorkLink);
	const responseData = options.includeRelations
		? await enrichWorkLinks(env, data)
		: data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
