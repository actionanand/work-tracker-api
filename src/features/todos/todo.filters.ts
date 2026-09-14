import type { NotionQueryFilter } from "../../shared/notion/notion-client";

function orFilters(filters: NotionQueryFilter[]): NotionQueryFilter | undefined {
	if (filters.length === 0) return undefined;
	if (filters.length === 1) return filters[0];

	return { or: filters };
}

export function combineTodoFilters(
	filters: Array<NotionQueryFilter | undefined>,
): NotionQueryFilter | undefined {
	const active = filters.filter((filter): filter is NotionQueryFilter => Boolean(filter));

	if (active.length === 0) return undefined;
	if (active.length === 1) return active[0];

	return { and: active };
}

export const todoFilters = {
	statuses(statuses: string[]): NotionQueryFilter | undefined {
		return orFilters(
			statuses.map((status) => ({
				property: "Status",
				status: { equals: status },
			})),
		);
	},
	dueFrom(date: string): NotionQueryFilter {
		return { property: "Due Date", date: { on_or_after: date } };
	},
	dueTo(date: string): NotionQueryFilter {
		return { property: "Due Date", date: { on_or_before: date } };
	},
	dueBefore(date: string): NotionQueryFilter {
		return { property: "Due Date", date: { before: date } };
	},
	dueOnOrBefore(date: string): NotionQueryFilter {
		return { property: "Due Date", date: { on_or_before: date } };
	},
	q(value: string): NotionQueryFilter {
		return { property: "To Do", title: { contains: value } };
	},
	schedules(schedules: string[]): NotionQueryFilter | undefined {
		return orFilters(
			schedules.map((schedule) => ({
				property: "Schedule",
				select: { equals: schedule },
			})),
		);
	},
	recurring(value: boolean): NotionQueryFilter {
		return { property: "Recurring", formula: { checkbox: { equals: value } } };
	},
	showToday(value: boolean): NotionQueryFilter {
		return { property: "Show Today", formula: { checkbox: { equals: value } } };
	},
	workdayAdjust(value: boolean): NotionQueryFilter {
		return { property: "Workday Adjust", checkbox: { equals: value } };
	},
	hasSetupIssue(value: boolean): NotionQueryFilter {
		return {
			property: "Setup Issue",
			formula: { string: value ? { is_not_empty: true } : { is_empty: true } },
		};
	},
};
