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
	multi_select?: Array<{
		name: string;
	}>;
	checkbox?: boolean;
	formula?: {
		boolean?: boolean;
		number?: number;
	};
	date?: {
		start?: string | null;
	};
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
	spilloverReason: string;
	inActiveSprint: boolean;
	demoRequired: boolean;
	demoedDate: string | null;
	demoNotes: string;
	sprintIds: string[];
	projectIds: string[];
	blockedByIds: string[];
	releaseItemIds: string[];
}

export function plainText(items: NotionTextItem[] = []): string {
	return items.map((item) => item.plain_text ?? "").join("");
}

export function relationIds(property: NotionJiraProperty | undefined): string[] {
	return (property?.relation ?? []).map((item) => item.id);
}

export function mapJira(page: NotionJiraPage): Jira {
	const p = page.properties;

	return {
		id: page.id,
		createdTime: page.created_time,
		lastEditedTime: page.last_edited_time,

		jiraKey: plainText(p["JIRA Key"]?.title),
		summary: plainText(p["Summary"]?.rich_text),

		status: p["Status"]?.status?.name ?? null,

		tags: (p["Tags"]?.multi_select ?? []).map((tag) => tag.name),

		appraisal: p["Appraisal"]?.checkbox ?? false,

		spillover: p["Spillover"]?.formula?.boolean ?? false,

		spilloverCount: p["Spillover Count"]?.formula?.number ?? 0,

		spilloverReason: plainText(p["Spillover Reason"]?.rich_text),

		inActiveSprint: p["In Active Sprint"]?.formula?.boolean ?? false,

		demoRequired: p["Demo Required"]?.checkbox ?? false,

		demoedDate: p["Demoed Date"]?.date?.start ?? null,

		demoNotes: plainText(p["Demo Notes"]?.rich_text),

		sprintIds: relationIds(p["Sprints"]),

		projectIds: relationIds(p["Project"]),

		blockedByIds: relationIds(p["Blocked By"]),

		releaseItemIds: relationIds(p["Release Items"]),
	};
}

export type { NotionJiraPage };
