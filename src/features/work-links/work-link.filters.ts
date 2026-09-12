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
	companies: (companyIds: string[]): NotionQueryFilter | undefined =>
		orFilters(companyIds.map((companyId) => workLinkFilters.company(companyId))),
	project: (projectId: string): NotionQueryFilter => ({
		property: "Project",
		relation: {
			contains: projectId,
		},
	}),
	projects: (projectIds: string[]): NotionQueryFilter | undefined =>
		orFilters(projectIds.map((projectId) => workLinkFilters.project(projectId))),
	type: (type: string): NotionQueryFilter => ({
		property: "Type",
		select: {
			equals: type,
		},
	}),
	types: (types: string[]): NotionQueryFilter | undefined =>
		orFilters(types.map((type) => workLinkFilters.type(type))),
	activeValue: (active: boolean): NotionQueryFilter => ({
		property: "Active",
		checkbox: {
			equals: active,
		},
	}),
	query: (query: string): NotionQueryFilter => ({
		property: "Link",
		title: {
			contains: query,
		},
	}),
} satisfies Record<
	string,
	| NotionQueryFilter
	| ((value: string) => NotionQueryFilter)
	| ((values: string[]) => NotionQueryFilter | undefined)
	| ((value: boolean) => NotionQueryFilter)
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
