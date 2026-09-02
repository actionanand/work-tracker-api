import type { NotionQueryFilter } from "../../shared/notion/notion-client";

export const sprintFilters = {
	active: {
		property: "Active",
		checkbox: {
			equals: true,
		},
	},
	history: {
		property: "Active",
		checkbox: {
			equals: false,
		},
	},
	project: (projectId: string): NotionQueryFilter => ({
		property: "Project",
		relation: {
			contains: projectId,
		},
	}),
	from: (from: string): NotionQueryFilter => ({
		property: "End Date",
		date: {
			on_or_after: from,
		},
	}),
	to: (to: string): NotionQueryFilter => ({
		property: "Start Date",
		date: {
			on_or_before: to,
		},
	}),
} satisfies Record<string, NotionQueryFilter | ((value: string) => NotionQueryFilter)>;

export function combineSprintFilters(
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
