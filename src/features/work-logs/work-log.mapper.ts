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

interface NotionWorkLogProperty {
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	select?: {
		name?: string;
	} | null;
	checkbox?: boolean;
	date?: {
		start?: string | null;
	} | null;
	relation?: NotionRelationItem[];
	rollup?: NotionRollup | null;
}

interface NotionWorkLogPage {
	id: string;
	created_time: string;
	last_edited_time: string;
	properties: Record<string, NotionWorkLogProperty | undefined>;
}

export interface WorkLog {
	id: string;
	createdTime: string;
	lastEditedTime: string;
	update: string;
	date: string | null;
	category: string | null;
	type: string | null;
	workMode: string | null;
	comment: string;
	wentWrong: string;
	appraisal: boolean;
	projectIds: string[];
	jiraIds: string[];
	companyIds: string[];
	teamIds: string[];
	jiraStatuses: string[];
	sprintIds: string[];
	spilloverCount: number;
}

function plainText(items: NotionTextItem[] = []): string {
	return items.map((item) => item.plain_text ?? "").join("").trim();
}

function selectName(property: NotionWorkLogProperty | undefined): string | null {
	return property?.select?.name?.trim() ?? null;
}

function relationIds(property: NotionWorkLogProperty | undefined): string[] {
	return (property?.relation ?? []).map((item) => item.id);
}

function rollupRelationIds(property: NotionWorkLogProperty | undefined): string[] {
	const rollup = property?.rollup;

	if (!rollup?.array) {
		return [];
	}

	return rollup.array.flatMap((item) => item.relation?.map((relation) => relation.id) ?? []);
}

function rollupTextValues(property: NotionWorkLogProperty | undefined): string[] {
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

function rollupNumber(property: NotionWorkLogProperty | undefined): number {
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

export function mapWorkLog(page: NotionWorkLogPage): WorkLog {
	const p = page.properties;

	return {
		id: page.id,
		createdTime: page.created_time,
		lastEditedTime: page.last_edited_time,
		update: plainText(p.Update?.title),
		date: p.Date?.date?.start ?? null,
		category: selectName(p.Category),
		type: selectName(p.Type),
		workMode: selectName(p["Work Mode"]),
		comment: plainText(p.Comment?.rich_text),
		wentWrong: plainText(p["Went Wrong"]?.rich_text),
		appraisal: p.Appraisal?.checkbox ?? false,
		projectIds: relationIds(p.Project),
		jiraIds: relationIds(p.JIRAs),
		companyIds: rollupRelationIds(p.Company),
		teamIds: rollupRelationIds(p.Team),
		jiraStatuses: rollupTextValues(p["Jira Status"]),
		sprintIds: rollupRelationIds(p.Sprints),
		spilloverCount: rollupNumber(p["Spillover Count"]),
	};
}

export type { NotionWorkLogPage };
