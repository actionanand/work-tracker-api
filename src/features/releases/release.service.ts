import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import {
	mapReleaseItem,
	type NotionReleasePage,
	type ReleaseItem,
} from "./release.mapper";

export interface ReleaseItemListResponse {
	data: ReleaseItem[];
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
): Promise<ReleaseItemListResponse> {
	const notion = await queryNotionDataSource<NotionReleasePage>({
		dataSourceId: env.RELEASE_ITEMS_DATA_SOURCE_ID,
		env,
		filter,
		sorts,
	});

	const data = notion.results.map(mapReleaseItem);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
