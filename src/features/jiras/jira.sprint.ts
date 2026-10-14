import type { Env } from "../../shared/env";
import { checked, domainError, ManagedWriteError, ownedPage } from "../../shared/http/managed-write";
import { ensureAllowedFields } from "../../shared/http/validation";
import { updateNotionPage } from "../../shared/notion/notion-client";
import { relationProperty } from "../../shared/notion/notion-properties";
import { requireAlterSprint } from "../settings/alter-controls.service";
import { resolveActiveSprint } from "../sprints/sprint.write";
import { ensureJiraSprintAllocation, SprintAllocationEnsureError } from "../sprint-allocations/sprint-allocation.ensure";
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
	const relationExists = jira.sprintIds.includes(currentSprint.id);
	let ensured;
	try {
		ensured = await ensureJiraSprintAllocation(env, jira, currentSprint.id, { beforeCreate: () => requireAlterSprint(env) });
	} catch (error) {
		if (!(error instanceof SprintAllocationEnsureError)) throw error;
		throw domainError(502, "Current Sprint assignment could not be completed safely", "SPRINT_ASSIGNMENT_PARTIAL");
	}
	const alreadyAssigned = relationExists && !ensured.created;
	await requireAlterSprint(env);
	if (!relationExists) {
		await updateNotionPage({ env, pageId: jira.id, properties: { Sprints: relationProperty([...jira.sprintIds, currentSprint.id]) } });
	}
	return { data: await getJiraByKey(env, jiraKey, { includeRelations: true }), currentSprint, allocation: ensured.allocation, alreadyAssigned };
}
