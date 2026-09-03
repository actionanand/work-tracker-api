import type { NotionQueryFilter } from "../../shared/notion/notion-client";

export const workLinkFilters = {
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
	project: (projectId: string): NotionQueryFilter => ({
		property: "Project",
		relation: {
			contains: projectId,
		},
	}),
	type: (type: string): NotionQueryFilter => ({
		property: "Type",
		select: {
			equals: type,
		},
	}),
	query: (query: string): NotionQueryFilter => ({
		property: "Link",
		title: {
			contains: query,
		},
	}),
} satisfies Record<string, NotionQueryFilter | ((value: string) => NotionQueryFilter)>;

export function combineWorkLinkFilters(
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
