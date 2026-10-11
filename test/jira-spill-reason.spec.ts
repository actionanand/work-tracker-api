import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/shared/env";
import { buildSprintHistory, deriveSpillEvents } from "../src/features/jiras/jira.history";
import {
	createAuthHeaders,
	createTestAuthDb,
	createTestRateLimiter,
	TEST_AUTH_JWT_SECRET,
	TEST_AUTH_MAX_SESSION_SECONDS,
	TEST_AUTH_PASSWORD_HASH,
	TEST_AUTH_PASSWORD_ITERATIONS,
	TEST_AUTH_PASSWORD_SALT,
	TEST_AUTH_RENEW_WINDOW_SECONDS,
	TEST_AUTH_TOKEN_TTL_SECONDS,
} from "./helpers/auth";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const testEnv: Env = {
	NOTION_TOKEN: "test-notion-token",
	AUTH_PASSWORD_HASH: TEST_AUTH_PASSWORD_HASH,
	AUTH_PASSWORD_SALT: TEST_AUTH_PASSWORD_SALT,
	AUTH_PASSWORD_ITERATIONS: TEST_AUTH_PASSWORD_ITERATIONS,
	AUTH_JWT_SECRET: TEST_AUTH_JWT_SECRET,
	AUTH_TOKEN_TTL_SECONDS: TEST_AUTH_TOKEN_TTL_SECONDS,
	AUTH_RENEW_WINDOW_SECONDS: TEST_AUTH_RENEW_WINDOW_SECONDS,
	AUTH_MAX_SESSION_SECONDS: TEST_AUTH_MAX_SESSION_SECONDS,
	AUTH_RATE_LIMITER: createTestRateLimiter(),
	AUTH_DB: createTestAuthDb(),
	JIRAS_DATA_SOURCE_ID: "test-jiras-data-source-id",
	SPRINTS_DATA_SOURCE_ID: "test-sprints-data-source-id",
	SPRINT_ALLOCATIONS_DATA_SOURCE_ID: "test-sprint-allocations-data-source-id",
	PROJECTS_DATA_SOURCE_ID: "test-projects-data-source-id",
	COMPANIES_DATA_SOURCE_ID: "test-companies-data-source-id",
	TEAMS_DATA_SOURCE_ID: "test-teams-data-source-id",
	WORK_LOGS_DATA_SOURCE_ID: "test-work-logs-data-source-id",
	RELEASE_ITEMS_DATA_SOURCE_ID: "test-release-items-data-source-id",
	FEEDBACK_DATA_SOURCE_ID: "test-feedback-data-source-id",
	WORK_LINKS_DATA_SOURCE_ID: "test-work-links-data-source-id",
	TODOS_DATA_SOURCE_ID: "test-todos-data-source-id",
	TASKS_DATA_SOURCE_ID: "test-tasks-data-source-id",
	MEMOS_DATA_SOURCE_ID: "test-memos-data-source-id",
	REFERENCE_LIBRARY_DATA_SOURCE_ID: "test-reference-library-data-source-id",
};

