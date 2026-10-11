import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import {
	queryAllNotionDataSourcePages,
	queryNotionDataSource,
	getNotionPage,
	updateNotionPage,
} from "../../shared/notion/notion-client";
import { richTextProperty } from "../../shared/notion/notion-properties";
import { pageBelongsToDataSource, type NotionPageWithParent } from "../../shared/notion/notion-page-ownership";
import type { PaginationParams } from "../../shared/pagination/pagination";
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

function isValidSprintAllocationForList(allocation: SprintAllocation): boolean {
	return allocation.jiraIds.length > 0 && allocation.sprintIds.length > 0;
}

export async function listSprintAllocations(
	env: Env,
	filter?: NotionQueryFilter,
	options: { pagination?: PaginationParams } = {},
): Promise<SprintAllocationListResponse> {
	const notion = await queryNotionDataSource<NotionSprintAllocationPage>({
		dataSourceId: env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID,
		env,
		filter,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results
		.map(mapSprintAllocation)
		.filter(isValidSprintAllocationForList);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

export async function listAllSprintAllocations(
	env: Env,
	filter?: NotionQueryFilter,
): Promise<SprintAllocation[]> {
	const pages = await queryAllNotionDataSourcePages<NotionSprintAllocationPage>({
		dataSourceId: env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID,
		env,
		filter,
	});

	return pages.map(mapSprintAllocation);
}

export class SprintAllocationNotWritableError extends Error {}

export async function updateSprintAllocationSpillReason(env: Env, allocationId: string, reasonMarkdown: string): Promise<SprintAllocation> {
	const page = await getNotionPage<NotionSprintAllocationPage & NotionPageWithParent>({ env, pageId: allocationId });
	if (!pageBelongsToDataSource(page, env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)) throw new SprintAllocationNotWritableError();
	return mapSprintAllocation(await updateNotionPage<NotionSprintAllocationPage>({ env, pageId: allocationId, properties: { "Spill Reason": richTextProperty(reasonMarkdown) } }));
}
