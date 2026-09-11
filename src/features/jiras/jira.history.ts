import type { SprintAllocation } from "../sprint-allocations/sprint-allocation.mapper";
import type { EnrichedJira } from "../../shared/relations/relation-enrichment";
import type { SprintRef } from "../../shared/relations/relation-types";
import { sortSprintRefs } from "../../shared/relations/relation-enrichment";

export interface SprintHistoryItem {
	sprint: SprintRef;
	allocationId: string | null;
	plannedDays: number | null;
	allocationNotes: string;
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
			allocationConflict,
			allocationCount: matchingAllocations.length,
		};
	});
}

export function deriveSpillEvents(
	sprintHistory: SprintHistoryItem[],
	spilloverCount: number,
	spilloverReason: string,
): SpillEvent[] {
	const reason = spilloverReason.trim();
	const events: SpillEvent[] = [];

	for (let index = 0; index < sprintHistory.length - 1; index += 1) {
		const number = index + 1;

		events.push({
			number,
			fromSprint: toSpillSprintRef(sprintHistory[index].sprint),
			toSprint: toSpillSprintRef(sprintHistory[index + 1].sprint),
			reason: number === spilloverCount && reason.length > 0 ? reason : null,
		});
	}

	return events;
}

export interface JiraDetail extends EnrichedJira {
	sprintHistory: SprintHistoryItem[];
	spillEvents: SpillEvent[];
	latestSpill: SpillEvent | null;
}
