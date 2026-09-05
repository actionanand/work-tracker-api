import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import type { PaginationParams } from "../../shared/pagination/pagination";
import { mapTeam, type NotionTeamPage, type Team } from "./team.mapper";

export interface TeamListResponse {
	data: Team[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export async function listTeams(
	env: Env,
	filter?: NotionQueryFilter,
	options: { pagination?: PaginationParams } = {},
): Promise<TeamListResponse> {
	const notion = await queryNotionDataSource<NotionTeamPage>({
		dataSourceId: env.TEAMS_DATA_SOURCE_ID,
		env,
		filter,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapTeam);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