async function fetchWorker(path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(await createAuthHeaders(testEnv));
	for (const [key, value] of new Headers(init.headers)) headers.set(key, value);
	const request = new IncomingRequest(`http://example.com${path}`, {
		method: init.method,
		body: init.body,
		headers,
	});
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

function patch(body: unknown): RequestInit {
	return { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

const jiraId = "11111111-1111-1111-1111-111111111111";
const sprint5Id = "55555555-5555-5555-5555-555555555555";
const sprint6Id = "66666666-6666-6666-6666-666666666666";
const sprint7Id = "77777777-7777-7777-7777-777777777777";
const sprint1Id = "01010101-0101-0101-0101-010101010101";

type SpillFixtureOptions = {
	allocationDataSourceId?: string;
	allocations?: unknown[];
	sprints?: unknown[];
};

function notionResponse(results: unknown[]) {
	return Response.json({ results, has_more: false, next_cursor: null });
}

function notionSprintPage(id: string, sprint: string, startDate: string) {
	return {
		id,
		properties: {
			Sprint: { title: [{ plain_text: sprint }] },
			Active: { checkbox: false },
			"Start Date": { date: { start: startDate } },
			"End Date": { date: null },
			Project: { relation: [] },
		},
	};
}

function notionAllocationPage(
	id: string,
	sprintId: string,
	spillReason: string,
	options: { parentDataSourceId?: string } = {},
) {
	return {
		id,
		parent: {
			data_source_id:
				options.parentDataSourceId ?? testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID,
		},
		properties: {
			Allocation: { title: [{ plain_text: `Allocation ${id}` }] },
			Sprint: { relation: [{ id: sprintId }] },
			JIRA: { relation: [{ id: jiraId }] },
			"Planned Days": { number: 1 },
			Notes: { rich_text: [] },
			"Spill Reason": {
				rich_text: spillReason ? [{ plain_text: spillReason }] : [],
			},
			Spilled: { formula: { boolean: true } },
			"Sprint Active": { rollup: { array: [] } },
		},
	};
}

function createSpillFixture(options: SpillFixtureOptions = {}) {
	const updatedReasons = new Map<string, string>();
	const jiraPage = {
		id: jiraId,
		created_time: "2026-08-19T00:00:00.000Z",
		last_edited_time: "2026-09-30T00:00:00.000Z",
		properties: {
			"JIRA Key": { title: [{ plain_text: "LSC-84944" }] },
			Summary: { rich_text: [{ plain_text: "Spill test JIRA" }] },
			Status: { status: { name: "In progress" } },
			Tags: { multi_select: [] },
			Appraisal: { checkbox: false },
			Spillover: { formula: { boolean: true } },
			"Spillover Count": { formula: { number: 3 } },
			Description: { rich_text: [] },
			"First Sprint Start": { formula: { date: { start: "2026-08-19" } } },
			"In Active Sprint": { formula: { boolean: false } },
			"Demo Required": { checkbox: false },
			"Demoed Date": { date: null },
			"Demo Notes": { rich_text: [] },
			// Deliberately non-chronological: the service must derive the receiving sprint.
			Sprints: {
				relation: [
					{ id: sprint7Id },
					{ id: sprint5Id },
					{ id: sprint1Id },
					{ id: sprint6Id },
				],
			},
			Project: { relation: [] },
			"Linked JIRA": { relation: [] },
			"Linked From": { relation: [] },
			"Link Type": { select: null },
			"Link Reason": { rich_text: [] },
			"Linked On": { date: null },
			"Resolved On": { date: null },
			"Release Items": { relation: [] },
		},
	};
	const allocations =
		options.allocations ??
		[
			notionAllocationPage("allocation-sprint-5", sprint5Id, ""),
			notionAllocationPage("allocation-sprint-6", sprint6Id, "Original first reason"),
			notionAllocationPage("allocation-sprint-7", sprint7Id, "Original second reason"),
			notionAllocationPage("allocation-sprint-1", sprint1Id, "Original third reason"),
		];
	const sprints =
		options.sprints ??
		[
			notionSprintPage(sprint7Id, "Sprint 26.3 - Sprint 7", "2026-09-16"),
			notionSprintPage(sprint5Id, "Sprint 26.3 - Sprint 5", "2026-08-19"),
			notionSprintPage(sprint1Id, "Sprint 26.4 - Sprint 1", "2026-09-30"),
			notionSprintPage(sprint6Id, "Sprint 26.3 - Sprint 6", "2026-09-02"),
		];

	function withUpdatedReason(page: any) {
		const updatedReason = updatedReasons.get(page.id);
		if (updatedReason === undefined) return page;
		return {
			...page,
			properties: {
				...page.properties,
				"Spill Reason": {
					rich_text: updatedReason ? [{ plain_text: updatedReason }] : [],
				},
			},
		};
	}

	const fetchMock = vi.fn((url: string, init?: RequestInit) => {
		const method = init?.method ?? "GET";
		const allocation = allocations.find(
			(page: any) => url === `https://api.notion.com/v1/pages/${page.id}`,
		) as any;

		if (allocation && method === "GET") {
			return Promise.resolve(
				Response.json({
					...withUpdatedReason(allocation),
					parent: {
						data_source_id:
							options.allocationDataSourceId ??
							testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID,
					},
				}),
			);
		}

		if (allocation && method === "PATCH") {
			const properties = JSON.parse(String(init?.body)).properties as {
				"Spill Reason": { rich_text: Array<{ text: { content: string } }> };
			};
			updatedReasons.set(
				allocation.id,
				properties["Spill Reason"].rich_text.map((fragment) => fragment.text.content).join(""),
			);
			return Promise.resolve(Response.json(withUpdatedReason(allocation)));
		}

		if (!url.includes("/query")) {
			return Promise.resolve(Response.json({ error: "Unexpected Notion request" }, { status: 500 }));
		}

		if (url.includes(testEnv.JIRAS_DATA_SOURCE_ID)) {
			return Promise.resolve(notionResponse([jiraPage]));
		}

		if (url.includes(testEnv.SPRINTS_DATA_SOURCE_ID)) {
			return Promise.resolve(notionResponse(sprints));
		}

		if (url.includes(testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)) {
			return Promise.resolve(notionResponse(allocations.map(withUpdatedReason)));
		}

		return Promise.resolve(notionResponse([]));
	});

	vi.stubGlobal("fetch", fetchMock);
	return { fetchMock, updatedReasons };
}

function allocationPatchCalls(fetchMock: ReturnType<typeof vi.fn>) {
	return fetchMock.mock.calls.filter(
		([url, init]) =>
			String(url).includes("/v1/pages/") && (init as RequestInit | undefined)?.method === "PATCH",
	);
}

describe("JIRA spill reason route", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each(["0", "-1", "1.5", "1e0", "+1", "abc"])(
		"rejects invalid spill number %s before Notion", async (spillNumber) => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const response = await fetchWorker(
				`/api/jiras/LSC-84944/spills/${spillNumber}/reason`,
				patch({ reasonMarkdown: "Blocked" }),
			);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "Invalid request", field: "spillNumber", message: "Expected a positive integer spill number" });
			expect(fetchMock).not.toHaveBeenCalled();
		},
	);

	it.each([{}, { reasonMarkdown: 123 }, { reasonMarkdown: "x", allocationId: "x" }, { reasonMarkdown: "x", unexpected: true }])(
		"rejects invalid body before Notion mutation", async (body) => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const response = await fetchWorker("/api/jiras/LSC-84944/spills/1/reason", patch(body));
			expect(response.status).toBe(400);
			expect(fetchMock).not.toHaveBeenCalled();
		},
	);

	it("advertises PATCH only for spill reason OPTIONS", async () => {
		const response = await fetchWorker("/api/jiras/LSC-84944/spills/1/reason", { method: "OPTIONS" });
		expect(response.status).toBe(204);
		expect(response.headers.get("Allow")).toBe("PATCH, OPTIONS");
		expect(response.headers.get("Accept-Query")).toBeNull();
	});

	it("leaves unknown deep JIRA paths as normal 404s", async () => {
		const response = await fetchWorker("/api/jiras/LSC-84944/spills/1/random");
		expect(response.status).toBe(404);
	});

	it("maps spills to receiving allocations after chronological Sprint sorting", () => {
		const history = buildSprintHistory(
			[
				{ id: "sprint-7", name: "Sprint 26.3 - Sprint 7", active: false, startDate: "2026-09-16", endDate: null },
				{ id: "sprint-5", name: "Sprint 26.3 - Sprint 5", active: false, startDate: "2026-08-19", endDate: null },
				{ id: "sprint-1", name: "Sprint 26.4 - Sprint 1", active: false, startDate: "2026-09-30", endDate: null },
				{ id: "sprint-6", name: "Sprint 26.3 - Sprint 6", active: false, startDate: "2026-09-02", endDate: null },
			],
			[
				{ id: "allocation-5", allocation: "", plannedDays: 1, notes: "", sprintIds: ["sprint-5"], jiraIds: ["jira"], sprintActive: false, spillReason: "", spilled: false, sprintStart: null, firstSprintStart: null },
				{ id: "allocation-6", allocation: "", plannedDays: 1, notes: "", sprintIds: ["sprint-6"], jiraIds: ["jira"], sprintActive: false, spillReason: "First spill", spilled: true, sprintStart: null, firstSprintStart: null },
				{ id: "allocation-7", allocation: "", plannedDays: 1, notes: "", sprintIds: ["sprint-7"], jiraIds: ["jira"], sprintActive: false, spillReason: "Second spill", spilled: true, sprintStart: null, firstSprintStart: null },
				{ id: "allocation-1", allocation: "", plannedDays: 1, notes: "", sprintIds: ["sprint-1"], jiraIds: ["jira"], sprintActive: false, spillReason: "Third spill", spilled: true, sprintStart: null, firstSprintStart: null },
			],
		);

		expect(history.map((item) => item.allocationId)).toEqual(["allocation-5", "allocation-6", "allocation-7", "allocation-1"]);
		expect(deriveSpillEvents(history).map((event) => event.reason)).toEqual(["First spill", "Second spill", "Third spill"]);
	});

	it.each([
		[1, "allocation-sprint-6"],
		[2, "allocation-sprint-7"],
		[3, "allocation-sprint-1"],
	])("updates spill #%s on its chronologically receiving allocation", async (spillNumber, allocationId) => {
		const { fetchMock } = createSpillFixture();
		const reasonMarkdown = `Reason for spill ${spillNumber}`;

		const response = await fetchWorker(
			`/api/jiras/LSC-84944/spills/${spillNumber}/reason`,
			patch({ reasonMarkdown }),
		);

		expect(response.status).toBe(200);
		const patches = allocationPatchCalls(fetchMock);
		expect(patches).toHaveLength(1);
		expect(patches[0][0]).toBe(`https://api.notion.com/v1/pages/${allocationId}`);
		expect(JSON.parse(String((patches[0][1] as RequestInit).body))).toEqual({
			properties: {
				"Spill Reason": {
					rich_text: [{ text: { content: reasonMarkdown } }],
				},
			},
		});
	});

	it("preserves raw Markdown and returns refreshed JIRA spill history", async () => {
		const { fetchMock } = createSpillFixture();
		const reasonMarkdown = "## Why it moved\n\n- Waiting on **approval**\n- Keep `code` literal";

		const response = await fetchWorker(
			"/api/jiras/LSC-84944/spills/3/reason",
			patch({ reasonMarkdown }),
		);
		const body = (await response.json()) as { data: Record<string, any> };

		expect(response.status).toBe(200);
		expect(body.data.spillEvents).toMatchObject([
			{ number: 1, toSprint: { id: sprint6Id }, reason: "Original first reason" },
			{ number: 2, toSprint: { id: sprint7Id }, reason: "Original second reason" },
			{ number: 3, toSprint: { id: sprint1Id }, reason: reasonMarkdown },
		]);
		expect(body.data.sprintHistory.map((item: { allocationId: string | null }) => item.allocationId)).toEqual([
			"allocation-sprint-5",
			"allocation-sprint-6",
			"allocation-sprint-7",
			"allocation-sprint-1",
		]);
		expect(body.data.latestSpill).toMatchObject({ number: 3, toSprint: { id: sprint1Id }, reason: reasonMarkdown });
		expect(body.data.spillHistoryConsistent).toBe(true);
		expect(allocationPatchCalls(fetchMock)).toHaveLength(1);
	});

	it("clears a receiving allocation spill reason with an empty string", async () => {
		const { fetchMock } = createSpillFixture();
		const response = await fetchWorker(
			"/api/jiras/LSC-84944/spills/1/reason",
			patch({ reasonMarkdown: "" }),
		);
		const body = (await response.json()) as { data: Record<string, any> };

		expect(response.status).toBe(200);
		expect(JSON.parse(String((allocationPatchCalls(fetchMock)[0][1] as RequestInit).body))).toEqual({
			properties: { "Spill Reason": { rich_text: [] } },
		});
		expect(body.data.spillEvents[0].reason).toBeNull();
	});

	it("does not mutate when a receiving allocation is missing", async () => {
		const { fetchMock } = createSpillFixture({
			allocations: [
				notionAllocationPage("allocation-sprint-5", sprint5Id, ""),
				notionAllocationPage("allocation-sprint-7", sprint7Id, "Second"),
				notionAllocationPage("allocation-sprint-1", sprint1Id, "Third"),
			],
		});
		const response = await fetchWorker(
			"/api/jiras/LSC-84944/spills/1/reason",
			patch({ reasonMarkdown: "Never stored" }),
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "Spill allocation is missing",
			code: "SPILL_ALLOCATION_MISSING",
			spillNumber: 1,
		});
		expect(allocationPatchCalls(fetchMock)).toHaveLength(0);
	});

	it("does not mutate when a receiving allocation is duplicated", async () => {
		const { fetchMock } = createSpillFixture({
			allocations: [
				notionAllocationPage("allocation-sprint-5", sprint5Id, ""),
				notionAllocationPage("allocation-sprint-6-a", sprint6Id, "First"),
				notionAllocationPage("allocation-sprint-6-b", sprint6Id, "Conflicting first"),
				notionAllocationPage("allocation-sprint-7", sprint7Id, "Second"),
				notionAllocationPage("allocation-sprint-1", sprint1Id, "Third"),
			],
		});
		const response = await fetchWorker(
			"/api/jiras/LSC-84944/spills/1/reason",
			patch({ reasonMarkdown: "Never stored" }),
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "Spill allocation is ambiguous",
			code: "SPILL_ALLOCATION_CONFLICT",
			spillNumber: 1,
			allocationCount: 2,
		});
		expect(allocationPatchCalls(fetchMock)).toHaveLength(0);
	});

	it("does not mutate a JIRA without a spill event", async () => {
		const { fetchMock } = createSpillFixture({
			sprints: [notionSprintPage(sprint5Id, "Sprint 26.3 - Sprint 5", "2026-08-19")],
			allocations: [notionAllocationPage("allocation-sprint-5", sprint5Id, "")],
		});
		const response = await fetchWorker(
			"/api/jiras/LSC-84944/spills/1/reason",
			patch({ reasonMarkdown: "Never stored" }),
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "JIRA has no spill event", code: "JIRA_NOT_SPILLED" });
		expect(allocationPatchCalls(fetchMock)).toHaveLength(0);
	});

	it("rejects a spill number past the available events without mutation", async () => {
		const { fetchMock } = createSpillFixture();
		const response = await fetchWorker(
			"/api/jiras/LSC-84944/spills/4/reason",
			patch({ reasonMarkdown: "Never stored" }),
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "Spill event does not exist",
			code: "SPILL_EVENT_NOT_FOUND",
			spillNumber: 4,
			availableSpills: 3,
		});
		expect(allocationPatchCalls(fetchMock)).toHaveLength(0);
	});

	it("rejects an allocation outside the Sprint Allocations data source before PATCH", async () => {
		const { fetchMock } = createSpillFixture({
			allocationDataSourceId: testEnv.PROJECTS_DATA_SOURCE_ID,
		});
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const response = await fetchWorker(
			"/api/jiras/LSC-84944/spills/1/reason",
			patch({ reasonMarkdown: "Never stored" }),
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Failed to update spill reason" });
		expect(allocationPatchCalls(fetchMock)).toHaveLength(0);
		consoleError.mockRestore();
	});
});
