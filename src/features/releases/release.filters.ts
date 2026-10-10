import type { NotionQueryFilter } from "../../shared/notion/notion-client";

const dateProperties = {
	announcement: "Formal Announced Date",
	release: "Confirmed Release Date",
} as const;

export type ReleaseDateType = keyof typeof dateProperties;

export function releaseDateProperty(dateType: ReleaseDateType): string {
	return dateProperties[dateType];
}

export const releaseFilters = {
	pending: {
		and: [
			{
				property: "Formal Announced Date",
				date: {
					is_not_empty: true,
				},
			},
			{
				property: "Confirmed Release Date",
				date: {
					is_empty: true,
				},
			},
		],
	},
	confirmed: {
		property: "Confirmed Release Date",
		date: {
			is_not_empty: true,
		},
	},
	notAnnounced: {
		property: "Formal Announced Date",
		date: {
			is_empty: true,
		},
	},
	jira: (jiraId: string): NotionQueryFilter => ({
		property: "JIRAs",
		relation: {
			contains: jiraId,
		},
	}),
	jiras: (jiraIds: string[]): NotionQueryFilter | undefined => {
		const filters = jiraIds.map((jiraId) => releaseFilters.jira(jiraId));

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
	deploymentType: (deploymentType: string): NotionQueryFilter => ({
		property: "Deployment Type",
		select: {
			equals: deploymentType,
		},
	}),
	component: (component: string): NotionQueryFilter => ({
		property: "Component Name",
		rich_text: {
			contains: component,
		},
	}),
	from: (from: string): NotionQueryFilter => ({
		property: "Formal Announced Date",
		date: {
			on_or_after: from,
		},
	}),
	to: (to: string): NotionQueryFilter => ({
		property: "Formal Announced Date",
		date: {
			on_or_before: to,
		},
	}),
	dateEquals: (dateType: ReleaseDateType, date: string): NotionQueryFilter => ({
		property: releaseDateProperty(dateType),
		date: { equals: date },
	}),
	dateFrom: (dateType: ReleaseDateType, date: string): NotionQueryFilter => ({
		property: releaseDateProperty(dateType),
		date: { on_or_after: date },
	}),
	dateTo: (dateType: ReleaseDateType, date: string): NotionQueryFilter => ({
		property: releaseDateProperty(dateType),
		date: { on_or_before: date },
	}),
} satisfies Record<
	string,
	| NotionQueryFilter
	| ((value: string) => NotionQueryFilter)
	| ((dateType: ReleaseDateType, date: string) => NotionQueryFilter)
	| ((values: string[]) => NotionQueryFilter | undefined)
>;

export function combineReleaseFilters(
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
