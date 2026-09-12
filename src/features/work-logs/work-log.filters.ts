import type { NotionQueryFilter } from "../../shared/notion/notion-client";

export const workLogFilters = {
	appraisal: {
		property: "Appraisal",
		checkbox: {
			equals: true,
		},
	},
	hasDate: {
		property: "Date",
		date: {
			is_not_empty: true,
		},
	},
	from: (from: string): NotionQueryFilter => ({
		property: "Date",
		date: {
			on_or_after: from,
		},
	}),
	to: (to: string): NotionQueryFilter => ({
		property: "Date",
		date: {
			on_or_before: to,
		},
	}),
	project: (projectId: string): NotionQueryFilter => ({
		property: "Project",
		relation: {
			contains: projectId,
		},
	}),
	projects: (projectIds: string[]): NotionQueryFilter | undefined => {
		const filters = projectIds.map((projectId) => workLogFilters.project(projectId));

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
	jira: (jiraId: string): NotionQueryFilter => ({
		property: "JIRAs",
		relation: {
			contains: jiraId,
		},
	}),
	jiras: (jiraIds: string[]): NotionQueryFilter | undefined =>
		orFilters(jiraIds.map((jiraId) => workLogFilters.jira(jiraId))),
	category: (category: string): NotionQueryFilter => ({
		property: "Category",
		select: {
			equals: category,
		},
	}),
	categories: (categories: string[]): NotionQueryFilter | undefined =>
		orFilters(categories.map((category) => workLogFilters.category(category))),
	type: (type: string): NotionQueryFilter => ({
		property: "Type",
		select: {
			equals: type,
		},
	}),
	types: (types: string[]): NotionQueryFilter | undefined =>
		orFilters(types.map((type) => workLogFilters.type(type))),
	workMode: (workMode: string): NotionQueryFilter => ({
		property: "Work Mode",
		select: {
			equals: workMode,
		},
	}),
	workModes: (workModes: string[]): NotionQueryFilter | undefined =>
		orFilters(workModes.map((workMode) => workLogFilters.workMode(workMode))),
	appraisalValue: (appraisal: boolean): NotionQueryFilter => ({
		property: "Appraisal",
		checkbox: {
			equals: appraisal,
		},
	}),
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

export function combineWorkLogFilters(
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
