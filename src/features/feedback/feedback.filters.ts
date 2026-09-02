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
	project: (projectId: string): NotionQueryFilter => ({
		property: "Project",
		relation: {
			contains: projectId,
		},
	}),
	team: (teamId: string): NotionQueryFilter => ({
		property: "Team",
		relation: {
			contains: teamId,
		},
	}),
	personType: (personType: string): NotionQueryFilter => ({
		property: "Person Type",
		select: {
			equals: personType,
		},
	}),
	context: (context: string): NotionQueryFilter => ({
		property: "Context",
		select: {
			equals: context,
		},
	}),
	feedbackType: (feedbackType: string): NotionQueryFilter => ({
		property: "Feedback Type",
		select: {
			equals: feedbackType,
		},
	}),
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
} satisfies Record<string, NotionQueryFilter | ((value: string) => NotionQueryFilter)>;

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
