import type { NotionQueryFilter } from "../../shared/notion/notion-client";

export const sprintAllocationFilters = {
	current: {
		property: "Sprint Active",
		rollup: {
			any: {
				checkbox: {
					equals: true,
				},
			},
		},
	},
	sprint: (sprintId: string): NotionQueryFilter => ({
		property: "Sprint",
		relation: {
			contains: sprintId,
		},
	}),
	jira: (jiraId: string): NotionQueryFilter => ({
		property: "JIRA",
		relation: {
			contains: jiraId,
		},
	}),
} satisfies Record<string, NotionQueryFilter | ((value: string) => NotionQueryFilter)>;

export function combineSprintAllocationFilters(
	filters: Array<NotionQueryFilter | undefined>,
): NotionQueryFilter | undefined {
	const presentFilters = filters.filter(
		(filter): filter is NotionQueryFilter => Boolean(filter),
	);

	if (presentFilters.length === 0) {
		return undefined;
	}

	if (presentFilters.length === 1) {
		return presentFilters[0];
	}

	return {
		and: presentFilters,
	};
}
