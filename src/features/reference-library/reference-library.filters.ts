import type { NotionQueryFilter } from "../../shared/notion/notion-client";

export const referenceLibraryFilters = {
	category: (category: string): NotionQueryFilter => ({
		property: "Category",
		select: { equals: category },
	}),
	categories: (categories: string[]): NotionQueryFilter | undefined =>
		orFilters(categories.map((category) => referenceLibraryFilters.category(category))),
	tag: (tag: string): NotionQueryFilter => ({
		property: "Tags",
		multi_select: { contains: tag },
	}),
	tags: (tags: string[]): NotionQueryFilter | undefined =>
		orFilters(tags.map((tag) => referenceLibraryFilters.tag(tag))),
	query: (query: string): NotionQueryFilter => ({
		property: "Article",
		title: { contains: query },
	}),
};

function orFilters(filters: NotionQueryFilter[]): NotionQueryFilter | undefined {
	if (filters.length === 0) return undefined;
	if (filters.length === 1) return filters[0];

	return { or: filters };
}

export function combineReferenceLibraryFilters(
	filters: Array<NotionQueryFilter | undefined>,
): NotionQueryFilter | undefined {
	const present = filters.filter(
		(filter): filter is NotionQueryFilter => Boolean(filter),
	);

	if (present.length === 0) return undefined;
	if (present.length === 1) return present[0];

	return { and: present };
}
