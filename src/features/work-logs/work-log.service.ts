import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import { mapWorkLog, type NotionWorkLogPage, type WorkLog } from "./work-log.mapper";

export interface WorkLogListResponse {
	data: WorkLog[];
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
): Promise<WorkLogListResponse> {
	const notion = await queryNotionDataSource<NotionWorkLogPage>({
		dataSourceId: env.WORK_LOGS_DATA_SOURCE_ID,
		env,
		filter,
		sorts: workLogDefaultSorts,
	});

	const data = notion.results.map(mapWorkLog);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
