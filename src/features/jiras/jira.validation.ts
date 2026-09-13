const JIRA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]+-\d+$/;

export function normalizeJiraKey(value: string): string | null {
	const jiraKey = value.trim();

	return JIRA_KEY_PATTERN.test(jiraKey) ? jiraKey : null;
}
