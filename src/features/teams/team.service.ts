import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
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
): Promise<TeamListResponse> {
	const notion = await queryNotionDataSource<NotionTeamPage>({
		dataSourceId: env.TEAMS_DATA_SOURCE_ID,
		env,
		filter,
	});

	const data = notion.results.map(mapTeam);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
