import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import {
	enrichSprints,
	type EnrichedSprint,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import type { PaginationParams } from "../../shared/pagination/pagination";
import { mapSprint, type NotionSprintPage, type Sprint } from "./sprint.mapper";

export interface SprintListResponse<TSprint = Sprint> {
	data: TSprint[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export async function listSprints(
	env: Env,
	filter?: NotionQueryFilter,
	sorts?: NotionQuerySort[],
	options: IncludeRelationsOption & { pagination?: PaginationParams } = {},
): Promise<SprintListResponse<Sprint | EnrichedSprint>> {
	const notion = await queryNotionDataSource<NotionSprintPage>({
		dataSourceId: env.SPRINTS_DATA_SOURCE_ID,
		env,
		filter,
		sorts,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapSprint);
	const responseData = options.includeRelations
		? await enrichSprints(env, data)
		: data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
