import type { NotionQueryFilter } from "../../shared/notion/notion-client";

export const feedbackFilters = {
	appraisal: {
		or: [
			{
				property: "Context",
				select: {
					equals: "Appraisal",
				},
			},
			{
				property: "Context",
				select: {
					equals: "Half-Yearly Appraisal",
				},
			},
		],
	},
	improvementFollowUp: {
		or: [
			{
				property: "Feedback Type",
				select: {
					equals: "Improvement",
				},
			},
			{
				property: "Feedback Type",
				select: {
					equals: "Suggestion",
				},
			},
		],
	},
	negative: {
		property: "Feedback Type",
		select: {
			equals: "Negative",
		},
	},
	company: (companyId: string): NotionQueryFilter => ({
		property: "Company",
		relation: {
			contains: companyId,
		},
	}),
	companies: (companyIds: string[]): NotionQueryFilter | undefined =>
		orFilters(companyIds.map((companyId) => feedbackFilters.company(companyId))),
	team: (teamId: string): NotionQueryFilter => ({
		property: "Team",
		relation: {
			contains: teamId,
		},
	}),
	teams: (teamIds: string[]): NotionQueryFilter | undefined =>
		orFilters(teamIds.map((teamId) => feedbackFilters.team(teamId))),
	personType: (personType: string): NotionQueryFilter => ({
		property: "Person Type",
		select: {
			equals: personType,
		},
	}),
	personTypes: (personTypes: string[]): NotionQueryFilter | undefined =>
		orFilters(personTypes.map((personType) => feedbackFilters.personType(personType))),
	context: (context: string): NotionQueryFilter => ({
		property: "Context",
		select: {
			equals: context,
		},
	}),
	contexts: (contexts: string[]): NotionQueryFilter | undefined =>
		orFilters(contexts.map((context) => feedbackFilters.context(context))),
	feedbackType: (feedbackType: string): NotionQueryFilter => ({
		property: "Feedback Type",
		select: {
			equals: feedbackType,
		},
	}),
	feedbackTypes: (feedbackTypes: string[]): NotionQueryFilter | undefined =>
		orFilters(
			feedbackTypes.map((feedbackType) => feedbackFilters.feedbackType(feedbackType)),
		),
	from: (from: string): NotionQueryFilter => ({
		property: "Date",
		date: {
			on_or_after: from,
		},
	}),
	to: (to: string): NotionQueryFilter => ({
		property: "Date",
		date: {
			on_or_before: to,
		},
	}),
} satisfies Record<
	string,
	| NotionQueryFilter
	| ((value: string) => NotionQueryFilter)
	| ((values: string[]) => NotionQueryFilter | undefined)
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

export function combineFeedbackFilters(
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
