interface NotionTextItem {
	plain_text?: string;
}

interface NotionRelationItem {
	id: string;
}

interface NotionJiraProperty {
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	status?: {
		name: string;
	};
	select?: {
		name: string;
	};
	multi_select?: Array<{
		name: string;
	}>;
	checkbox?: boolean;
	formula?: {
		boolean?: boolean;
		number?: number;
		date?: {
			start?: string | null;
		} | null;
	};
	date?: {
		start?: string | null;
	};
	rollup?: {
		date?: {
			start?: string | null;
		} | null;
		array?: Array<{
			date?: {
				start?: string | null;
			} | null;
		}>;
	} | null;
	relation?: NotionRelationItem[];
}

interface NotionJiraPage {
	id: string;
	created_time: string;
	last_edited_time: string;
	properties: Record<string, NotionJiraProperty | undefined>;
}

export interface Jira {
	id: string;
	createdTime: string;
	lastEditedTime: string;
	jiraKey: string;
	summary: string;
	status: string | null;
	tags: string[];
	appraisal: boolean;
	spillover: boolean;
	spilloverCount: number;
	description: string;
	firstSprintStart: string | null;
	inActiveSprint: boolean;
	demoRequired: boolean;
	demoedDate: string | null;
	demoNotes: string;
	sprintIds: string[];
	projectIds: string[];
	linkedJiraIds: string[];
	linkedFromIds: string[];
	linkType: string | null;
	linkReason: string;
	linkedOn: string | null;
	resolvedOn: string | null;
	releaseItemIds: string[];
}

export function plainText(items: NotionTextItem[] = []): string {
	return items.map((item) => item.plain_text ?? "").join("");
}

export function relationIds(property: NotionJiraProperty | undefined): string[] {
	return (property?.relation ?? []).map((item) => item.id);
}

function notionDate(property: NotionJiraProperty | undefined): string | null {
	if (property?.date?.start) return property.date.start;
	if (property?.formula?.date?.start) return property.formula.date.start;
	if (property?.rollup?.date?.start) return property.rollup.date.start;

	for (const item of property?.rollup?.array ?? []) {
		if (item.date?.start) return item.date.start;
	}

	return null;
}

export function mapJira(page: NotionJiraPage): Jira {
	const p = page.properties;

	return {
		id: page.id,
		createdTime: page.created_time,
		lastEditedTime: page.last_edited_time,

		jiraKey: plainText(p["JIRA Key"]?.title).trim(),
		summary: plainText(p["Summary"]?.rich_text),

		status: p["Status"]?.status?.name ?? null,

		tags: (p["Tags"]?.multi_select ?? []).map((tag) => tag.name),

		appraisal: p["Appraisal"]?.checkbox ?? false,

		spillover: p["Spillover"]?.formula?.boolean ?? false,

		spilloverCount: p["Spillover Count"]?.formula?.number ?? 0,

		description: plainText(p.Description?.rich_text),

		firstSprintStart: notionDate(p["First Sprint Start"]),

		inActiveSprint: p["In Active Sprint"]?.formula?.boolean ?? false,

		demoRequired: p["Demo Required"]?.checkbox ?? false,

		demoedDate: p["Demoed Date"]?.date?.start ?? null,

		demoNotes: plainText(p["Demo Notes"]?.rich_text),

		sprintIds: relationIds(p["Sprints"]),

		projectIds: relationIds(p["Project"]),

		linkedJiraIds: relationIds(p["Linked JIRA"]),

		linkedFromIds: relationIds(p["Linked From"]),

		linkType: p["Link Type"]?.select?.name ?? null,

		linkReason: plainText(p["Link Reason"]?.rich_text),

		linkedOn: p["Linked On"]?.date?.start ?? null,

		resolvedOn: p["Resolved On"]?.date?.start ?? null,

		releaseItemIds: relationIds(p["Release Items"]),
	};
}

export type { NotionJiraPage };
