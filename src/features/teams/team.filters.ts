import type { NotionQueryFilter } from "../../shared/notion/notion-client";

export const teamFilters = {
	active: {
		property: "Active",
		checkbox: {
			equals: true,
		},
	},
	company: (companyId: string): NotionQueryFilter => ({
		property: "Company",
		relation: {
			contains: companyId,
		},
	}),
} satisfies Record<string, NotionQueryFilter | ((value: string) => NotionQueryFilter)>;

export function combineTeamFilters(
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
