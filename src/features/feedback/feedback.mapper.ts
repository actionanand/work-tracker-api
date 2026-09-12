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
	rollup?: {
		type?: string;
		array?: Array<{
			select?: {
				name?: string;
			} | null;
			title?: NotionTextItem[];
			rich_text?: NotionTextItem[];
			formula?: {
				string?: string | null;
			};
		}>;
		select?: {
			name?: string;
		} | null;
	};
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
	workType: string | null;
	details: string;
	actionFollowUp: string;
	companyIds: string[];
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

function rollupText(property: NotionFeedbackProperty | undefined): string | null {
	const rollup = property?.rollup;

	if (!rollup) {
		return null;
	}

	if (rollup.select?.name) {
		return rollup.select.name.trim();
	}

	const value = (rollup.array ?? [])
		.map((item) => {
			if (item.select?.name) {
				return item.select.name.trim();
			}

			if (item.formula?.string) {
				return item.formula.string.trim();
			}

			return plainText(item.title) || plainText(item.rich_text);
		})
		.find((item) => item.length > 0);

	return value ?? null;
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
		workType: rollupText(p["Work Type"]),
		details: plainText(p.Details?.rich_text),
		actionFollowUp: plainText(p["Action / Follow-up"]?.rich_text),
		companyIds: relationIds(p.Company),
		teamIds: relationIds(p.Team),
	};
}

export type { NotionFeedbackPage };
