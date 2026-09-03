import type { Env } from "../env";
import { queryAllNotionDataSourcePages } from "../notion/notion-client";
import {
	mapCompany,
	type NotionCompanyPage,
} from "../../features/companies/company.mapper";
import { mapJira, type NotionJiraPage } from "../../features/jiras/jira.mapper";
import {
	mapProject,
	type NotionProjectPage,
} from "../../features/projects/project.mapper";
import {
	mapSprint,
	type NotionSprintPage,
} from "../../features/sprints/sprint.mapper";
import { mapTeam, type NotionTeamPage } from "../../features/teams/team.mapper";
import type {
	CompanyRef,
	JiraRef,
	ProjectRef,
	SprintRef,
	TeamRef,
} from "./relation-types";

function toMap<TRef extends { id: string }>(refs: TRef[]): Map<string, TRef> {
	return new Map(refs.map((ref) => [ref.id, ref]));
}

export async function loadCompanyCatalog(env: Env): Promise<Map<string, CompanyRef>> {
	const pages = await queryAllNotionDataSourcePages<NotionCompanyPage>({
		dataSourceId: env.COMPANIES_DATA_SOURCE_ID,
		env,
	});

	return toMap(
		pages.map((page) => {
			const company = mapCompany(page);

			return {
				id: company.id,
				name: company.company.trim(),
			};
		}),
	);
}

export async function loadTeamCatalog(env: Env): Promise<Map<string, TeamRef>> {
	const pages = await queryAllNotionDataSourcePages<NotionTeamPage>({
		dataSourceId: env.TEAMS_DATA_SOURCE_ID,
		env,
	});

	return toMap(
		pages.map((page) => {
			const team = mapTeam(page);

			return {
				id: team.id,
				name: team.team.trim(),
			};
		}),
	);
}

export async function loadProjectCatalog(env: Env): Promise<Map<string, ProjectRef>> {
	const pages = await queryAllNotionDataSourcePages<NotionProjectPage>({
		dataSourceId: env.PROJECTS_DATA_SOURCE_ID,
		env,
	});

	return toMap(
		pages.map((page) => {
			const project = mapProject(page);

			return {
				id: project.id,
				name: project.project.trim(),
			};
		}),
	);
}

export async function loadSprintCatalog(env: Env): Promise<Map<string, SprintRef>> {
	const pages = await queryAllNotionDataSourcePages<NotionSprintPage>({
		dataSourceId: env.SPRINTS_DATA_SOURCE_ID,
		env,
	});

	return toMap(
		pages.map((page) => {
			const sprint = mapSprint(page);

			return {
				id: sprint.id,
				name: sprint.sprint.trim(),
			};
		}),
	);
}

export async function loadJiraCatalog(env: Env): Promise<Map<string, JiraRef>> {
	const pages = await queryAllNotionDataSourcePages<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
	});

	return toMap(
		pages.map((page) => {
			const jira = mapJira(page);

			return {
				id: jira.id,
				key: jira.jiraKey.trim(),
				summary: jira.summary.trim(),
			};
		}),
	);
}
