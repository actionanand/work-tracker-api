import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { handleAnalyticsRoutes } from "../src/features/analytics/analytics.routes";
import type { AnalyticsResponse } from "../src/features/analytics/analytics.types";
import { managementEnv, api } from "./helpers/management";
import { createAuthHeaders } from "./helpers/auth";

const path = "/api/analytics";
const range = "?from=2026-01-01&to=2026-01-31";

function sprint(id: string, start = "2026-01-01", end = "2026-01-07", name = id, available = 8) {
	return { id, properties: {
		Sprint: { title: [{ plain_text: name }] }, Active: { checkbox: false },
		"Start Date": { date: { start } }, "End Date": { date: { start: end } },
		"Capacity Days": { formula: { number: 10 } }, "Available Days": { formula: { number: available } },
		"Allocated Days": { rollup: { number: 999 } }, "Remaining Days": { formula: { number: -999 } },
	} };
}

function jira(id: string, sprints: string[], key = id) {
	return { id, created_time: "2026-01-01T00:00:00Z", last_edited_time: "2026-01-01T00:00:00Z", properties: {
		"JIRA Key": { title: [{ plain_text: key }] }, Summary: { rich_text: [{ plain_text: `Summary ${key}` }] },
		Sprints: { relation: sprints.map((id) => ({ id })), has_more: false },
		Spillover: { formula: { boolean: false } }, "Spillover Count": { formula: { number: 999 } },
		Status: { status: { name: "Done" } },
	} };
}

function allocation(id: string, sprintIds: string[], jiraIds: string[], days: number) {
	return { id, properties: {
		Sprint: { relation: sprintIds.map((id) => ({ id })) }, JIRA: { relation: jiraIds.map((id) => ({ id })) },
		"Planned Days": { number: days },
	} };
}

function log(id: string, date: string | null, category: string | null = null, type: string | null = null) {
	return { id, created_time: "2026-01-01T00:00:00Z", last_edited_time: "2026-01-01T00:00:00Z", properties: {
		Date: { date: date ? { start: date } : null }, Category: { select: category ? { name: category } : null },
		Type: { select: type ? { name: type } : null }, "Jira Status": { rollup: { array: [{ status: { name: "Blocked" } }] } },
	} };
}

type FixturePage = ReturnType<typeof sprint> | ReturnType<typeof jira> | ReturnType<typeof allocation> | ReturnType<typeof log>;
interface Filter {
	and?: Filter[];
	or?: Filter[];
	property?: string;
	relation?: { contains: string };
	date?: { on_or_after?: string; on_or_before?: string };
}
interface QueryBody { page_size: number; filter?: Filter; start_cursor?: string }

function matches(page: FixturePage, filter?: Filter): boolean {
	if (!filter) return true;
	if (filter.and) return filter.and.every((item) => matches(page, item));
	if (filter.or) return filter.or.some((item) => matches(page, item));
	const properties = page.properties as Record<string, { relation?: Array<{ id: string }>; date?: { start: string } | null }>;
	const property = properties[filter.property!];
	if (filter.relation) return property?.relation?.some((item) => item.id === filter.relation!.contains) ?? false;
	if (filter.date) {
		const date = property?.date?.start.slice(0, 10);
		return Boolean(date && (!filter.date.on_or_after || date >= filter.date.on_or_after) && (!filter.date.on_or_before || date <= filter.date.on_or_before));
	}
	throw new Error("Unexpected Analytics filter");
}

