import { feedbackFilters, combineFeedbackFilters } from "../feedback/feedback.filters";
import { listFeedback } from "../feedback/feedback.service";
import { combineJiraFilters, jiraFilters } from "../jiras/jira.filters";
import { listJiraIdsByProjects, listJiras } from "../jiras/jira.service";
import { combineReleaseFilters, releaseFilters } from "../releases/release.filters";
import { listReleaseItems } from "../releases/release.service";
import {
	listCompanyIdsByProject,
	listProjectIdsByCompany,
} from "../projects/project.service";
import { combineSprintFilters, sprintFilters } from "../sprints/sprint.filters";
import { listSprints } from "../sprints/sprint.service";
import { workLinkFilters, combineWorkLinkFilters } from "../work-links/work-link.filters";
import { listWorkLinks } from "../work-links/work-link.service";
import { combineWorkLogFilters, workLogFilters } from "../work-logs/work-log.filters";
import { listWorkLogs } from "../work-logs/work-log.service";
import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import {
	loadCompanyCatalog,
	loadProjectCatalog,
} from "../../shared/relations/relation-catalog";
import type { ProjectRef } from "../../shared/relations/relation-types";
import type {
	DashboardResponse,
	FeedbackSummary,
	ReleaseSummary,
} from "./dashboard.types";
import type {
	EnrichedJira,
	EnrichedReleaseItem,
	EnrichedSprint,
	EnrichedWorkLink,
	EnrichedWorkLog,
} from "../../shared/relations/relation-enrichment";

interface DashboardScope {
	companyId?: string;
	projectId?: string;
}

interface ProjectScope {
	projectIds?: string[];
	projectCompanyIds?: string[];
	isEmpty: boolean;
}

