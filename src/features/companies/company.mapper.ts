interface NotionTextItem {
	plain_text?: string;
}

interface NotionRelationItem {
	id: string;
}

interface NotionCompanyProperty {
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	select?: {
		name?: string;
	} | null;
	checkbox?: boolean;
	relation?: NotionRelationItem[];
}

interface NotionCompanyPage {
	id: string;
	properties: Record<string, NotionCompanyProperty | undefined>;
}

export interface Company {
	id: string;
	company: string;
	category: string | null;
	division: string;
	product: string;
	active: boolean;
	projectIds: string[];
	teamIds: string[];
}

function plainText(items: NotionTextItem[] = []): string {
	return items.map((item) => item.plain_text ?? "").join("").trim();
}

function relationIds(property: NotionCompanyProperty | undefined): string[] {
	return (property?.relation ?? []).map((item) => item.id);
}

export function mapCompany(page: NotionCompanyPage): Company {
	const p = page.properties;

	return {
		id: page.id,
		company: plainText(p.Company?.title),
		category: p.Category?.select?.name?.trim() ?? null,
		division: plainText(p.Division?.rich_text),
		product: plainText(p.Product?.rich_text),
		active: p.Active?.checkbox ?? false,
		projectIds: relationIds(p.Projects),
		teamIds: relationIds(p.Teams),
	};
}

export type { NotionCompanyPage };
