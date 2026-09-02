interface NotionTextItem {
	plain_text?: string;
}

interface NotionRelationItem {
	id: string;
}

interface RollupArrayItem {
	type?: string;
	checkbox?: boolean | null;
	formula?: {
		type?: string;
		boolean?: boolean | null;
	};
}

interface SprintActiveRollup {
	type?: string;
	checkbox?: boolean | null;
	array?: RollupArrayItem[];
}

interface NotionSprintAllocationProperty {
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	number?: number | null;
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
	};
}

export type { NotionSprintAllocationPage };
