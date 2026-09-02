interface NotionTextItem {
	plain_text?: string;
}

interface NotionRelationItem {
	id: string;
}

interface NotionProjectProperty {
	title?: NotionTextItem[];
	checkbox?: boolean;
	relation?: NotionRelationItem[];
}

interface NotionProjectPage {
	id: string;
	properties: Record<string, NotionProjectProperty | undefined>;
}

export interface Project {
	id: string;
	project: string;
	active: boolean;
	companyIds: string[];
	teamIds: string[];
}

function plainText(items: NotionTextItem[] = []): string {
	return items.map((item) => item.plain_text ?? "").join("").trim();
}

function relationIds(property: NotionProjectProperty | undefined): string[] {
	return (property?.relation ?? []).map((item) => item.id);
}

export function mapProject(page: NotionProjectPage): Project {
	const p = page.properties;

	return {
		id: page.id,
		project: plainText(p.Project?.title),
		active: p.Active?.checkbox ?? false,
		companyIds: relationIds(p.Company),
		teamIds: relationIds(p.Team),
	};
}

export type { NotionProjectPage };
