export interface AnalyticsRange {
	from: string;
	to: string;
}

export interface AnalyticsCount {
	label: string;
	count: number;
}

export interface WorkActivity {
	count: number;
	weeks: Array<{ weekStart: string; count: number }>;
	categories: AnalyticsCount[];
	types: AnalyticsCount[];
}

export interface AnalyticsSprint {
	id: string;
	sprint: string;
	startDate: string | null;
	endDate: string | null;
	active: boolean;
	jiraCount: number;
	incomingSpillJiras: number;
	outgoingSpillJiras: number;
	outgoingSpillRate: number;
	capacityDays: number;
	availableDays: number;
	plannedDays: number;
	remainingPlannedDays: number;
	utilizationPercent: number;
	allocationConflictPairs: number;
}

export interface SpillSummary {
	distinctJiras: number;
	jirasWithAnySpill: number;
	totalSpillEvents: number;
	spillPercentage: number;
	averageSpillsPerSpilledJira: number;
}

export interface SpillTrend {
	firstSprintRate: number;
	latestSprintRate: number;
	changePercentagePoints: number;
	direction: "improving" | "worsening" | "unchanged";
}

export interface TopSpilledJira {
	id: string;
	jiraKey: string;
	summary: string;
	fullHistorySpillCount: number;
	selectedRangeOutgoingSpillCount: number;
}

export interface AnalyticsResponse extends AnalyticsRange {
	schemaVersion: 1;
	generatedAt: string;
	workActivity: WorkActivity;
	spillSummary: SpillSummary;
	spillTrend: SpillTrend | null;
	sprints: AnalyticsSprint[];
	topSpilledJiras: TopSpilledJira[];
}