function fixture() {
	const env = managementEnv();
	const sources = new Map<string, FixturePage[]>([
		[env.SPRINTS_DATA_SOURCE_ID, []], [env.JIRAS_DATA_SOURCE_ID, []],
		[env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID, []], [env.WORK_LOGS_DATA_SOURCE_ID, []],
	]);
	const pageSizes = new Map<string, number>();
	let concurrent = 0; let maxConcurrent = 0;
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
		try {
			await Promise.resolve();
			const match = url.match(/^https:\/\/api.notion.com\/v1\/data_sources\/([^/]+)\/query$/);
			if (!match || init?.method !== "POST") throw new Error("Unexpected Notion request: only collection queries are allowed");
			const pages = sources.get(match[1]);
			if (!pages) throw new Error("Unexpected datasource");
			const body = JSON.parse(String(init.body)) as QueryBody;
			const filtered = pages.filter((page) => matches(page, body.filter));
			const offset = Number(body.start_cursor ?? 0);
			const size = pageSizes.get(match[1]) ?? 100;
			const more = offset + size < filtered.length;
			return Response.json({ results: filtered.slice(offset, offset + size), has_more: more, next_cursor: more ? String(offset + size) : null });
		} finally { concurrent--; }
	});
	vi.stubGlobal("fetch", fetchMock);
	const calls = (source: string) => fetchMock.mock.calls.filter(([url]) => url.includes(`/data_sources/${source}/query`));
	return {
		env, sources, pageSizes, fetchMock, calls, maxConcurrent: () => maxConcurrent,
		sprints: (pages: ReturnType<typeof sprint>[]) => sources.set(env.SPRINTS_DATA_SOURCE_ID, pages),
		jiras: (pages: ReturnType<typeof jira>[]) => sources.set(env.JIRAS_DATA_SOURCE_ID, pages),
		allocations: (pages: ReturnType<typeof allocation>[]) => sources.set(env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID, pages),
		logs: (pages: ReturnType<typeof log>[]) => sources.set(env.WORK_LOGS_DATA_SOURCE_ID, pages),
	};
}

async function result(f: ReturnType<typeof fixture>, query = range): Promise<AnalyticsResponse> {
	const response = await api(f.env, path + query);
	expect(response.status).toBe(200);
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(response.headers.get("Accept-Query")).toBeNull();
	return response.json<AnalyticsResponse>();
}

function historyFixture() {
	const f = fixture();
	f.sprints([sprint("s3", "2026-01-15", "2026-01-21"), sprint("s1"), sprint("s2", "2026-01-08", "2026-01-14")]);
	f.jiras([jira("A", ["s1"]), jira("B", ["s2", "s1"]), jira("C", ["s3", "s1", "s2", "s2"])]);
	return f;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Analytics routing and date validation", () => {
	it("requires global authentication", async () => {
		const f = fixture();
		const response = await worker.fetch(new Request(`http://example.test${path}${range}`), f.env);
		expect(response.status).toBe(401);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(f.fetchMock).not.toHaveBeenCalled();
	});

	it("advertises only GET and OPTIONS without Accept-Query", async () => {
		const f = fixture();
		const response = await api(f.env, path, "OPTIONS");
		expect(response.status).toBe(204);
		expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
		expect(response.headers.get("Accept-Query")).toBeNull();
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(f.fetchMock).not.toHaveBeenCalled();
	});

	it.each(["QUERY", "POST", "PATCH", "DELETE"])("rejects %s without Notion calls", async (method) => {
		const f = fixture(); const response = await api(f.env, path + range, method);
		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(f.fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		["2026-01-01", "2026-01-30"], ["2026-01-01", "2026-03-31"], ["2026-01-01", "2026-06-29"],
		["2025-10-14", "2026-10-14"], ["2024-02-29", "2025-02-28"], ["2024-01-01", "2025-01-04"], ["2026-01-01", "2026-01-01"],
	])("accepts inclusive %s through %s", async (from, to) => {
		const f = fixture(); const body = await result(f, `?from=${from}&to=${to}`);
		expect(body).toMatchObject({ schemaVersion: 1, from, to, spillTrend: null });
		expect(Number.isFinite(Date.parse(body.generatedAt))).toBe(true);
	});

	it.each([
		"", "?to=2026-01-31", "?from=2026-01-01", "?from=&to=2026-01-31",
		"?from=2026-1-01&to=2026-01-31", "?from=2026-02-30&to=2026-03-01", "?from=2026-02-29&to=2026-03-01",
		"?from=2026-01-01&to=invalid", "?from=2026-01-01T00:00:00Z&to=2026-01-31",
		"?from=%202026-01-01&to=2026-01-31", "?from=2026-01-01&from=2026-01-02&to=2026-01-31",
	])("rejects invalid date query %s before Notion", async (query) => {
		const f = fixture(); const response = await api(f.env, path + query);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "ANALYTICS_DATE_INVALID" });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(f.fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		["?from=2026-02-01&to=2026-01-01", "ANALYTICS_RANGE_INVALID"],
		["?from=2024-01-01&to=2025-01-05", "ANALYTICS_RANGE_TOO_LARGE"],
	])("rejects invalid range %s", async (query, code) => {
		const f = fixture(); const response = await api(f.env, path + query);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body).toMatchObject({ code });
		if (code === "ANALYTICS_RANGE_TOO_LARGE") expect(body).toEqual({ error: "Analytics range is too large", code, maxDays: 370 });
		expect(f.fetchMock).not.toHaveBeenCalled();
	});

	it("returns null for unrelated paths", async () => {
		const f = fixture(); const request = new Request("https://example.test/api/analytics/random");
		expect(await handleAnalyticsRoutes(request, new URL(request.url), f.env)).toBeNull();
	});
});

