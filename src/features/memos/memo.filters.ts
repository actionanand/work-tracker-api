import type { NotionQueryFilter } from "../../shared/notion/notion-client";

function orFilters(filters: NotionQueryFilter[]): NotionQueryFilter | undefined {
	if (filters.length === 0) return undefined;
	if (filters.length === 1) return filters[0];

	return { or: filters };
}

export function combineMemoFilters(
	filters: Array<NotionQueryFilter | undefined>,
): NotionQueryFilter | undefined {
	const active = filters.filter((filter): filter is NotionQueryFilter => Boolean(filter));

	if (active.length === 0) return undefined;
	if (active.length === 1) return active[0];

	return { and: active };
}

export const memoFilters = {
	categories(categories: string[]): NotionQueryFilter | undefined {
		return orFilters(
			categories.map((category) => ({
				property: "Category",
				select: { equals: category },
			})),
		);
	},
	tags(tags: string[]): NotionQueryFilter | undefined {
		return orFilters(
			tags.map((tag) => ({
				property: "Tags",
				multi_select: { contains: tag },
			})),
		);
	},
	pinned(value: boolean): NotionQueryFilter {
		return { property: "Pinned", checkbox: { equals: value } };
	},
	q(value: string): NotionQueryFilter {
		return { property: "Memo", title: { contains: value } };
	},
};
