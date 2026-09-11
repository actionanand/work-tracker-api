import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
	NotionQueryError,
} from "../../shared/notion/notion-client";
import {
	getNotionPage,
	queryNotionDataSource,
} from "../../shared/notion/notion-client";
import {
	enrichSprints,
	type EnrichedSprint,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import type { PaginationParams } from "../../shared/pagination/pagination";
import { jiraFilters } from "../jiras/jira.filters";
import type { Jira } from "../jiras/jira.mapper";
import { listAllJiras } from "../jiras/jira.service";
import { sprintAllocationFilters } from "../sprint-allocations/sprint-allocation.filters";
import type { SprintAllocation } from "../sprint-allocations/sprint-allocation.mapper";
import { listAllSprintAllocations } from "../sprint-allocations/sprint-allocation.service";
import { mapSprint, type NotionSprintPage, type Sprint } from "./sprint.mapper";

export interface SprintListResponse<TSprint = Sprint> {
	data: TSprint[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export class SprintNotFoundError extends Error {
	constructor(sprintId: string) {
		super(`Sprint not found: ${sprintId}`);
		this.name = "SprintNotFoundError";
	}
}

export interface SprintDetailJira extends Jira {
	plannedDays: number | null;
	allocationId: string | null;
	allocationNotes: string;
	allocationConflict: boolean;
	allocationCount: number;
}

export interface SprintDetailResponse {
	sprint: Sprint | EnrichedSprint;
	jiras: SprintDetailJira[];
	count: number;
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

function matchingAllocationsForJira(
	allocations: SprintAllocation[],
	jiraId: string,
): SprintAllocation[] {
	return [...allocations]
		.filter((allocation) => allocation.jiraIds.includes(jiraId))
		.sort(
			(a, b) =>
				a.allocation.localeCompare(b.allocation) || a.id.localeCompare(b.id),
		);
}

function mergeSprintJirasWithAllocations(
	jiras: Jira[],
	allocations: SprintAllocation[],
): SprintDetailJira[] {
	return [...jiras]
		.sort((a, b) => a.jiraKey.localeCompare(b.jiraKey) || a.id.localeCompare(b.id))
		.map((jira) => {
			const matchingAllocations = matchingAllocationsForJira(allocations, jira.id);
			const allocation =
				matchingAllocations.length === 1 ? matchingAllocations[0] : undefined;
			const allocationConflict = matchingAllocations.length > 1;

			return {
				...jira,
				plannedDays: allocation?.plannedDays ?? null,
				allocationId: allocation?.id ?? null,
				allocationNotes: allocation?.notes ?? "",
				allocationConflict,
				allocationCount: matchingAllocations.length,
			};
		});
}

export async function getSprintById(
	env: Env,
	sprintId: string,
): Promise<SprintDetailResponse> {
	let page: NotionSprintPage;

	try {
		page = await getNotionPage<NotionSprintPage>({
			env,
			pageId: sprintId,
		});
	} catch (error) {
		if ((error as NotionQueryError).status === 404) {
			throw new SprintNotFoundError(sprintId);
		}

		throw error;
	}

	const sprint = mapSprint(page);
	const [enrichedSprint, jiras, allocations] = await Promise.all([
		enrichSprints(env, [sprint]),
		listAllJiras(env, jiraFilters.sprint(sprintId)),
		listAllSprintAllocations(env, sprintAllocationFilters.sprint(sprintId)),
	]);
	const sprintJiras = mergeSprintJirasWithAllocations(jiras, allocations);

	return {
		sprint: enrichedSprint[0] ?? sprint,
		jiras: sprintJiras,
		count: sprintJiras.length,
	};
}
