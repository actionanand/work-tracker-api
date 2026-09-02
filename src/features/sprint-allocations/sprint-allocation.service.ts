import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import {
	mapSprintAllocation,
	type NotionSprintAllocationPage,
	type SprintAllocation,
} from "./sprint-allocation.mapper";

export interface SprintAllocationListResponse {
	data: SprintAllocation[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export async function listSprintAllocations(
	env: Env,
	filter?: NotionQueryFilter,
): Promise<SprintAllocationListResponse> {
	const notion = await queryNotionDataSource<NotionSprintAllocationPage>({
		dataSourceId: env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID,
		env,
		filter,
	});

	const data = notion.results.map(mapSprintAllocation);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
