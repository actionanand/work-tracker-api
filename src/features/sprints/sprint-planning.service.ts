import type { Env } from "../../shared/env";
import { checked, domainError, ManagedWriteError, ownedPage } from "../../shared/http/managed-write";
import { isRecord } from "../../shared/http/request-body";
import { ensureAllowedFields, invalidRequest, parseNotionIdValue } from "../../shared/http/validation";
import type { NotionPageWithParent } from "../../shared/notion/notion-page-ownership";
import { updateNotionPage } from "../../shared/notion/notion-client";
import { numberProperty } from "../../shared/notion/notion-properties";
import { jiraFilters } from "../jiras/jira.filters";
import { listAllJiras } from "../jiras/jira.service";
import { requireAlterSprint } from "../settings/alter-controls.service";
import { ensureJiraSprintAllocation, SprintAllocationConflictError, SprintAllocationEnsureError } from "../sprint-allocations/sprint-allocation.ensure";
import { sprintAllocationFilters } from "../sprint-allocations/sprint-allocation.filters";
import { mapSprintAllocation, type NotionSprintAllocationPage, type SprintAllocation } from "../sprint-allocations/sprint-allocation.mapper";
import { listAllSprintAllocations } from "../sprint-allocations/sprint-allocation.service";
import { requireAllocationSprint } from "../sprint-allocations/sprint-allocation.write";
import { getSprintById } from "./sprint.service";
import { nonNegativeNumber, resolveActiveSprint } from "./sprint.write";

export const MAX_SPRINT_PLAN_ALLOCATIONS = 50;

export async function syncActiveSprintAllocations(env: Env, body: Record<string, unknown>) {
	await requireAlterSprint(env);
	checked(ensureAllowedFields(body, new Set()));
	const sprint = await resolveActiveSprint(env);
	const [jiras, allocations] = await Promise.all([
		listAllJiras(env, jiraFilters.sprint(sprint.id)),
		listAllSprintAllocations(env, sprintAllocationFilters.sprint(sprint.id)),
	]);
	const byJira = new Map<string, SprintAllocation[]>();
	for (const allocation of allocations) {
		for (const jiraId of allocation.jiraIds) {
			const matches = byJira.get(jiraId) ?? [];
			matches.push(allocation);
			byJira.set(jiraId, matches);
		}
	}
	let created = 0;
	let existing = 0;
	const conflicts: Array<{ jiraId: string; jiraKey: string; allocationCount: number }> = [];
	for (const jira of jiras) {
		try {
			const result = await ensureJiraSprintAllocation(env, jira, sprint.id, {
				allocations: byJira.get(jira.id) ?? [], beforeCreate: () => requireAlterSprint(env),
			});
			if (result.created) created++; else existing++;
		} catch (error) {
			if (error instanceof SprintAllocationConflictError) {
				conflicts.push({ jiraId: jira.id, jiraKey: jira.jiraKey, allocationCount: error.allocationCount });
				continue;
			}
			if (!(error instanceof SprintAllocationEnsureError)) throw error;
			throw domainError(502, "Sprint Allocation sync could not be completed", "SPRINT_ALLOCATION_SYNC_PARTIAL", { created, existing, conflicts, jiraId: jira.id, jiraKey: jira.jiraKey });
		}
	}
	return { sprint, created, existing, conflicts, sprintDetail: await getSprintById(env, sprint.id) };
}

interface PlannedAllocation {
	allocationId: string;
	plannedDays: number;
}

