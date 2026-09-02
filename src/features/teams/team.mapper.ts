interface NotionTextItem {
	plain_text?: string;
}

interface NotionRelationItem {
	id: string;
}

interface NotionTeamProperty {
	title?: NotionTextItem[];
	checkbox?: boolean;
	relation?: NotionRelationItem[];
}

interface NotionTeamPage {
	id: string;
	properties: Record<string, NotionTeamProperty | undefined>;
}

export interface Team {
	id: string;
	team: string;
	active: boolean;
	companyIds: string[];
	projectIds: string[];
}

function plainText(items: NotionTextItem[] = []): string {
	return items.map((item) => item.plain_text ?? "").join("").trim();
}

function relationIds(property: NotionTeamProperty | undefined): string[] {
	return (property?.relation ?? []).map((item) => item.id);
}

export function mapTeam(page: NotionTeamPage): Team {
	const p = page.properties;

	return {
		id: page.id,
		team: plainText(p.Team?.title),
		active: p.Active?.checkbox ?? false,
		companyIds: relationIds(p.Company),
		projectIds: relationIds(p.Projects),
	};
}

export type { NotionTeamPage };
