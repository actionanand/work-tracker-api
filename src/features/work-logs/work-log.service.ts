import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import {
	enrichWorkLogs,
	type EnrichedWorkLog,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import type { PaginationParams } from "../../shared/pagination/pagination";
import { mapWorkLog, type NotionWorkLogPage, type WorkLog } from "./work-log.mapper";

export interface WorkLogListResponse<TWorkLog = WorkLog> {
	data: TWorkLog[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export const workLogDefaultSorts: NotionQuerySort[] = [
	{
		property: "Date",
		direction: "descending",
	},
];

export async function listWorkLogs(
	env: Env,
	filter?: NotionQueryFilter,
	options: IncludeRelationsOption & { pagination?: PaginationParams } = {},
): Promise<WorkLogListResponse<WorkLog | EnrichedWorkLog>> {
	const notion = await queryNotionDataSource<NotionWorkLogPage>({
		dataSourceId: env.WORK_LOGS_DATA_SOURCE_ID,
		env,
		filter,
		sorts: workLogDefaultSorts,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapWorkLog);
	const responseData = options.includeRelations
		? await enrichWorkLogs(env, data)
		: data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
