import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import {
	enrichReleaseItems,
	type EnrichedReleaseItem,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import type { PaginationParams } from "../../shared/pagination/pagination";
import {
	mapReleaseItem,
	type NotionReleasePage,
	type ReleaseItem,
} from "./release.mapper";

export interface ReleaseItemListResponse<TReleaseItem = ReleaseItem> {
	data: TReleaseItem[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export const releaseAnnouncedDateSorts: NotionQuerySort[] = [
	{
		property: "Formal Announced Date",
		direction: "descending",
	},
];

export const releaseConfirmedDateSorts: NotionQuerySort[] = [
	{
		property: "Confirmed Release Date",
		direction: "descending",
	},
];

export async function listReleaseItems(
	env: Env,
	filter?: NotionQueryFilter,
	sorts: NotionQuerySort[] = releaseAnnouncedDateSorts,
	options: IncludeRelationsOption & { pagination?: PaginationParams } = {},
): Promise<ReleaseItemListResponse<ReleaseItem | EnrichedReleaseItem>> {
	const notion = await queryNotionDataSource<NotionReleasePage>({
		dataSourceId: env.RELEASE_ITEMS_DATA_SOURCE_ID,
		env,
		filter,
		sorts,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapReleaseItem);
	const responseData = options.includeRelations
		? await enrichReleaseItems(env, data)
		: data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
