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
} satisfies Record<string, NotionQueryFilter | ((value: string) => NotionQueryFilter)>;