describe("Analytics historical work activity", () => {
	it("paginates bounded logs and groups Monday weeks/categories/types deterministically", async () => {
		const f = fixture();
		f.pageSizes.set(f.env.WORK_LOGS_DATA_SOURCE_ID, 2);
		f.logs([
			log("6", "2026-01-12", "B", "Z"), log("1", "2026-01-04T23:30:00-08:00", "A", "Y"),
			log("2", "2026-01-05T00:30:00+14:00", "B", "Z"), log("3", "2026-01-05", "A", "Y"),
			log("4", "2026-01-11", null, null), log("5", "2026-01-12", "C", "X"),
			log("none", null), log("before", "2025-12-31"), log("after", "2026-02-01"),
		]);
		const body = await result(f);
		expect(body.workActivity).toEqual({ count: 6,
			weeks: [{ weekStart: "2025-12-29", count: 1 }, { weekStart: "2026-01-05", count: 3 }, { weekStart: "2026-01-12", count: 2 }],
			categories: [{ label: "A", count: 2 }, { label: "B", count: 2 }, { label: "C", count: 1 }, { label: "Uncategorized", count: 1 }],
			types: [{ label: "Y", count: 2 }, { label: "Z", count: 2 }, { label: "Unspecified", count: 1 }, { label: "X", count: 1 }],
		});
		const calls = f.calls(f.env.WORK_LOGS_DATA_SOURCE_ID);
		expect(calls).toHaveLength(3);
		for (const [, init] of calls) expect((JSON.parse(String(init?.body)) as QueryBody).filter).toEqual({ and: [
			{ property: "Date", date: { on_or_after: "2026-01-01" } }, { property: "Date", date: { on_or_before: "2026-01-31" } },
		] });
		expect(body.sprints).toEqual([]);
	});

	it("returns a useful empty response and skips JIRA/allocation queries without selected Sprints", async () => {
		const f = fixture(); const body = await result(f);
		expect(body.workActivity).toEqual({ count: 0, weeks: [], categories: [], types: [] });
		expect(body.spillSummary).toEqual({ distinctJiras: 0, jirasWithAnySpill: 0, totalSpillEvents: 0, spillPercentage: 0, averageSpillsPerSpilledJira: 0 });
		expect(body.spillTrend).toBeNull(); expect(body.sprints).toEqual([]); expect(body.topSpilledJiras).toEqual([]);
		expect(f.calls(f.env.JIRAS_DATA_SOURCE_ID)).toHaveLength(0);
		expect(f.calls(f.env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)).toHaveLength(0);
	});
});

