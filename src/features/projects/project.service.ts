import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import {
	queryAllNotionDataSourcePages,
	queryNotionDataSource,
} from "../../shared/notion/notion-client";
import {
	enrichProjects,
	type EnrichedProject,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import type { PaginationParams } from "../../shared/pagination/pagination";
import { projectFilters } from "./project.filters";
import { mapProject, type NotionProjectPage, type Project } from "./project.mapper";

export interface ProjectListResponse<TProject = Project> {
	data: TProject[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export async function listProjects(
	env: Env,
	filter?: NotionQueryFilter,
	options: IncludeRelationsOption & { pagination?: PaginationParams } = {},
): Promise<ProjectListResponse<Project | EnrichedProject>> {
	const notion = await queryNotionDataSource<NotionProjectPage>({
		dataSourceId: env.PROJECTS_DATA_SOURCE_ID,
		env,
		filter,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapProject);
	const responseData = options.includeRelations
		? await enrichProjects(env, data)
		: data;

	return {
		data: responseData,
		count: responseData.length,
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

export async function listCompanyIdsByProject(
	env: Env,
	projectId: string,
): Promise<string[] | null> {
	const pages = await queryAllNotionDataSourcePages<NotionProjectPage>({
		dataSourceId: env.PROJECTS_DATA_SOURCE_ID,
		env,
	});
	const page = pages.find((candidate) => candidate.id === projectId);

	return page ? mapProject(page).companyIds : null;
}
