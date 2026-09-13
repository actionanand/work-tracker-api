import type { Jira } from "./jira.mapper";

export interface JiraOption {
	id: string;
	jiraKey: string;
	summary: string;
	status: string | null;
	inActiveSprint: boolean;
}

export function mapJiraOption(jira: Jira): JiraOption {
	return {
		id: jira.id,
		jiraKey: jira.jiraKey,
		summary: jira.summary,
		status: jira.status,
		inActiveSprint: jira.inActiveSprint,
	};
}
