import type { Feedback } from "../../features/feedback/feedback.mapper";
import type { Jira } from "../../features/jiras/jira.mapper";
import type { Project } from "../../features/projects/project.mapper";
import type { ReleaseItem } from "../../features/releases/release.mapper";
import type { Sprint } from "../../features/sprints/sprint.mapper";
import type { WorkLink } from "../../features/work-links/work-link.mapper";
import type { WorkLog } from "../../features/work-logs/work-log.mapper";
import type { Env } from "../env";
import {
	loadCompanyCatalog,
	loadJiraCatalog,
	loadProjectCatalog,
	loadSprintCatalog,
	loadTeamCatalog,
} from "./relation-catalog";
import type {
	CompanyRef,
	IncludeRelationsOption,
	JiraRef,
	ProjectRef,
	SprintRef,
	TeamRef,
} from "./relation-types";

export function parseIncludeRelations(url: URL): boolean | Response {
	const include = url.searchParams.get("include");

	if (include === null) {
		return false;
	}

	if (include === "relations") {
		return true;
	}

	return Response.json(
		{
			error: "Invalid query parameter",
			parameter: "include",
			message: "Supported value: relations",
		},
		{
			status: 400,
		},
	);
}

function uniqueIds(items: string[][]): string[] {
	return [...new Set(items.flat().filter((id) => id.length > 0))];
}

function resolveRefs<TRef>(
	ids: string[],
	catalog: Map<string, TRef>,
): TRef[] {
	return ids.flatMap((id) => {
		const ref = catalog.get(id);

		return ref ? [ref] : [];
	});
}

async function loadCatalogIfNeeded<TRef>(
	ids: string[],
	loader: () => Promise<Map<string, TRef>>,
): Promise<Map<string, TRef>> {
	return ids.length > 0 ? loader() : new Map();
}

export type EnrichedProject = Project & {
	companies: CompanyRef[];
	teams: TeamRef[];
};

export async function enrichProjects(
	env: Env,
	projects: Project[],
): Promise<EnrichedProject[]> {
	const companyIds = uniqueIds(projects.map((project) => project.companyIds));
	const teamIds = uniqueIds(projects.map((project) => project.teamIds));
	const [companies, teams] = await Promise.all([
		loadCatalogIfNeeded(companyIds, () => loadCompanyCatalog(env)),
		loadCatalogIfNeeded(teamIds, () => loadTeamCatalog(env)),
	]);

	return projects.map((project) => ({
		...project,
		companies: resolveRefs(project.companyIds, companies),
		teams: resolveRefs(project.teamIds, teams),
	}));
}

export type EnrichedSprint = Sprint & {
	projects: ProjectRef[];
};

export async function enrichSprints(
	env: Env,
	sprints: Sprint[],
): Promise<EnrichedSprint[]> {
	const projectIds = uniqueIds(sprints.map((sprint) => sprint.projectIds));
	const projects = await loadCatalogIfNeeded(projectIds, () => loadProjectCatalog(env));

	return sprints.map((sprint) => ({
		...sprint,
		projects: resolveRefs(sprint.projectIds, projects),
	}));
}

export type EnrichedJira = Jira & {
	projects: ProjectRef[];
	sprints: SprintRef[];
	blockedBy: JiraRef[];
};

export async function enrichJiras(
	env: Env,
	jiras: Jira[],
): Promise<EnrichedJira[]> {
	const projectIds = uniqueIds(jiras.map((jira) => jira.projectIds));
	const sprintIds = uniqueIds(jiras.map((jira) => jira.sprintIds));
	const blockedByIds = uniqueIds(jiras.map((jira) => jira.blockedByIds));
	const [projects, sprints, blockedBy] = await Promise.all([
		loadCatalogIfNeeded(projectIds, () => loadProjectCatalog(env)),
		loadCatalogIfNeeded(sprintIds, () => loadSprintCatalog(env)),
		loadCatalogIfNeeded(blockedByIds, () => loadJiraCatalog(env)),
	]);

	return jiras.map((jira) => ({
		...jira,
		projects: resolveRefs(jira.projectIds, projects),
		sprints: resolveRefs(jira.sprintIds, sprints),
		blockedBy: resolveRefs(jira.blockedByIds, blockedBy),
	}));
}

export async function enrichJira(env: Env, jira: Jira): Promise<EnrichedJira> {
	return (await enrichJiras(env, [jira]))[0];
}

export type EnrichedWorkLog = WorkLog & {
	companies: CompanyRef[];
	teams: TeamRef[];
	projects: ProjectRef[];
	jiras: JiraRef[];
	sprints: SprintRef[];
};