describe("Analytics full-history spill semantics", () => {
	it("derives membership, transitions, summaries and an improving trend from complete histories", async () => {
		const f = historyFixture(); const body = await result(f);
		expect(body.sprints.map(({ id, jiraCount, incomingSpillJiras, outgoingSpillJiras }) => ({ id, jiraCount, incomingSpillJiras, outgoingSpillJiras }))).toEqual([
			{ id: "s1", jiraCount: 3, incomingSpillJiras: 0, outgoingSpillJiras: 2 },
			{ id: "s2", jiraCount: 2, incomingSpillJiras: 2, outgoingSpillJiras: 1 },
			{ id: "s3", jiraCount: 1, incomingSpillJiras: 1, outgoingSpillJiras: 0 },
		]);
		expect(body.sprints.map((sprint) => sprint.outgoingSpillRate)).toEqual([2 / 3 * 100, 50, 0]);
		expect(body.spillSummary).toEqual({ distinctJiras: 3, jirasWithAnySpill: 2, totalSpillEvents: 3, spillPercentage: 2 / 3 * 100, averageSpillsPerSpilledJira: 1.5 });
		expect(body.spillTrend).toEqual({ firstSprintRate: 2 / 3 * 100, latestSprintRate: 0, changePercentagePoints: -(2 / 3 * 100), direction: "improving" });
		expect(body.topSpilledJiras).toEqual([
			{ id: "C", jiraKey: "C", summary: "Summary C", fullHistorySpillCount: 2, selectedRangeOutgoingSpillCount: 2 },
			{ id: "B", jiraKey: "B", summary: "Summary B", fullHistorySpillCount: 1, selectedRangeOutgoingSpillCount: 1 },
		]);
	});

	it("uses history before and after the requested interval for the middle Sprint", async () => {
		const f = historyFixture(); f.jiras([jira("C", ["s3", "s1", "s2"])]);
		const body = await result(f, "?from=2026-01-08&to=2026-01-14");
		expect(body.sprints).toHaveLength(1);
		expect(body.sprints[0]).toMatchObject({ id: "s2", jiraCount: 1, incomingSpillJiras: 1, outgoingSpillJiras: 1, outgoingSpillRate: 100 });
		expect(body.spillSummary).toEqual({ distinctJiras: 1, jirasWithAnySpill: 1, totalSpillEvents: 1, spillPercentage: 100, averageSpillsPerSpilledJira: 1 });
		expect(body.topSpilledJiras[0]).toMatchObject({ fullHistorySpillCount: 2, selectedRangeOutgoingSpillCount: 1 });
		expect(body.spillTrend).toBeNull();
	});

	it("does not count an incoming-only transition as a selected-period spill", async () => {
		const f = historyFixture(); const body = await result(f, "?from=2026-01-15&to=2026-01-21");
		expect(body.sprints[0]).toMatchObject({ incomingSpillJiras: 1, outgoingSpillJiras: 0 });
		expect(body.spillSummary).toEqual({ distinctJiras: 1, jirasWithAnySpill: 0, totalSpillEvents: 0, spillPercentage: 0, averageSpillsPerSpilledJira: 0 });
		expect(body.topSpilledJiras[0]).toMatchObject({ fullHistorySpillCount: 2, selectedRangeOutgoingSpillCount: 0 });
	});

	it.each(["worsening", "unchanged"])("calculates a %s trend and ignores empty Sprint anchors", async (direction) => {
		const f = fixture();
		f.sprints([sprint("empty-first", "2025-12-30", "2026-01-01"), sprint("one"), sprint("two", "2026-01-08", "2026-01-14"), sprint("empty-last", "2026-01-25", "2026-01-31"), sprint("outside", "2026-02-01", "2026-02-07")]);
		f.jiras([jira("A", ["one"]), jira("B", direction === "worsening" ? ["two", "outside"] : ["two"])]);
		const body = await result(f);
		expect(body.spillTrend).toEqual({ firstSprintRate: 0, latestSprintRate: direction === "worsening" ? 100 : 0, changePercentagePoints: direction === "worsening" ? 100 : 0, direction });
	});

	it("returns a null trend for selected Sprints with no JIRAs", async () => {
		const f = fixture(); f.sprints([sprint("one"), sprint("two")]);
		const body = await result(f); expect(body.spillTrend).toBeNull();
		expect(body.sprints.map((sprint) => sprint.outgoingSpillRate)).toEqual([0, 0]);
	});

	it("selects inclusive overlaps and orders by start, end, name, then ID", async () => {
		const f = fixture();
		f.sprints([
			sprint("z", "2026-01-10", "2026-01-20", "Beta"), sprint("b", "2026-01-10", "2026-01-20", " Alpha "),
			sprint("a", "2026-01-10", "2026-01-20", "Alpha"), sprint("short", "2026-01-10", "2026-01-19", "Zed"),
			sprint("left", "2025-12-25", "2026-01-01"), sprint("right", "2026-01-31", "2026-02-05"),
			sprint("before", "2025-12-01", "2025-12-31"), sprint("after", "2026-02-01", "2026-02-07"),
		]);
		expect((await result(f)).sprints.map((sprint) => sprint.id)).toEqual(["left", "short", "a", "b", "z", "right"]);
	});

	it("ranks at most 10 relevant spilled JIRAs with deterministic tie-breakers", async () => {
		const f = fixture();
		f.sprints([sprint("prior", "2025-12-01", "2025-12-07"), sprint("selected"), sprint("later", "2026-02-01", "2026-02-07")]);
		const many = Array.from({ length: 12 }, (_, index) => jira(`id-${String(index).padStart(2, "0")}`, ["prior", "selected"], "SAME-1"));
		f.jiras([jira("zero", ["selected"]), jira("unrelated", ["prior", "later"]), ...many.reverse(), jira("high", ["prior", "selected", "later"], "Z-1"), jira("outgoing", ["selected", "later"], "Z-2")]);
		const top = (await result(f)).topSpilledJiras;
		expect(top).toHaveLength(10);
		expect(top.map((jira) => jira.id)).toEqual(["high", "outgoing", ...Array.from({ length: 8 }, (_, index) => `id-${String(index).padStart(2, "0")}`)]);
		expect(top[0]).toMatchObject({ fullHistorySpillCount: 2, selectedRangeOutgoingSpillCount: 1 });
	});

	it("breaks equal spill counts by JIRA key before page ID", async () => {
		const f = fixture();
		f.sprints([sprint("selected"), sprint("later", "2026-02-01", "2026-02-07")]);
		f.jiras([jira("a", ["selected", "later"], "Z-1"), jira("z", ["selected", "later"], "A-1")]);
		expect((await result(f)).topSpilledJiras.map((jira) => jira.id)).toEqual(["z", "a"]);
	});
});

