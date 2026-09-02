import type { NotionQueryFilter } from "../../shared/notion/notion-client";

export const companyFilters = {
	active: {
		property: "Active",
		checkbox: {
			equals: true,
		},
	},
	category: (category: string): NotionQueryFilter => ({
		property: "Category",
		select: {
			equals: category,
		},
	}),
} satisfies Record<string, NotionQueryFilter | ((value: string) => NotionQueryFilter)>;

export function combineCompanyFilters(
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
