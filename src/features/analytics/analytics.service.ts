import type { Env } from "../../shared/env";
import { queryAllNotionDataSourcePages, type NotionQueryFilter } from "../../shared/notion/notion-client";
import { mapJira, type NotionJiraPage } from "../jiras/jira.mapper";
import { jiraFilters } from "../jiras/jira.filters";
import { mapSprint, type NotionSprintPage } from "../sprints/sprint.mapper";
import { mapSprintAllocation, type NotionSprintAllocationPage } from "../sprint-allocations/sprint-allocation.mapper";
import { sprintAllocationFilters } from "../sprint-allocations/sprint-allocation.filters";
import { mapWorkLog, type NotionWorkLogPage } from "../work-logs/work-log.mapper";
import { combineWorkLogFilters, workLogFilters } from "../work-logs/work-log.filters";
import { aggregateAnalytics, selectedSprints } from "./analytics.aggregate";
import type { AnalyticsRange, AnalyticsResponse } from "./analytics.types";

export const ANALYTICS_SPRINT_CHUNK_SIZE = 20;

async function querySprintChunks<T extends { id: string }>(env: Env, dataSourceId: string, ids: string[], filter: (ids: string[]) => NotionQueryFilter | undefined): Promise<T[]> {
	const pages = new Map<string, T>();
	for (let offset = 0; offset < ids.length; offset += ANALYTICS_SPRINT_CHUNK_SIZE) {
		const results = await queryAllNotionDataSourcePages<T>({ env, dataSourceId, filter: filter(ids.slice(offset, offset + ANALYTICS_SPRINT_CHUNK_SIZE)) });
		for (const page of results) pages.set(page.id, page);
	}
	return [...pages.values()];
}

export async function getAnalytics(env: Env, range: AnalyticsRange): Promise<AnalyticsResponse> {
	const sprintPages = await queryAllNotionDataSourcePages<NotionSprintPage>({ env, dataSourceId: env.SPRINTS_DATA_SOURCE_ID });
	const sprints = [...new Map(sprintPages.map((page) => [page.id, mapSprint(page)])).values()];
	const ids = selectedSprints(sprints, range).map((sprint) => sprint.id);
	const jiraPages = await querySprintChunks<NotionJiraPage>(env, env.JIRAS_DATA_SOURCE_ID, ids, jiraFilters.sprints);
	// Never silently classify a truncated history, or add per-JIRA property lookups.
	for (const page of jiraPages) {
		if ((page.properties.Sprints as { has_more?: boolean } | undefined)?.has_more) throw new Error("Incomplete analytics history");
	}
	const allocations = await querySprintChunks<NotionSprintAllocationPage>(env, env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID, ids, sprintAllocationFilters.sprints);
	const workLogs = await queryAllNotionDataSourcePages<NotionWorkLogPage>({
		env, dataSourceId: env.WORK_LOGS_DATA_SOURCE_ID,
		filter: combineWorkLogFilters([workLogFilters.from(range.from), workLogFilters.to(range.to)]),
	});
	return aggregateAnalytics(range, sprints, jiraPages.map(mapJira), allocations.map(mapSprintAllocation), [...new Map(workLogs.map((page) => [page.id, page])).values()].map(mapWorkLog));
}
