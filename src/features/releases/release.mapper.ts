interface NotionTextItem {
	plain_text?: string;
}

interface NotionRelationItem {
	id: string;
}

interface RollupArrayItem {
	type?: string;
	relation?: NotionRelationItem[];
	status?: {
		name?: string;
	} | null;
	select?: {
		name?: string;
	} | null;
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	number?: number | null;
	formula?: {
		type?: string;
		number?: number | null;
		string?: string | null;
		boolean?: boolean | null;
	};
}

interface NotionRollup {
	type?: string;
	array?: RollupArrayItem[];
	number?: number | null;
}

interface NotionReleaseProperty {
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	select?: {
		name?: string;
	} | null;
	date?: {
		start?: string | null;
	} | null;
	relation?: NotionRelationItem[];
	rollup?: NotionRollup | null;
}

interface NotionReleasePage {
	id: string;
	created_time: string;
	last_edited_time: string;
	properties: Record<string, NotionReleaseProperty | undefined>;
}

export interface ReleaseItem {
	id: string;
	createdTime: string;
	lastEditedTime: string;
	releaseItem: string;
	componentName: string;
	deploymentType: string | null;
	versionNumber: string;
	branch: string;
	formalAnnouncedDate: string | null;
	confirmedReleaseDate: string | null;
	notes: string;
	jiraIds: string[];
	jiraStatuses: string[];
	sprintIds: string[];
	spilloverCount: number;
}

function plainText(items: NotionTextItem[] = []): string {
	return items.map((item) => item.plain_text ?? "").join("").trim();
}

function selectName(property: NotionReleaseProperty | undefined): string | null {
	return property?.select?.name?.trim() ?? null;
}

function relationIds(property: NotionReleaseProperty | undefined): string[] {
	return (property?.relation ?? []).map((item) => item.id);
}

function rollupRelationIds(property: NotionReleaseProperty | undefined): string[] {
	const rollup = property?.rollup;

	if (!rollup?.array) {
		return [];
	}

	return rollup.array.flatMap((item) => item.relation?.map((relation) => relation.id) ?? []);
}

function rollupTextValues(property: NotionReleaseProperty | undefined): string[] {
	const rollup = property?.rollup;

	if (!rollup?.array) {
		return [];
	}

	return rollup.array
		.map((item) => {
			if (item.status?.name) {
				return item.status.name.trim();
			}

			if (item.select?.name) {
				return item.select.name.trim();
			}

			if (item.formula?.string) {
				return item.formula.string.trim();
			}

			return plainText(item.title) || plainText(item.rich_text);
		})
		.filter((value) => value.length > 0);
}

function rollupNumber(property: NotionReleaseProperty | undefined): number {
	const rollup = property?.rollup;

	if (!rollup) {
		return 0;
	}

	if (typeof rollup.number === "number") {
		return rollup.number;
	}

	if (!rollup.array) {
		return 0;
	}

	return rollup.array.reduce((total, item) => {
		if (typeof item.number === "number") {
			return total + item.number;
		}

		if (typeof item.formula?.number === "number") {
			return total + item.formula.number;
		}

		return total;
	}, 0);
}

export function mapReleaseItem(page: NotionReleasePage): ReleaseItem {
	const p = page.properties;

	return {
		id: page.id,
		createdTime: page.created_time,
		lastEditedTime: page.last_edited_time,
		releaseItem: plainText(p["Release Items"]?.title),
		componentName: plainText(p["Component Name"]?.rich_text),
		deploymentType: selectName(p["Deployment Type"]),
		versionNumber: plainText(p["Version Number"]?.rich_text),
		branch: plainText(p.Branch?.rich_text),
		formalAnnouncedDate: p["Formal Announced Date"]?.date?.start ?? null,
		confirmedReleaseDate: p["Confirmed Release Date"]?.date?.start ?? null,
		notes: plainText(p.Notes?.rich_text),
		jiraIds: relationIds(p.JIRAs),
		jiraStatuses: rollupTextValues(p["JIRA Status"]),
		sprintIds: rollupRelationIds(p.Sprints),
		spilloverCount: rollupNumber(p["Spillover Count"]),
	};
}

export type { NotionReleasePage };
