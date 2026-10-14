import type { Jira } from "../jiras/jira.mapper";
import type { SprintAllocation } from "../sprint-allocations/sprint-allocation.mapper";
import type { Sprint } from "../sprints/sprint.mapper";
import type { WorkLog } from "../work-logs/work-log.mapper";
import { sortSprintRefs } from "../../shared/relations/relation-enrichment";
import type { SprintRef } from "../../shared/relations/relation-types";
import type { AnalyticsCount, AnalyticsRange, AnalyticsResponse, AnalyticsSprint, SpillTrend, TopSpilledJira, WorkActivity } from "./analytics.types";
import { DAY_MS } from "./analytics.validation";

export function orderedSprints(sprints: Sprint[]): Sprint[] {
	const catalog = new Map(sprints.map((sprint) => [sprint.id, sprint]));
	return sortSprintRefs(sprints.map((sprint): SprintRef => ({
		id: sprint.id, name: sprint.sprint.trim(), startDate: sprint.startDate, endDate: sprint.endDate, active: sprint.active,
	}))).map((ref) => catalog.get(ref.id)!);
}

export function selectedSprints(sprints: Sprint[], range: AnalyticsRange): Sprint[] {
	return sprints.filter((sprint) => sprint.startDate && sprint.endDate && sprint.endDate.slice(0, 10) >= range.from && sprint.startDate.slice(0, 10) <= range.to);
}

function increment(counts: Map<string, number>, key: string) {
	counts.set(key, (counts.get(key) ?? 0) + 1);
}

function labels(counts: Map<string, number>): AnalyticsCount[] {
	return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function workActivity(logs: WorkLog[], range: AnalyticsRange): WorkActivity {
	const weeks = new Map<string, number>();
	const categories = new Map<string, number>();
	const types = new Map<string, number>();
	let count = 0;
	for (const log of logs) {
		const date = log.date?.slice(0, 10);
		if (!date || date < range.from || date > range.to) continue;
		const instant = Date.parse(`${date}T00:00:00Z`);
		if (!Number.isFinite(instant)) continue;
		const daysSinceMonday = (new Date(instant).getUTCDay() + 6) % 7;
		const week = new Date(instant - daysSinceMonday * DAY_MS).toISOString().slice(0, 10);
		increment(weeks, week);
		increment(categories, log.category || "Uncategorized");
		increment(types, log.type || "Unspecified");
		count++;
	}
	return {
		count, weeks: [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, count]) => ({ weekStart, count })),
		categories: labels(categories), types: labels(types),
	};
}

function spillTrend(sprints: AnalyticsSprint[]): SpillTrend | null {
	const qualifying = sprints.filter((sprint) => sprint.jiraCount > 0);
	if (qualifying.length < 2) return null;
	const firstSprintRate = qualifying[0].outgoingSpillRate;
	const latestSprintRate = qualifying[qualifying.length - 1].outgoingSpillRate;
	const changePercentagePoints = latestSprintRate - firstSprintRate;
	return { firstSprintRate, latestSprintRate, changePercentagePoints, direction: changePercentagePoints < 0 ? "improving" : changePercentagePoints > 0 ? "worsening" : "unchanged" };
}

export function aggregateAnalytics(range: AnalyticsRange, catalog: Sprint[], jiras: Jira[], allocations: SprintAllocation[], logs: WorkLog[]): AnalyticsResponse {
	const ordered = orderedSprints(catalog);
	const selected = selectedSprints(ordered, range);
	const bySprint = new Map(selected.map((sprint): [string, AnalyticsSprint] => [sprint.id, {
		id: sprint.id, sprint: sprint.sprint, startDate: sprint.startDate, endDate: sprint.endDate, active: sprint.active,
		jiraCount: 0, incomingSpillJiras: 0, outgoingSpillJiras: 0, outgoingSpillRate: 0,
		capacityDays: sprint.capacityDays, availableDays: sprint.availableDays,
		plannedDays: 0, remainingPlannedDays: sprint.availableDays, utilizationPercent: 0, allocationConflictPairs: 0,
	}]));
	let distinctJiras = 0;
	let jirasWithAnySpill = 0;
	let totalSpillEvents = 0;
	const top: TopSpilledJira[] = [];
	for (const jira of new Map(jiras.map((jira) => [jira.id, jira])).values()) {
		const membership = new Set(jira.sprintIds);
		const history = ordered.filter((sprint) => membership.has(sprint.id));
		if (!history.some((sprint) => bySprint.has(sprint.id))) continue;
		distinctJiras++;
		let outgoing = 0;
		for (let index = 0; index < history.length; index++) {
			const sprint = bySprint.get(history[index].id);
			if (!sprint) continue;
			sprint.jiraCount++;
			if (index > 0) sprint.incomingSpillJiras++;
			if (index < history.length - 1) { sprint.outgoingSpillJiras++; outgoing++; }
		}
		totalSpillEvents += outgoing;
		if (outgoing > 0) jirasWithAnySpill++;
		if (history.length > 1) top.push({ id: jira.id, jiraKey: jira.jiraKey, summary: jira.summary, fullHistorySpillCount: history.length - 1, selectedRangeOutgoingSpillCount: outgoing });
	}

	// Count distinct allocation pages per pair; repeated query hits are not duplicates.
	const pairs = new Map<string, Map<string, SprintAllocation[]>>();
	for (const allocation of new Map(allocations.map((allocation) => [allocation.id, allocation])).values()) {
		for (const sprintId of new Set(allocation.sprintIds)) {
			if (!bySprint.has(sprintId)) continue;
			const jiras = pairs.get(sprintId) ?? new Map<string, SprintAllocation[]>();
			for (const jiraId of new Set(allocation.jiraIds)) {
				const rows = jiras.get(jiraId) ?? [];
				rows.push(allocation); jiras.set(jiraId, rows);
			}
			pairs.set(sprintId, jiras);
		}
	}
	for (const sprint of bySprint.values()) {
		for (const rows of pairs.get(sprint.id)?.values() ?? []) {
			if (rows.length > 1) sprint.allocationConflictPairs++;
			else sprint.plannedDays += rows[0].plannedDays;
		}
		sprint.outgoingSpillRate = sprint.jiraCount ? sprint.outgoingSpillJiras / sprint.jiraCount * 100 : 0;
		sprint.remainingPlannedDays = sprint.availableDays - sprint.plannedDays;
		sprint.utilizationPercent = sprint.availableDays > 0 ? sprint.plannedDays / sprint.availableDays * 100 : sprint.plannedDays === 0 ? 0 : 100;
	}
	const sprints = [...bySprint.values()];
	return {
		schemaVersion: 1, generatedAt: new Date(Date.now()).toISOString(), ...range,
		workActivity: workActivity(logs, range),
		spillSummary: { distinctJiras, jirasWithAnySpill, totalSpillEvents,
			spillPercentage: distinctJiras ? jirasWithAnySpill / distinctJiras * 100 : 0,
			averageSpillsPerSpilledJira: jirasWithAnySpill ? totalSpillEvents / jirasWithAnySpill : 0 },
		spillTrend: spillTrend(sprints), sprints,
		topSpilledJiras: top.sort((a, b) => b.fullHistorySpillCount - a.fullHistorySpillCount || b.selectedRangeOutgoingSpillCount - a.selectedRangeOutgoingSpillCount || a.jiraKey.localeCompare(b.jiraKey) || a.id.localeCompare(b.id)).slice(0, 10),
	};
}
