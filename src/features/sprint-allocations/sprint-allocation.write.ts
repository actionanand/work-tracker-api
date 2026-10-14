import type { Env } from "../../shared/env";
import { checked, domainError, ownedPage } from "../../shared/http/managed-write";
import { ensureAllowedFields } from "../../shared/http/validation";
import { updateNotionPage } from "../../shared/notion/notion-client";
import type { NotionPageWithParent } from "../../shared/notion/notion-page-ownership";
import { numberProperty } from "../../shared/notion/notion-properties";
import { requireAlterSprint } from "../settings/alter-controls.service";
import { nonNegativeNumber } from "../sprints/sprint.write";
import { mapSprint, type NotionSprintPage } from "../sprints/sprint.mapper";
import { getSprintById } from "../sprints/sprint.service";
import { mapSprintAllocation, type NotionSprintAllocationPage, type SprintAllocation } from "./sprint-allocation.mapper";

export function requireAllocationSprint(allocation: SprintAllocation, activeSprintId?: string): string {
	if (allocation.sprintIds.length !== 1) {
		throw domainError(409, "Only allocations with one active Sprint can be edited", "SPRINT_ALLOCATION_NOT_ACTIVE");
	}
	const sprintId = allocation.sprintIds[0];
	if (activeSprintId && sprintId !== activeSprintId) {
		throw domainError(409, "Only allocations in the active Sprint can be edited", "SPRINT_ALLOCATION_NOT_ACTIVE");
	}
	return sprintId;
}

export async function updatePlannedDays(env: Env, allocationId: string, body: Record<string, unknown>) {
	await requireAlterSprint(env);
	checked(ensureAllowedFields(body, new Set(["plannedDays"])));
	const plannedDays = nonNegativeNumber(body.plannedDays, "plannedDays");
	const page = await ownedPage<NotionSprintAllocationPage & NotionPageWithParent>(env, allocationId, env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID, "Sprint Allocation");
	const allocation = mapSprintAllocation(page);
	const sprintId = requireAllocationSprint(allocation);
	const sprintPage = await ownedPage<NotionSprintPage & NotionPageWithParent>(env, sprintId, env.SPRINTS_DATA_SOURCE_ID, "Sprint");
	if (!mapSprint(sprintPage).active) {
		throw domainError(409, "Only allocations in the active Sprint can be edited", "SPRINT_ALLOCATION_NOT_ACTIVE");
	}
	await requireAlterSprint(env);
	const updated = await updateNotionPage<NotionSprintAllocationPage>({ env, pageId: allocationId, properties: { "Planned Days": numberProperty(plannedDays) } });
	return { allocation: mapSprintAllocation(updated), sprintDetail: await getSprintById(env, sprintId) };
}
