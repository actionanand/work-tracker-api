import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import {
	queryAllNotionDataSourcePages,
	queryNotionDataSource,
} from "../../shared/notion/notion-client";
import { projectFilters } from "./project.filters";
import { mapProject, type NotionProjectPage, type Project } from "./project.mapper";

export interface ProjectListResponse {
	data: Project[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export async function listProjects(
	env: Env,
	filter?: NotionQueryFilter,
): Promise<ProjectListResponse> {
	const notion = await queryNotionDataSource<NotionProjectPage>({
		dataSourceId: env.PROJECTS_DATA_SOURCE_ID,
		env,
		filter,
	});

	const data = notion.results.map(mapProject);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

export async function listProjectIdsByCompany(
	env: Env,
	companyId: string,
): Promise<string[]> {
	const pages = await queryAllNotionDataSourcePages<NotionProjectPage>({
		dataSourceId: env.PROJECTS_DATA_SOURCE_ID,
		env,
		filter: projectFilters.company(companyId),
	});

	return pages.map((page) => page.id);
}
