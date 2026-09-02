interface NotionTextItem {
	plain_text?: string;
}

interface NotionRelationItem {
	id: string;
}

interface NotionFeedbackProperty {
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	select?: {
		name?: string;
	} | null;
	date?: {
		start?: string | null;
	} | null;
	relation?: NotionRelationItem[];
}

interface NotionFeedbackPage {
	id: string;
	created_time: string;
	last_edited_time: string;
	properties: Record<string, NotionFeedbackProperty | undefined>;
}

export interface Feedback {
	id: string;
	createdTime: string;
	lastEditedTime: string;
	feedback: string;
	date: string | null;
	feedbackFrom: string;
	personType: string | null;
	context: string | null;
	feedbackType: string | null;
	details: string;
	actionFollowUp: string;
	companyIds: string[];
	projectIds: string[];
	teamIds: string[];
}

function plainText(items: NotionTextItem[] = []): string {
	return items.map((item) => item.plain_text ?? "").join("").trim();
}

function selectName(property: NotionFeedbackProperty | undefined): string | null {
	return property?.select?.name?.trim() ?? null;
}

function relationIds(property: NotionFeedbackProperty | undefined): string[] {
	return (property?.relation ?? []).map((item) => item.id);
}

export function mapFeedback(page: NotionFeedbackPage): Feedback {
	const p = page.properties;

	return {
		id: page.id,
		createdTime: page.created_time,
		lastEditedTime: page.last_edited_time,
		feedback: plainText(p.Feedback?.title),
		date: p.Date?.date?.start ?? null,
		feedbackFrom: plainText(p["Feedback From"]?.rich_text),
		personType: selectName(p["Person Type"]),
		context: selectName(p.Context),
		feedbackType: selectName(p["Feedback Type"]),
		details: plainText(p.Details?.rich_text),
		actionFollowUp: plainText(p["Action / Follow-up"]?.rich_text),
		companyIds: relationIds(p.Company),
		projectIds: relationIds(p.Project),
		teamIds: relationIds(p.Team),
	};
}

export type { NotionFeedbackPage };
