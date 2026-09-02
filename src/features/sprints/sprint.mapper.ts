interface NotionTextItem {
	plain_text?: string;
}

interface NotionRelationItem {
	id: string;
}

interface NotionNumberRollup {
	type?: string;
	number?: number | null;
	array?: Array<{
		type?: string;
		number?: number | null;
		formula?: {
			type?: string;
			number?: number | null;
		};
	}>;
}

interface NotionSprintProperty {
	title?: NotionTextItem[];
	select?: {
		name?: string;
	} | null;
	checkbox?: boolean;
	number?: number | null;
	formula?: {
		type?: string;
		number?: number | null;
	};
	date?: {
		start?: string | null;
		end?: string | null;
	} | null;
	relation?: NotionRelationItem[];
	rollup?: NotionNumberRollup | null;
}

interface NotionSprintPage {
	id: string;
	properties: Record<string, NotionSprintProperty | undefined>;
}

export interface Sprint {
	id: string;
	sprint: string;
	active: boolean;
	startDate: string | null;
	endDate: string | null;
	weekOff1: string | null;
	weekOff2: string | null;
	plannedLeaveDays: number;
	holidayDays: number;
	capacityDays: number;
	availableDays: number;
	allocatedDays: number;
	remainingDays: number;
	projectIds: string[];
	allocationIds: string[];
}

function plainText(items: NotionTextItem[] = []): string {
	return items.map((item) => item.plain_text ?? "").join("");
}

function relationIds(property: NotionSprintProperty | undefined): string[] {
	return (property?.relation ?? []).map((item) => item.id);
}

function formulaNumber(property: NotionSprintProperty | undefined): number {
	return property?.formula?.number ?? 0;
}

function rollupNumber(property: NotionSprintProperty | undefined): number {
	const rollup = property?.rollup;

	if (!rollup) {
		return 0;
	}

	if (typeof rollup.number === "number") {
		return rollup.number;
	}

	if (Array.isArray(rollup.array)) {
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

	return 0;
}

export function mapSprint(page: NotionSprintPage): Sprint {
	const p = page.properties;

	return {
		id: page.id,
		sprint: plainText(p.Sprint?.title),
		active: p.Active?.checkbox ?? false,
		startDate: p["Start Date"]?.date?.start ?? null,
		endDate: p["End Date"]?.date?.start ?? null,
		weekOff1: p["Week Off 1"]?.select?.name ?? null,
		weekOff2: p["Week Off 2"]?.select?.name ?? null,
		plannedLeaveDays: p["Planned Leave Days"]?.number ?? 0,
		holidayDays: p["Holiday Days"]?.number ?? 0,
		capacityDays: formulaNumber(p["Capacity Days"]),
		availableDays: formulaNumber(p["Available Days"]),
		allocatedDays: rollupNumber(p["Allocated Days"]),
		remainingDays: formulaNumber(p["Remaining Days"]),
		projectIds: relationIds(p.Project),
		allocationIds: relationIds(p.Allocations),
	};
}

export type { NotionSprintPage };