describe("Analytics capacity and allocation quality", () => {
	it("uses allocation values, excludes conflicting pairs, and does not derive membership from allocations", async () => {
		const f = fixture(); f.sprints([sprint("s1")]);
		f.jiras([jira("conflict", ["s1"]), jira("missing", ["s1"]), jira("valid", ["s1"])]);
		f.allocations([
			allocation("duplicate-a", ["s1"], ["conflict"], 5), allocation("duplicate-b", ["s1"], ["conflict"], 7),
			allocation("valid", ["s1"], ["valid"], 10.25), allocation("valid", ["s1"], ["valid"], 10.25),
			allocation("orphan", ["s1"], [], 100),
		]);
		const body = await result(f);
		expect(body.sprints[0]).toMatchObject({ jiraCount: 3, capacityDays: 10, availableDays: 8, plannedDays: 10.25, remainingPlannedDays: -2.25, utilizationPercent: 128.125, allocationConflictPairs: 1 });
	});

	it.each([0, 2.25])("handles zero availability with %s planned days", async (days) => {
		const f = fixture(); f.sprints([sprint("s1", "2026-01-01", "2026-01-07", "Zero", 0)]);
		f.allocations([allocation("a", ["s1"], ["allocation-only"], days)]);
		const row = (await result(f)).sprints[0];
		expect(row).toMatchObject({ jiraCount: 0, plannedDays: days, remainingPlannedDays: days === 0 ? 0 : -days, utilizationPercent: days === 0 ? 0 : 100 });
	});

	it("preserves arbitrary decimal precision and treats missing allocations as zero", async () => {
		const f = fixture(); f.sprints([sprint("s1")]); f.jiras([jira("missing", ["s1"])]);
		expect((await result(f)).sprints[0]).toMatchObject({ plannedDays: 0, allocationConflictPairs: 0, remainingPlannedDays: 8 });
		f.allocations([allocation("fraction", ["s1"], ["missing"], 0.123456789)]);
		expect((await result(f)).sprints[0].plannedDays).toBe(0.123456789);
	});
});

