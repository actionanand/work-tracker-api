import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import { mapSprint, type NotionSprintPage, type Sprint } from "./sprint.mapper";

export interface SprintListResponse {
	data: Sprint[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export async function listSprints(
	env: Env,
	filter?: NotionQueryFilter,
	sorts?: NotionQuerySort[],
): Promise<SprintListResponse> {
	const notion = await queryNotionDataSource<NotionSprintPage>({
		dataSourceId: env.SPRINTS_DATA_SOURCE_ID,
		env,
		filter,
		sorts,
	});

	const data = notion.results.map(mapSprint);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
