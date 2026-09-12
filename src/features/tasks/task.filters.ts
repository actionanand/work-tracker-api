import type { NotionQueryFilter } from "../../shared/notion/notion-client";

function orFilters(filters: NotionQueryFilter[]): NotionQueryFilter | undefined {
	if (filters.length === 0) return undefined;
	if (filters.length === 1) return filters[0];

	return { or: filters };
}

export function combineTaskFilters(
	filters: Array<NotionQueryFilter | undefined>,
): NotionQueryFilter | undefined {
	const active = filters.filter((filter): filter is NotionQueryFilter => Boolean(filter));

	if (active.length === 0) return undefined;
	if (active.length === 1) return active[0];

	return { and: active };
}

function selectAny(property: string, values: string[]): NotionQueryFilter | undefined {
	return orFilters(values.map((value) => ({ property, select: { equals: value } })));
}

function relationAny(property: string, ids: string[]): NotionQueryFilter | undefined {
	return orFilters(ids.map((id) => ({ property, relation: { contains: id } })));
}

export const taskFilters = {
	statuses(statuses: string[]): NotionQueryFilter | undefined {
		return orFilters(
			statuses.map((status) => ({
				property: "Status",
				status: { equals: status },
			})),
		);
	},
	priorities(values: string[]): NotionQueryFilter | undefined {
		return selectAny("Priority", values);
	},
	responsibilities(values: string[]): NotionQueryFilter | undefined {
		return selectAny("Responsibility", values);
	},
	requestedByTypes(values: string[]): NotionQueryFilter | undefined {
		return selectAny("Requested By Type", values);
	},
	assignedToTypes(values: string[]): NotionQueryFilter | undefined {
		return selectAny("Assigned To Type", values);
	},
	companies(ids: string[]): NotionQueryFilter | undefined {
		return relationAny("Company", ids);
	},
	jiras(ids: string[]): NotionQueryFilter | undefined {
		return relationAny("JIRAs", ids);
	},
	dateFrom(property: string, date: string): NotionQueryFilter {
		return { property, date: { on_or_after: date } };
	},
	dateTo(property: string, date: string): NotionQueryFilter {
		return { property, date: { on_or_before: date } };
	},
	dateBefore(property: string, date: string): NotionQueryFilter {
		return { property, date: { before: date } };
	},
	q(value: string): NotionQueryFilter {
		return { property: "Task", title: { contains: value } };
	},
};
