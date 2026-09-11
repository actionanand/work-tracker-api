import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import {
	queryAllNotionDataSourcePages,
	queryNotionDataSource,
} from "../../shared/notion/notion-client";
import {
	enrichJira,
	enrichJiras,
	type EnrichedJira,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import type { PaginationParams } from "../../shared/pagination/pagination";
import { sprintAllocationFilters } from "../sprint-allocations/sprint-allocation.filters";
import { listAllSprintAllocations } from "../sprint-allocations/sprint-allocation.service";
import {
	buildSprintHistory,
	deriveSpillEvents,
	type JiraDetail,
} from "./jira.history";
import { jiraFilters } from "./jira.filters";
import { mapJira, type Jira, type NotionJiraPage } from "./jira.mapper";

export interface JiraListResponse<TJira = Jira> {
	data: TJira[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export class JiraNotFoundError extends Error {
	constructor(jiraKey: string) {
		super(`JIRA not found: ${jiraKey}`);
		this.name = "JiraNotFoundError";
	}
}

export class DuplicateJiraKeyError extends Error {
	constructor(jiraKey: string, count: number) {
		super(`Expected one JIRA for key ${jiraKey}, found ${count}`);
		this.name = "DuplicateJiraKeyError";
	}
}

export async function listJiras(
	env: Env,
	filter?: NotionQueryFilter,
	options: IncludeRelationsOption & { pagination?: PaginationParams } = {},
): Promise<JiraListResponse<Jira | EnrichedJira>> {
	const notion = await queryNotionDataSource<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
		filter,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapJira);
	const responseData = options.includeRelations ? await enrichJiras(env, data) : data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

async function enrichJiraDetail(env: Env, jira: Jira): Promise<JiraDetail> {
	const [enriched, allocations] = await Promise.all([
		enrichJira(env, jira),
		listAllSprintAllocations(env, sprintAllocationFilters.jira(jira.id)),
	]);
	const sprintHistory = buildSprintHistory(enriched.sprints, allocations);
	const spillEvents = deriveSpillEvents(
		sprintHistory,
		jira.spilloverCount,
		jira.spilloverReason,
	);

	return {
		...enriched,
		sprintHistory,
		spillEvents,
		latestSpill:
			spillEvents.find((event) => event.number === jira.spilloverCount) ?? null,
	};
}

export async function getJiraByKey(
	env: Env,
	jiraKey: string,
	options: IncludeRelationsOption = {},
): Promise<Jira | EnrichedJira | JiraDetail> {
	const result = await listJiras(env, jiraFilters.byKey(jiraKey));

	if (result.data.length === 0) {
		throw new JiraNotFoundError(jiraKey);
	}

	if (result.data.length > 1) {
		throw new DuplicateJiraKeyError(jiraKey, result.data.length);
	}

	return options.includeRelations
		? enrichJiraDetail(env, result.data[0] as Jira)
		: result.data[0];
}

export async function listAllJiras(
	env: Env,
	filter?: NotionQueryFilter,
): Promise<Jira[]> {
	const pages = await queryAllNotionDataSourcePages<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
		filter,
	});

	return pages.map(mapJira);
}

export async function listJiraIdsByProjects(
	env: Env,
	projectIds: string[],
): Promise<string[]> {
	const filter = jiraFilters.projects(projectIds);

	if (!filter) {
		return [];
	}

	const pages = await queryAllNotionDataSourcePages<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
		filter,
	});

	return pages.map((page) => page.id);
}
