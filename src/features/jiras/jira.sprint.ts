import type { Env } from "../../shared/env";
import { checked, domainError, ManagedWriteError, ownedPage } from "../../shared/http/managed-write";
import { ensureAllowedFields } from "../../shared/http/validation";
import { createNotionPage, updateNotionPage } from "../../shared/notion/notion-client";
import { numberProperty, relationProperty, titleProperty } from "../../shared/notion/notion-properties";
import { requireAlterSprint } from "../settings/alter-controls.service";
import { resolveActiveSprint } from "../sprints/sprint.write";
import { listAllSprintAllocations } from "../sprint-allocations/sprint-allocation.service";
import { combineSprintAllocationFilters, sprintAllocationFilters } from "../sprint-allocations/sprint-allocation.filters";
import { mapSprintAllocation, type NotionSprintAllocationPage } from "../sprint-allocations/sprint-allocation.mapper";
import { getJiraByKey, JiraNotFoundError } from "./jira.service";
import { mapJira, type Jira, type NotionJiraPage } from "./jira.mapper";
import type { NotionPageWithParent } from "../../shared/notion/notion-page-ownership";
import { completeRelationIds, type NotionRelationProperty } from "../../shared/notion/notion-page-relations";

export async function addJiraToCurrentSprint(env: Env, jiraKey: string, body: Record<string, unknown>) {
	await requireAlterSprint(env);
	checked(ensureAllowedFields(body, new Set()));
	let jira: Jira;
	try {
		jira = await getJiraByKey(env, jiraKey);
	} catch (error) {
		if (error instanceof JiraNotFoundError) throw new ManagedWriteError(Response.json({ error: "JIRA not found" }, { status: 404 }));
		throw error;
	}
	const page = await ownedPage<NotionJiraPage & NotionPageWithParent>(env, jira.id, env.JIRAS_DATA_SOURCE_ID, "JIRA");
	jira = mapJira(page);
	jira.sprintIds = await completeRelationIds(env, jira.id, page.properties.Sprints as NotionRelationProperty | undefined);
	const currentSprint = await resolveActiveSprint(env);
	const allocations = await listAllSprintAllocations(env, combineSprintAllocationFilters([
		sprintAllocationFilters.sprint(currentSprint.id), sprintAllocationFilters.jira(jira.id),
	]));
	if (allocations.length > 1) {
		throw domainError(409, "Multiple Sprint Allocations exist for this JIRA in the active Sprint", "SPRINT_ALLOCATION_CONFLICT", { allocationCount: allocations.length });
	}
	const relationExists = jira.sprintIds.includes(currentSprint.id);
	const alreadyAssigned = relationExists && allocations.length === 1;
	await requireAlterSprint(env);
	if (!relationExists) {
		await updateNotionPage({ env, pageId: jira.id, properties: { Sprints: relationProperty([...jira.sprintIds, currentSprint.id]) } });
	}
	let allocation = allocations[0];
	if (!allocation) {
		try {
			await requireAlterSprint(env);
			allocation = mapSprintAllocation(await createNotionPage<NotionSprintAllocationPage>({
				env, dataSourceId: env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID,
				properties: {
					Allocation: titleProperty(jira.jiraKey), Sprint: relationProperty([currentSprint.id]),
					JIRA: relationProperty([jira.id]), "Planned Days": numberProperty(0),
				},
			}));
		} catch {
			throw domainError(502, "Current Sprint assignment could not be completed safely", "SPRINT_ASSIGNMENT_PARTIAL");
		}
	}
	return { data: await getJiraByKey(env, jiraKey, { includeRelations: true }), currentSprint, allocation, alreadyAssigned };
}
