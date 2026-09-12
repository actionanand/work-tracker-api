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
	sprint: (sprintId: string): NotionQueryFilter => ({
		property: "Sprints",
		relation: {
			contains: sprintId,
		},
	}),
	status: (status: string): NotionQueryFilter => ({
		property: "Status",
		status: {
			equals: status,
		},
	}),
	statuses: (statuses: string[]): NotionQueryFilter | undefined =>
		orFilters(statuses.map((status) => jiraFilters.status(status))),
	tag: (tag: string): NotionQueryFilter => ({
		property: "Tags",
		multi_select: {
			contains: tag,
		},
	}),
	tags: (tags: string[]): NotionQueryFilter | undefined =>
		orFilters(tags.map((tag) => jiraFilters.tag(tag))),
	sprints: (sprintIds: string[]): NotionQueryFilter | undefined =>
		orFilters(sprintIds.map((sprintId) => jiraFilters.sprint(sprintId))),
	inActiveSprintValue: (inActiveSprint: boolean): NotionQueryFilter => ({
		property: "In Active Sprint",
		formula: {
			checkbox: {
				equals: inActiveSprint,
			},
		},
	}),
	spilloverValue: (spillover: boolean): NotionQueryFilter => ({
		property: "Spillover",
		formula: {
			checkbox: {
				equals: spillover,
			},
		},
	}),
	appraisalValue: (appraisal: boolean): NotionQueryFilter => ({
		property: "Appraisal",
		checkbox: {
			equals: appraisal,
		},
	}),
	demoRequiredValue: (demoRequired: boolean): NotionQueryFilter => ({
		property: "Demo Required",
		checkbox: {
			equals: demoRequired,
		},
	}),
	query: (query: string): NotionQueryFilter => ({
		or: [
			{
				property: "JIRA Key",
				title: {
					contains: query,
				},
			},
			{
				property: "Summary",
				rich_text: {
					contains: query,
				},
			},
		],
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
	| ((value: boolean) => NotionQueryFilter)
	| ((values: string[]) => NotionQueryFilter | undefined)
>;

function orFilters(filters: NotionQueryFilter[]): NotionQueryFilter | undefined {
	if (filters.length === 0) {
		return undefined;
	}

	if (filters.length === 1) {
		return filters[0];
	}

	return {
		or: filters,
	};
}

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
