import type {
	EnrichedJira,
	EnrichedReleaseItem,
	EnrichedSprint,
	EnrichedWorkLink,
	EnrichedWorkLog,
} from "../../shared/relations/relation-enrichment";
import type { CompanyRef, ProjectRef } from "../../shared/relations/relation-types";

export interface DashboardSummary {
	active: number;
	blocked: number;
	spillovers: number;
	demoPending: number;
}

export interface ReleaseSummary {
	pending: number;
	confirmed: number;
	notAnnounced: number;
}

export interface FeedbackSummary {
	appraisal: number;
	improvementFollowUp: number;
	negative: number;
}

export interface DashboardResponse {
	generatedAt: string;
	company: CompanyRef | null;
	project: ProjectRef | null;
	currentSprint: EnrichedSprint | null;
	jiraSummary: DashboardSummary;
	activeJiras: EnrichedJira[];
	blockedJiras: EnrichedJira[];
	spilloverJiras: EnrichedJira[];
	demoPendingJiras: EnrichedJira[];
	recentWorkLogs: EnrichedWorkLog[];
	releaseSummary: ReleaseSummary;
	pendingReleases: EnrichedReleaseItem[];
	feedbackSummary: FeedbackSummary;
	activeWorkLinks: EnrichedWorkLink[];
}