export async function enrichWorkLogs(
	env: Env,
	workLogs: WorkLog[],
): Promise<EnrichedWorkLog[]> {
	const companyIds = uniqueIds(workLogs.map((workLog) => workLog.companyIds));
	const teamIds = uniqueIds(workLogs.map((workLog) => workLog.teamIds));
	const projectIds = uniqueIds(workLogs.map((workLog) => workLog.projectIds));
	const jiraIds = uniqueIds(workLogs.map((workLog) => workLog.jiraIds));
	const sprintIds = uniqueIds(workLogs.map((workLog) => workLog.sprintIds));
	const [companies, teams, projects, jiras, sprints] = await Promise.all([
		loadCatalogIfNeeded(companyIds, () => loadCompanyCatalog(env)),
		loadCatalogIfNeeded(teamIds, () => loadTeamCatalog(env)),
		loadCatalogIfNeeded(projectIds, () => loadProjectCatalog(env)),
		loadCatalogIfNeeded(jiraIds, () => loadJiraCatalog(env)),
		loadCatalogIfNeeded(sprintIds, () => loadSprintCatalog(env)),
	]);

	return workLogs.map((workLog) => ({
		...workLog,
		companies: resolveRefs(workLog.companyIds, companies),
		teams: resolveRefs(workLog.teamIds, teams),
		projects: resolveRefs(workLog.projectIds, projects),
		jiras: resolveRefs(workLog.jiraIds, jiras),
		sprints: resolveRefs(workLog.sprintIds, sprints),
	}));
}

export type EnrichedReleaseItem = ReleaseItem & {
	jiras: JiraRef[];
	sprints: SprintRef[];
};

export async function enrichReleaseItems(
	env: Env,
	releaseItems: ReleaseItem[],
): Promise<EnrichedReleaseItem[]> {
	const jiraIds = uniqueIds(releaseItems.map((releaseItem) => releaseItem.jiraIds));
	const sprintIds = uniqueIds(releaseItems.map((releaseItem) => releaseItem.sprintIds));
	const [jiras, sprints] = await Promise.all([
		loadCatalogIfNeeded(jiraIds, () => loadJiraCatalog(env)),
		loadCatalogIfNeeded(sprintIds, () => loadSprintCatalog(env)),
	]);

	return releaseItems.map((releaseItem) => ({
		...releaseItem,
		jiras: resolveRefs(releaseItem.jiraIds, jiras),
		sprints: resolveRefs(releaseItem.sprintIds, sprints),
	}));
}

export type EnrichedFeedback = Feedback & {
	companies: CompanyRef[];
	projects: ProjectRef[];
	teams: TeamRef[];
};

export async function enrichFeedback(
	env: Env,
	feedback: Feedback[],
): Promise<EnrichedFeedback[]> {
	const companyIds = uniqueIds(feedback.map((item) => item.companyIds));
	const projectIds = uniqueIds(feedback.map((item) => item.projectIds));
	const teamIds = uniqueIds(feedback.map((item) => item.teamIds));
	const [companies, projects, teams] = await Promise.all([
		loadCatalogIfNeeded(companyIds, () => loadCompanyCatalog(env)),
		loadCatalogIfNeeded(projectIds, () => loadProjectCatalog(env)),
		loadCatalogIfNeeded(teamIds, () => loadTeamCatalog(env)),
	]);

	return feedback.map((item) => ({
		...item,
		companies: resolveRefs(item.companyIds, companies),
		projects: resolveRefs(item.projectIds, projects),
		teams: resolveRefs(item.teamIds, teams),
	}));
}

export type EnrichedWorkLink = WorkLink & {
	companies: CompanyRef[];
	projects: ProjectRef[];
};

export async function enrichWorkLinks(
	env: Env,
	workLinks: WorkLink[],
): Promise<EnrichedWorkLink[]> {
	const companyIds = uniqueIds(workLinks.map((workLink) => workLink.companyIds));
	const projectIds = uniqueIds(workLinks.map((workLink) => workLink.projectIds));
	const [companies, projects] = await Promise.all([
		loadCatalogIfNeeded(companyIds, () => loadCompanyCatalog(env)),
		loadCatalogIfNeeded(projectIds, () => loadProjectCatalog(env)),
	]);

	return workLinks.map((workLink) => ({
		...workLink,
		companies: resolveRefs(workLink.companyIds, companies),
		projects: resolveRefs(workLink.projectIds, projects),
	}));
}

export type { IncludeRelationsOption };