function parsePlan(body: Record<string, unknown>): PlannedAllocation[] {
	checked(ensureAllowedFields(body, new Set(["allocations"])));
	if (!Array.isArray(body.allocations) || body.allocations.length < 1 || body.allocations.length > MAX_SPRINT_PLAN_ALLOCATIONS) {
		throw new ManagedWriteError(invalidRequest(`Expected 1 to ${MAX_SPRINT_PLAN_ALLOCATIONS} allocations`, "allocations"));
	}
	const seen = new Set<string>();
	return body.allocations.map((item) => {
		if (!isRecord(item)) throw new ManagedWriteError(invalidRequest("Expected an allocation object", "allocations"));
		checked(ensureAllowedFields(item, new Set(["allocationId", "plannedDays"])));
		const allocationId = checked(parseNotionIdValue(item.allocationId, "allocationId"));
		if (!allocationId) throw new ManagedWriteError(invalidRequest("Expected a valid Notion page ID", "allocationId"));
		if (seen.has(allocationId)) throw new ManagedWriteError(invalidRequest("Allocation IDs must be unique", "allocationId"));
		seen.add(allocationId);
		return { allocationId, plannedDays: nonNegativeNumber(item.plannedDays, "plannedDays") };
	});
}

export async function planActiveSprintAllocations(env: Env, body: Record<string, unknown>) {
	await requireAlterSprint(env);
	const plan = parsePlan(body);
	const sprint = await resolveActiveSprint(env);
	const allAllocations = await listAllSprintAllocations(env, sprintAllocationFilters.sprint(sprint.id));
	const current = new Map(allAllocations.map((allocation) => [allocation.id, allocation]));
	for (const item of plan) {
		const page = await ownedPage<NotionSprintAllocationPage & NotionPageWithParent>(env, item.allocationId, env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID, "Sprint Allocation");
		const allocation = mapSprintAllocation(page);
		requireAllocationSprint(allocation, sprint.id);
		// Direct page reads also cover allocations not yet visible in a datasource query.
		current.set(item.allocationId, allocation);
	}
	const proposed = new Map(plan.map((item) => [item.allocationId, item.plannedDays]));
	let total = [...current.values()].reduce((sum, allocation) => sum + (proposed.get(allocation.id) ?? allocation.plannedDays), 0);
	if (!Number.isFinite(total)) throw new ManagedWriteError(invalidRequest("Planned Days total must be finite", "allocations"));
	const tolerance = Number.EPSILON * Math.max(Math.abs(total), Math.abs(sprint.availableDays)) * current.size;
	if (total - sprint.availableDays > tolerance) {
		throw domainError(409, "Sprint plan exceeds available capacity", "SPRINT_CAPACITY_EXCEEDED", {
			availableDays: sprint.availableDays, requestedAllocatedDays: total, overBy: total - sprint.availableDays,
		});
	}
	if (total > sprint.availableDays) total = sprint.availableDays;
	const alreadySatisfiedAllocationIds = plan.filter((item) => current.get(item.allocationId)!.plannedDays === item.plannedDays).map((item) => item.allocationId);
	const changed = plan.filter((item) => current.get(item.allocationId)!.plannedDays !== item.plannedDays);
	// Apply decreases first so a partial request does not temporarily exceed capacity.
	changed.sort((a, b) => Number(a.plannedDays > current.get(a.allocationId)!.plannedDays) - Number(b.plannedDays > current.get(b.allocationId)!.plannedDays));
	const updatedAllocationIds: string[] = [];
	await requireAlterSprint(env);
	for (const item of changed) {
		await requireAlterSprint(env);
		try {
			await updateNotionPage({ env, pageId: item.allocationId, properties: { "Planned Days": numberProperty(item.plannedDays) } });
			updatedAllocationIds.push(item.allocationId);
		} catch {
			throw domainError(502, "Sprint plan could not be completed", "SPRINT_PLAN_PARTIAL", { updatedAllocationIds, alreadySatisfiedAllocationIds, failedAllocationId: item.allocationId });
		}
	}
	return {
		sprintDetail: await getSprintById(env, sprint.id),
		summary: {
			availableDays: sprint.availableDays, allocatedDays: total, remainingDays: sprint.availableDays - total,
			utilizationPercent: sprint.availableDays <= 0 ? (total === 0 ? 0 : 100) : Math.max(0, Math.min(100, total / sprint.availableDays * 100)),
		},
		updatedAllocationIds, alreadySatisfiedAllocationIds,
	};
}
