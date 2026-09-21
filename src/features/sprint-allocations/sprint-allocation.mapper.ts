interface NotionTextItem {
	plain_text?: string;
}

interface NotionRelationItem {
	id: string;
}

interface RollupArrayItem {
	type?: string;
	checkbox?: boolean | null;
	date?: { start?: string | null } | null;
	formula?: {
		type?: string;
		boolean?: boolean | null;
	};
}

interface SprintActiveRollup {
	type?: string;
	checkbox?: boolean | null;
	date?: { start?: string | null } | null;
	array?: RollupArrayItem[];
}

interface NotionSprintAllocationProperty {
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	number?: number | null;
	date?: { start?: string | null } | null;
	formula?: {
		boolean?: boolean | null;
		date?: { start?: string | null } | null;
	};
	relation?: NotionRelationItem[];
	rollup?: SprintActiveRollup | null;
}

interface NotionSprintAllocationPage {
	id: string;
	properties: Record<string, NotionSprintAllocationProperty | undefined>;
}

export interface SprintAllocation {
	id: string;
	allocation: string;
	plannedDays: number;
	notes: string;
	sprintIds: string[];
	jiraIds: string[];
	sprintActive: boolean;
	spillReason: string;
	spilled: boolean;
	sprintStart: string | null;
	firstSprintStart: string | null;
}

function plainText(items: NotionTextItem[] = []): string {
	return items.map((item) => item.plain_text ?? "").join("");
}

function relationIds(property: NotionSprintAllocationProperty | undefined): string[] {
	return (property?.relation ?? []).map((item) => item.id);
}

function rollupBoolean(property: NotionSprintAllocationProperty | undefined): boolean {
	const rollup = property?.rollup;

	if (!rollup) {
		return false;
	}

	if (typeof rollup.checkbox === "boolean") {
		return rollup.checkbox;
	}

	if (Array.isArray(rollup.array)) {
		return rollup.array.some((item) => {
			if (typeof item.checkbox === "boolean") {
				return item.checkbox;
			}

			if (typeof item.formula?.boolean === "boolean") {
				return item.formula.boolean;
			}

			return false;
		});
	}

	return false;
}

function notionDate(property: NotionSprintAllocationProperty | undefined): string | null {
	if (property?.date?.start) return property.date.start;
	if (property?.formula?.date?.start) return property.formula.date.start;
	if (property?.rollup?.date?.start) return property.rollup.date.start;

	for (const item of property?.rollup?.array ?? []) {
		if (item.date?.start) return item.date.start;
	}

	return null;
}

export function mapSprintAllocation(
	page: NotionSprintAllocationPage,
): SprintAllocation {
	const p = page.properties;

	return {
		id: page.id,
		allocation: plainText(p.Allocation?.title).trim(),
		plannedDays: p["Planned Days"]?.number ?? 0,
		notes: plainText(p.Notes?.rich_text),
		sprintIds: relationIds(p.Sprint),
		jiraIds: relationIds(p.JIRA),
		sprintActive: rollupBoolean(p["Sprint Active"]),
		spillReason: plainText(p["Spill Reason"]?.rich_text),
		spilled: p.Spilled?.formula?.boolean ?? false,
		sprintStart: notionDate(p["Sprint Start"]),
		firstSprintStart: notionDate(p["First Sprint Start"]),
	};
}

export type { NotionSprintAllocationPage };
