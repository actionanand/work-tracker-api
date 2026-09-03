interface NotionTextItem {
	plain_text?: string;
}

interface NotionRelationItem {
	id: string;
}

interface NotionWorkLinkProperty {
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	select?: {
		name?: string;
	} | null;
	url?: string | null;
	checkbox?: boolean;
	relation?: NotionRelationItem[];
}

interface NotionWorkLinkPage {
	id: string;
	created_time: string;
	last_edited_time: string;
	properties: Record<string, NotionWorkLinkProperty | undefined>;
}

export interface WorkLink {
	id: string;
	createdTime: string;
	lastEditedTime: string;
	link: string;
	type: string | null;
	url: string | null;
	notes: string;
	active: boolean;
	companyIds: string[];
	projectIds: string[];
}

function plainText(items: NotionTextItem[] = []): string {
	return items.map((item) => item.plain_text ?? "").join("").trim();
}

function selectName(property: NotionWorkLinkProperty | undefined): string | null {
	return property?.select?.name?.trim() ?? null;
}

function relationIds(property: NotionWorkLinkProperty | undefined): string[] {
	return (property?.relation ?? []).map((item) => item.id);
}

export function mapWorkLink(page: NotionWorkLinkPage): WorkLink {
	const p = page.properties;

	return {
		id: page.id,
		createdTime: page.created_time,
		lastEditedTime: page.last_edited_time,
		link: plainText(p.Link?.title),
		type: selectName(p.Type),
		url: p.URL?.url ?? null,
		notes: plainText(p.Notes?.rich_text),
		active: p.Active?.checkbox ?? false,
		companyIds: relationIds(p.Company),
		projectIds: relationIds(p.Project),
	};
}

export type { NotionWorkLinkPage };