interface CollectionResponse<TItem> {
	data: TItem[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

const currentSprintSorts: NotionQuerySort[] = [
	{
		property: "Start Date",
		direction: "descending",
	},
];

export class DashboardCompanyNotFoundError extends Error {
	constructor(companyId: string) {
		super(`Company not found: ${companyId}`);
		this.name = "DashboardCompanyNotFoundError";
	}
}

export class DashboardProjectNotFoundError extends Error {
	constructor(projectId: string) {
		super(`Project not found: ${projectId}`);
		this.name = "DashboardProjectNotFoundError";
	}
}

function emptyCollection<TItem>(): CollectionResponse<TItem> {
	return {
		data: [],
		count: 0,
		hasMore: false,
		nextCursor: null,
	};
}

async function resolveCompanyAndProject(env: Env, scope: DashboardScope) {
	const [companyCatalog, projectCatalog] = await Promise.all([
		scope.companyId ? loadCompanyCatalog(env) : Promise.resolve(new Map()),
		scope.projectId
			? loadProjectCatalog(env)
			: Promise.resolve(new Map<string, ProjectRef>()),
	]);

	const company = scope.companyId ? companyCatalog.get(scope.companyId) : null;
	const project = scope.projectId ? projectCatalog.get(scope.projectId) : null;

	if (scope.companyId && !company) {
		throw new DashboardCompanyNotFoundError(scope.companyId);
	}

	if (scope.projectId && !project) {
		throw new DashboardProjectNotFoundError(scope.projectId);
	}

	return {
		company: company ?? null,
		project: project ?? null,
	};
}

async function resolveProjectScope(
	env: Env,
	scope: DashboardScope,
): Promise<ProjectScope> {
	if (scope.projectId) {
		return {
			projectIds: [scope.projectId],
			projectCompanyIds: (await listCompanyIdsByProject(env, scope.projectId)) ?? [],
			isEmpty: false,
		};
	}

	if (!scope.companyId) {
		return {
			isEmpty: false,
		};
	}

	const projectIds = await listProjectIdsByCompany(env, scope.companyId);

	return {
		projectIds,
		isEmpty: projectIds.length === 0,
	};
}

function projectRelationScope(
	projectScope: ProjectScope,
	filterForProjects: (projectIds: string[]) => NotionQueryFilter | undefined,
): NotionQueryFilter | undefined {
	return projectScope.projectIds ? filterForProjects(projectScope.projectIds) : undefined;
}

function feedbackScopeFilters(
	scope: DashboardScope,
	projectScope: ProjectScope,
): NotionQueryFilter[] {
	const companyIds =
		scope.companyId || !scope.projectId ? undefined : projectScope.projectCompanyIds;
	const projectCompanyFilters = companyIds?.map((companyId) =>
		feedbackFilters.company(companyId),
	);
	const projectCompanyFilter = projectCompanyFilters
		? combineFeedbackFilters(projectCompanyFilters)
		: undefined;

	return [
		scope.companyId ? feedbackFilters.company(scope.companyId) : undefined,
		projectCompanyFilter,
	].filter((filter): filter is NotionQueryFilter => Boolean(filter));
}

function workLinkScopeFilters(scope: DashboardScope): NotionQueryFilter[] {
	return [
		scope.companyId ? workLinkFilters.company(scope.companyId) : undefined,
		scope.projectId ? workLinkFilters.project(scope.projectId) : undefined,
	].filter((filter): filter is NotionQueryFilter => Boolean(filter));
}

async function listScopedJiras(
	env: Env,
	baseFilter: NotionQueryFilter,
	projectScope: ProjectScope,
) {
	if (projectScope.isEmpty) {
		return emptyCollection<EnrichedJira>();
	}

	return listJiras(
		env,
		combineJiraFilters([
			baseFilter,
			projectRelationScope(projectScope, jiraFilters.projects),
		]),
		{
			includeRelations: true,
		},
	);
}

async function listCurrentSprint(env: Env, projectScope: ProjectScope) {
	if (projectScope.isEmpty) {
		return null;
	}

	const sprints = await listSprints(
		env,
		combineSprintFilters([
			sprintFilters.active,
			projectRelationScope(projectScope, sprintFilters.projects),
		]),
		currentSprintSorts,
		{
			includeRelations: true,
		},
	);

	return sprints.data[0] ?? null;
}

async function listRecentWorkLogs(env: Env, projectScope: ProjectScope) {
	if (projectScope.isEmpty) {
		return emptyCollection();
	}

	return listWorkLogs(
		env,
		combineWorkLogFilters([
			workLogFilters.hasDate,
			projectRelationScope(projectScope, workLogFilters.projects),
		]),
		{
			includeRelations: true,
			pagination: {
				pageSize: 10,
			},
		},
	);
}

async function loadReleaseSummary(
	env: Env,
	projectScope: ProjectScope,
): Promise<{
	summary: ReleaseSummary;
	pendingReleases: DashboardResponse["pendingReleases"];
}> {
	if (projectScope.isEmpty) {
		return {
			summary: {
				pending: 0,
				confirmed: 0,
				notAnnounced: 0,
			},
			pendingReleases: [],
		};
	}

	const scopedReleaseFilter = projectScope.projectIds
		? releaseFilters.jiras(await listJiraIdsByProjects(env, projectScope.projectIds))
		: undefined;

	if (projectScope.projectIds && !scopedReleaseFilter) {
		return {
			summary: {
				pending: 0,
				confirmed: 0,
				notAnnounced: 0,
			},
			pendingReleases: [],
		};
	}

	const [pending, confirmed, notAnnounced] = await Promise.all([
		listReleaseItems(
			env,
			combineReleaseFilters([releaseFilters.pending, scopedReleaseFilter]),
			undefined,
			{
				includeRelations: true,
			},
		),
		listReleaseItems(
			env,
			combineReleaseFilters([releaseFilters.confirmed, scopedReleaseFilter]),
		),
		listReleaseItems(
			env,
			combineReleaseFilters([releaseFilters.notAnnounced, scopedReleaseFilter]),
		),
	]);

	return {
		summary: {
			pending: pending.count,
			confirmed: confirmed.count,
			notAnnounced: notAnnounced.count,
		},
		pendingReleases: pending.data as EnrichedReleaseItem[],
	};
}

async function loadFeedbackSummary(
	env: Env,
	scope: DashboardScope,
	projectScope: ProjectScope,
): Promise<FeedbackSummary> {
	if (
		scope.projectId &&
		!scope.companyId &&
		projectScope.projectCompanyIds?.length === 0
	) {
		return {
			appraisal: 0,
			improvementFollowUp: 0,
			negative: 0,
		};
	}

	const scopedFilters = feedbackScopeFilters(scope, projectScope);
	const [appraisal, improvementFollowUp, negative] = await Promise.all([
		listFeedback(
			env,
			combineFeedbackFilters([feedbackFilters.appraisal, ...scopedFilters]),
		),
		listFeedback(
			env,
			combineFeedbackFilters([
				feedbackFilters.improvementFollowUp,
				...scopedFilters,
			]),
		),
		listFeedback(
			env,
			combineFeedbackFilters([feedbackFilters.negative, ...scopedFilters]),
		),
	]);

	return {
		appraisal: appraisal.count,
		improvementFollowUp: improvementFollowUp.count,
		negative: negative.count,
	};
}

async function listActiveWorkLinks(env: Env, scope: DashboardScope) {
	return listWorkLinks(
		env,
		combineWorkLinkFilters([workLinkFilters.active, ...workLinkScopeFilters(scope)]),
		{
			includeRelations: true,
		},
	);
}

export async function getDashboard(
	env: Env,
	scope: DashboardScope,
): Promise<DashboardResponse> {
	const [{ company, project }, projectScope] = await Promise.all([
		resolveCompanyAndProject(env, scope),
		resolveProjectScope(env, scope),
	]);

	const [
		currentSprint,
		activeJiras,
		blockedJiras,
		spilloverJiras,
		demoPendingJiras,
		recentWorkLogs,
		releases,
		feedbackSummary,
		activeWorkLinks,
	] = await Promise.all([
		listCurrentSprint(env, projectScope),
		listScopedJiras(env, jiraFilters.active, projectScope),
		listScopedJiras(env, jiraFilters.blocked, projectScope),
		listScopedJiras(env, jiraFilters.spillovers, projectScope),
		listScopedJiras(env, jiraFilters.demoPending, projectScope),
		listRecentWorkLogs(env, projectScope),
		loadReleaseSummary(env, projectScope),
		loadFeedbackSummary(env, scope, projectScope),
		listActiveWorkLinks(env, scope),
	]);

	return {
		generatedAt: new Date().toISOString(),
		company: company ?? null,
		project: project ?? null,
		currentSprint: currentSprint as EnrichedSprint | null,
		jiraSummary: {
			active: activeJiras.count,
			blocked: blockedJiras.count,
			spillovers: spilloverJiras.count,
			demoPending: demoPendingJiras.count,
		},
		activeJiras: activeJiras.data as EnrichedJira[],
		blockedJiras: blockedJiras.data as EnrichedJira[],
		spilloverJiras: spilloverJiras.data as EnrichedJira[],
		demoPendingJiras: demoPendingJiras.data as EnrichedJira[],
		recentWorkLogs: recentWorkLogs.data as EnrichedWorkLog[],
		releaseSummary: releases.summary,
		pendingReleases: releases.pendingReleases,
		feedbackSummary,
		activeWorkLinks: activeWorkLinks.data as EnrichedWorkLink[],
	};
}
