import type { Env } from "../../shared/env";
import { domainError, ManagedWriteError } from "../../shared/http/managed-write";
import { createNotionPage } from "../../shared/notion/notion-client";
import { numberProperty, relationProperty, titleProperty } from "../../shared/notion/notion-properties";
import { combineSprintAllocationFilters, sprintAllocationFilters } from "./sprint-allocation.filters";
import { mapSprintAllocation, type NotionSprintAllocationPage, type SprintAllocation } from "./sprint-allocation.mapper";
import { listAllSprintAllocations } from "./sprint-allocation.service";

export class SprintAllocationConflictError extends ManagedWriteError {
	constructor(readonly allocationCount: number) {
		super(domainError(409, "Multiple Sprint Allocations exist for this JIRA in the active Sprint", "SPRINT_ALLOCATION_CONFLICT", { allocationCount }).response);
	}
}

export class SprintAllocationEnsureError extends Error {}

export async function ensureJiraSprintAllocation(
	env: Env,
	jira: { id: string; jiraKey: string },
	sprintId: string,
	options: { allocations?: SprintAllocation[]; beforeCreate?: () => Promise<void> } = {},
): Promise<{ allocation: SprintAllocation; created: boolean }> {
	const queryPair = () => listAllSprintAllocations(env, combineSprintAllocationFilters([
		sprintAllocationFilters.sprint(sprintId), sprintAllocationFilters.jira(jira.id),
	]));
	const single = (allocations: SprintAllocation[]) => {
		const matching = allocations.filter((item) => item.jiraIds.includes(jira.id) && item.sprintIds.includes(sprintId));
		if (matching.length > 1) throw new SprintAllocationConflictError(matching.length);
		return matching[0];
	};
	let allocations = options.allocations;
	if (!allocations) {
		try { allocations = await queryPair(); } catch { throw new SprintAllocationEnsureError(); }
	}
	const existing = single(allocations);
	if (existing) return { allocation: existing, created: false };
	await options.beforeCreate?.();
	try {
		const page = await createNotionPage<NotionSprintAllocationPage>({
			env, dataSourceId: env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID,
			properties: {
				Allocation: titleProperty(jira.jiraKey), Sprint: relationProperty([sprintId]),
				JIRA: relationProperty([jira.id]), "Planned Days": numberProperty(0),
			},
		});
		return { allocation: mapSprintAllocation(page), created: true };
	} catch {
		// The write may have reached Notion even when its response was lost.
		let recovered: SprintAllocation[];
		try { recovered = await queryPair(); } catch { throw new SprintAllocationEnsureError(); }
		const allocation = single(recovered);
		if (allocation) return { allocation, created: true };
		throw new SprintAllocationEnsureError();
	}
}
