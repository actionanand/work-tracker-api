import type { SprintAllocation } from "../sprint-allocations/sprint-allocation.mapper";
import type { EnrichedJira } from "../../shared/relations/relation-enrichment";
import type { SprintRef } from "../../shared/relations/relation-types";
import { sortSprintRefs } from "../../shared/relations/relation-enrichment";
import type { JiraRelationship } from "./jira.relationships";

export interface SprintHistoryItem {
	sprint: SprintRef;
	allocationId: string | null;
	plannedDays: number | null;
	allocationNotes: string;
	spillReason: string;
	spilled: boolean;
	allocationConflict: boolean;
	allocationCount: number;
}

export interface SpillSprintRef {
	id: string;
	name: string;
	active: boolean;
	startDate: string | null;
	endDate: string | null;
}

export interface SpillEvent {
	number: number;
	fromSprint: SpillSprintRef;
	toSprint: SpillSprintRef;
	reason: string | null;
}

function toSpillSprintRef(sprint: SprintRef): SpillSprintRef {
	return {
		id: sprint.id,
		name: sprint.name,
		active: sprint.active,
		startDate: sprint.startDate,
		endDate: sprint.endDate,
	};
}

function matchingAllocationsForSprint(
	allocations: SprintAllocation[],
	sprintId: string,
): SprintAllocation[] {
	return [...allocations]
		.filter((allocation) => allocation.sprintIds.includes(sprintId))
		.sort(
			(a, b) =>
				a.allocation.localeCompare(b.allocation) || a.id.localeCompare(b.id),
		);
}

export function buildSprintHistory(
	sprints: SprintRef[],
	allocations: SprintAllocation[],
): SprintHistoryItem[] {
	return sortSprintRefs(sprints).map((sprint) => {
		const matchingAllocations = matchingAllocationsForSprint(allocations, sprint.id);
		const allocation =
			matchingAllocations.length === 1 ? matchingAllocations[0] : undefined;
		const allocationConflict = matchingAllocations.length > 1;

		return {
			sprint,
			allocationId: allocation?.id ?? null,
			plannedDays: allocation?.plannedDays ?? null,
			allocationNotes: allocation?.notes ?? "",
			spillReason: allocation?.spillReason ?? "",
			spilled: allocation?.spilled ?? false,
			allocationConflict,
			allocationCount: matchingAllocations.length,
		};
	});
}

export function deriveSpillEvents(
	sprintHistory: SprintHistoryItem[],
): SpillEvent[] {
	const events: SpillEvent[] = [];

	for (let index = 0; index < sprintHistory.length - 1; index += 1) {
		const receivingAllocation = sprintHistory[index + 1];
		const reason =
			receivingAllocation.allocationConflict || !receivingAllocation.allocationId
				? null
				: receivingAllocation.spillReason.trim() || null;

		events.push({
			number: index + 1,
			fromSprint: toSpillSprintRef(sprintHistory[index].sprint),
			toSprint: toSpillSprintRef(receivingAllocation.sprint),
			reason,
		});
	}

	return events;
}

export interface JiraDetail extends EnrichedJira {
	relationships: JiraRelationship[];
	sprintHistory: SprintHistoryItem[];
	spillEvents: SpillEvent[];
	latestSpill: SpillEvent | null;
	spillHistoryConsistent: boolean;
}
