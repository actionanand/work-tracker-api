import type { NotionQueryFilter } from "../../shared/notion/notion-client";

const activeSprintFilter: NotionQueryFilter = {
	property: "In Active Sprint",
	formula: {
		checkbox: {
			equals: true,
		},
	},
};

export const jiraFilters = {
	active: activeSprintFilter,
	blocked: {
		and: [
			activeSprintFilter,
			{
				property: "Status",
				status: {
					equals: "Blocked",
				},
			},
		],
	},
	spillovers: {
		and: [
			activeSprintFilter,
			{
				property: "Spillover",
				formula: {
					checkbox: {
						equals: true,
					},
				},
			},
		],
	},
	appraisal: {
		property: "Appraisal",
		checkbox: {
			equals: true,
		},
	},
	demoPending: {
		and: [
			{
				property: "Demo Required",
				checkbox: {
					equals: true,
				},
			},
			{
				property: "Demoed Date",
				date: {
					is_empty: true,
				},
			},
		],
	},
	demoed: {
		property: "Demoed Date",
		date: {
			is_not_empty: true,
		},
	},
	byKey: (jiraKey: string): NotionQueryFilter => ({
		property: "JIRA Key",
		title: {
			equals: jiraKey,
		},
	}),
	project: (projectId: string): NotionQueryFilter => ({
		property: "Project",
		relation: {
			contains: projectId,
		},
	}),
	projects: (projectIds: string[]): NotionQueryFilter | undefined => {
		const filters = projectIds.map((projectId) => jiraFilters.project(projectId));

		if (filters.length === 0) {
			return undefined;
		}

		if (filters.length === 1) {
			return filters[0];
		}

		return {
			or: filters,
		};
	},
} satisfies Record<
	string,
	| NotionQueryFilter
	| ((value: string) => NotionQueryFilter)
	| ((values: string[]) => NotionQueryFilter | undefined)
>;

export function combineJiraFilters(
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