describe("Analytics collection query strategy and safety", () => {
	it("loads one paginated Sprint catalog and all collection pages without item GETs or writes", async () => {
		const f = historyFixture();
		f.allocations([allocation("a", ["s1"], ["A"], 1), allocation("b", ["s2"], ["B"], 2)]);
		f.logs([log("l1", "2026-01-01"), log("l2", "2026-01-02")]);
		for (const source of f.sources.keys()) f.pageSizes.set(source, 1);
		const directEnv = { ...f.env, AUTH_DB: { prepare() { throw new Error("Analytics must not use D1"); } } as unknown as D1Database };
		const request = new Request(`https://example.test${path}${range}`);
		const response = await handleAnalyticsRoutes(request, new URL(request.url), directEnv);
		expect(response?.status).toBe(200);
		expect((await response!.json<AnalyticsResponse>()).workActivity.count).toBe(2);
		expect(f.calls(f.env.SPRINTS_DATA_SOURCE_ID)).toHaveLength(3);
		expect(f.calls(f.env.JIRAS_DATA_SOURCE_ID)).toHaveLength(3);
		expect(f.calls(f.env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)).toHaveLength(2);
		expect(f.calls(f.env.WORK_LOGS_DATA_SOURCE_ID)).toHaveLength(2);
		for (const [url, init] of f.fetchMock.mock.calls) {
			expect(url).toMatch(/\/data_sources\/[^/]+\/query$/);
			expect(init?.method).toBe("POST");
		}
		expect(f.maxConcurrent()).toBe(1);
	});

	it("chunks more than 20 Sprint IDs, paginates chunks and deduplicates overlapping query hits", async () => {
		const f = fixture();
		const sprints = Array.from({ length: 21 }, (_, index) => sprint(`s${index}`, `2026-01-${String(index + 1).padStart(2, "0")}`, `2026-01-${String(index + 1).padStart(2, "0")}`));
		f.sprints(sprints);
		f.jiras([jira("shared", ["s0", "s20"]), jira("first", ["s0"]), jira("last", ["s20"])]);
		f.allocations([allocation("shared", ["s0", "s20"], ["shared"], 1.25), allocation("first", ["s0"], ["first"], 2), allocation("last", ["s20"], ["last"], 3)]);
		f.pageSizes.set(f.env.JIRAS_DATA_SOURCE_ID, 1); f.pageSizes.set(f.env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID, 1);
		const body = await result(f);
		expect(body.spillSummary.distinctJiras).toBe(3);
		expect(body.spillSummary.totalSpillEvents).toBe(1);
		expect(body.sprints[0]).toMatchObject({ plannedDays: 3.25, allocationConflictPairs: 0, jiraCount: 2 });
		expect(body.sprints[20]).toMatchObject({ plannedDays: 4.25, allocationConflictPairs: 0, jiraCount: 2 });
		for (const source of [f.env.JIRAS_DATA_SOURCE_ID, f.env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID]) {
			const bodies = f.calls(source).map(([, init]) => JSON.parse(String(init?.body)) as QueryBody);
			expect(bodies).toHaveLength(4);
			expect(bodies.filter((body) => !body.start_cursor).map((body) => body.filter?.or?.length ?? 1)).toEqual([20, 1]);
			expect(bodies[0].filter?.or?.map((filter) => filter.relation?.contains)).toEqual(sprints.slice(0, 20).map((sprint) => sprint.id));
		}
		expect(f.calls(f.env.SPRINTS_DATA_SOURCE_ID)).toHaveLength(1);
		expect(f.fetchMock).toHaveBeenCalledTimes(10);
		expect(f.maxConcurrent()).toBe(1);
	});

	it("does not add D1 writes to an authenticated Analytics read", async () => {
		const f = fixture(); const headers = await createAuthHeaders(f.env);
		f.env.AUTH_DB.operations.length = 0;
		const response = await worker.fetch(new Request(`https://example.test${path}${range}`, { headers }), f.env);
		expect(response.status).toBe(200);
		expect(f.env.AUTH_DB.operations.every((sql) => /^\s*SELECT/i.test(sql))).toBe(true);
	});

	it("returns safe uncached 502 errors without logging upstream contents", async () => {
		const f = fixture(); f.fetchMock.mockResolvedValueOnce(Response.json({ secret: f.env.NOTION_TOKEN, details: "private Notion response" }, { status: 500 }));
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await api(f.env, path + range);
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ error: "Analytics data is temporarily unavailable", code: "ANALYTICS_UPSTREAM_ERROR" });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(error.mock.calls).toEqual([["ANALYTICS_UPSTREAM_ERROR"]]);
	});

	it("does not silently produce a shortened history when Notion marks a Sprint relation incomplete", async () => {
		const f = historyFixture(); const page = jira("truncated", ["s1"]); page.properties.Sprints.has_more = true; f.jiras([page]);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await api(f.env, path + range);
		expect(response.status).toBe(502);
		expect((await response.json<{ code: string }>()).code).toBe("ANALYTICS_UPSTREAM_ERROR");
		expect(f.fetchMock.mock.calls.every(([url]) => url.includes("/data_sources/"))).toBe(true);
	});
});
