import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleJiraRoutes } from "../src/features/jiras/jira.routes";
import worker from "../src/index";
import type { Env } from "../src/shared/env";
import {
	createAuthHeaders,
	createTestRateLimiter,
	createTestAuthDb,
	TEST_AUTH_JWT_SECRET,
	TEST_AUTH_PASSWORD_HASH,
	TEST_AUTH_PASSWORD_ITERATIONS,
	TEST_AUTH_PASSWORD_SALT,
	TEST_AUTH_TOKEN_TTL_SECONDS,
	TEST_AUTH_RENEW_WINDOW_SECONDS,
	TEST_AUTH_MAX_SESSION_SECONDS,
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

const mappedJira = {
	id: "jira-page-id",
	createdTime: "2026-09-01T10:00:00.000Z",
	lastEditedTime: "2026-09-02T10:00:00.000Z",
	jiraKey: "ABC-123",
	summary: "Fix API response",
	status: "Done",
	tags: ["api", "notion"],
	appraisal: true,
	spillover: true,
	spilloverCount: 2,
	description: "JIRA description",
	firstSprintStart: "2026-08-19",
	inActiveSprint: false,
	demoRequired: true,
	demoedDate: "2026-09-02",
	demoNotes: "Shown in sprint review",
	sprintIds: ["sprint-id"],
	projectIds: ["project-id"],
	linkedJiraIds: ["linked-jira-id"],
	linkedFromIds: ["linked-from-id"],
	linkType: "Blocks",
	linkReason: "Dependency",
	linkedOn: "2026-08-20",
	resolvedOn: null,
	releaseItemIds: ["release-item-id"],
};

const notionJiraPage = {
	id: "jira-page-id",
	created_time: "2026-09-01T10:00:00.000Z",
	last_edited_time: "2026-09-02T10:00:00.000Z",
	properties: {
		"JIRA Key": {
			title: [{ plain_text: "ABC-123" }],
		},
		Summary: {
			rich_text: [{ plain_text: "Fix API response" }],
		},
		Status: {
			status: { name: "Done" },
		},
		Tags: {
			multi_select: [{ name: "api" }, { name: "notion" }],
		},
		Appraisal: {
			checkbox: true,
		},
		Spillover: {
			formula: { boolean: true },
		},
		"Spillover Count": {
			formula: { number: 2 },
		},
		Description: {
			rich_text: [{ plain_text: "JIRA description" }],
		},
		"First Sprint Start": {
			type: "formula",
			formula: {
				type: "date",
				date: {
					start: "2026-08-19",
					end: null,
					time_zone: null,
				},
			},
		},
		"In Active Sprint": {
			formula: { boolean: false },
		},
		"Demo Required": {
			checkbox: true,
		},
		"Demoed Date": {
			date: { start: "2026-09-02" },
		},
		"Demo Notes": {
			rich_text: [{ plain_text: "Shown in sprint review" }],
		},
		Sprints: {
			relation: [{ id: "sprint-id" }],
		},
		Project: {
			relation: [{ id: "project-id" }],
		},
		"Linked JIRA": {
			relation: [{ id: "linked-jira-id" }],
		},
		"Linked From": {
			relation: [{ id: "linked-from-id" }],
		},
		"Link Type": {
			select: { name: "Blocks" },
		},
		"Link Reason": {
			rich_text: [{ plain_text: "Dependency" }],
		},
		"Linked On": {
			date: { start: "2026-08-20" },
		},
		"Resolved On": {
			date: null,
		},
		"Release Items": {
			relation: [{ id: "release-item-id" }],
		},
	},
};

const activeSprintFilter = {
	property: "In Active Sprint",
	formula: {
		checkbox: {
			equals: true,
		},
	},
};

const routeCases = [
	{
		path: "/api/jiras",
		expectedFilter: undefined,
	},
	{
		path: "/api/jiras/active",
		expectedFilter: activeSprintFilter,
	},
	{
		path: "/api/jiras/blocked",
		expectedFilter: {
			and: [
				activeSprintFilter,
				{
					property: "Status",
					status: {
						equals: "Blocked",
					},
				},
			],
		},
	},
	{
		path: "/api/jiras/spillovers",
		expectedFilter: {
			and: [
				activeSprintFilter,
				{
					property: "Spillover",
					formula: {
						checkbox: {
							equals: true,
						},
					},
				},
			],
		},
	},
	{
		path: "/api/jiras/appraisal",
		expectedFilter: {
			property: "Appraisal",
			checkbox: {
				equals: true,
			},
		},
	},
	{
		path: "/api/jiras/demo-pending",
		expectedFilter: {
			and: [
				{
					property: "Demo Required",
					checkbox: {
						equals: true,
					},
				},
				{
					property: "Demoed Date",
					date: {
						is_empty: true,
					},
				},
			],
		},
	},
	{
		path: "/api/jiras/demoed",
		expectedFilter: {
			property: "Demoed Date",
			date: {
				is_not_empty: true,
			},
		},
	},
] as const;

function stubNotionFetch() {
	return stubNotionFetchWithResults([notionJiraPage]);
}

function stubNotionFetchWithResults(results: unknown[]) {
	const fetchMock = vi.fn().mockResolvedValue(
		Response.json({
			results,
			has_more: false,
			next_cursor: null,
		}),
	);

	vi.stubGlobal("fetch", fetchMock);

	return fetchMock;
}

function stubNotionFetchWithResponse(responseBody: unknown) {
	const fetchMock = vi.fn().mockResolvedValue(Response.json(responseBody));

	vi.stubGlobal("fetch", fetchMock);

	return fetchMock;
}

async function fetchWorker(
	path: string,
	init: RequestInit = {},
): Promise<Response> {
	const headers = new Headers(init.headers);

	for (const [key, value] of Object.entries(await createAuthHeaders(testEnv))) {
		headers.set(key, value);
	}

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

function jsonRequest(method: string, body: unknown): RequestInit {
	return {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	};
}

function expectNotionPostBody(
	fetchMock: ReturnType<typeof vi.fn>,
	expectedFilter: unknown,
	pageSize = 25,
) {
	expect(fetchMock).toHaveBeenCalledWith(
		"https://api.notion.com/v1/data_sources/test-jiras-data-source-id/query",
		expect.objectContaining({
			method: "POST",
			headers: {
				Authorization: "Bearer test-notion-token",
				"Notion-Version": "2026-03-11",
				"Content-Type": "application/json",
			},
		}),
	);

	const [, requestInit] = fetchMock.mock.calls[0];
	const body = JSON.parse(String(requestInit.body));

	if (expectedFilter) {
		expect(body).toEqual({
			page_size: pageSize,
			filter: expectedFilter,
		});
	} else {
		expect(body).toEqual({
			page_size: pageSize,
		});
	}
}

function expectJiraKeyLookupBody(fetchMock: ReturnType<typeof vi.fn>, jiraKey: string) {
	expectNotionPostBody(
		fetchMock,
		{
			property: "JIRA Key",
			title: {
				equals: jiraKey,
			},
		},
		100,
	);
}

function expectJiraOptionsBody(
	fetchMock: ReturnType<typeof vi.fn>,
	expectedBody: unknown,
) {
	expect(fetchMock).toHaveBeenCalledWith(
		"https://api.notion.com/v1/data_sources/test-jiras-data-source-id/query",
		expect.objectContaining({
			method: "POST",
			headers: {
				Authorization: "Bearer test-notion-token",
				"Notion-Version": "2026-03-11",
				"Content-Type": "application/json",
			},
		}),
	);

	const [, requestInit] = fetchMock.mock.calls[0];

	expect(JSON.parse(String(requestInit.body))).toEqual(expectedBody);
}

const sprint5Id = "55555555-5555-5555-5555-555555555555";
const sprint6Id = "66666666-6666-6666-6666-666666666666";
const sprint7Id = "77777777-7777-7777-7777-777777777777";
const sprint8Id = "88888888-8888-8888-8888-888888888888";

function notionSprintPage(
	id: string,
	name: string,
	startDate: string | null,
	endDate: string | null,
	active = false,
) {
	return {
		id,
		properties: {
			Sprint: { title: [{ plain_text: name }] },
			Active: { checkbox: active },
			"Start Date": startDate ? { date: { start: startDate } } : { date: null },
			"End Date": endDate ? { date: { start: endDate } } : { date: null },
			Project: { relation: [] },
		},
	};
}

function notionAllocationPage(
	id: string,
	allocation: string,
	sprintId: string,
	jiraId: string,
	plannedDays: number,
	notes = "",
	spillReason = "",
	spilled = false,
) {
	return {
		id,
		properties: {
			Allocation: { title: [{ plain_text: allocation }] },
			Sprint: { relation: [{ id: sprintId }] },
			JIRA: { relation: [{ id: jiraId }] },
			"Planned Days": { number: plannedDays },
			Notes: { rich_text: [{ plain_text: notes }] },
			"Spill Reason": { rich_text: [{ plain_text: spillReason }] },
			Spilled: { formula: { boolean: spilled } },
			"Sprint Active": {
				rollup: {
					array: [{ formula: { boolean: false } }],
				},
			},
		},
	};
}

function notionResponse(results: unknown[], nextCursor: string | null = null) {
	return Response.json({
		results,
		has_more: nextCursor !== null,
		next_cursor: nextCursor,
	});
}

function postedBodies(fetchMock: ReturnType<typeof vi.fn>, dataSourceId: string) {
	return fetchMock.mock.calls
		.filter(([url]) => String(url).includes(`/data_sources/${dataSourceId}/query`))
		.map(([, init]) => JSON.parse(String(init.body)));
}

function stubJiraDetailFetch(options: {
	jiraPage?: unknown;
	allocations?: unknown[];
	allocationNextPage?: unknown[];
}) {
	const jiraDetailPage =
		options.jiraPage ??
		({
			...notionJiraPage,
			id: "99999999-9999-9999-9999-999999999999",
			properties: {
				...notionJiraPage.properties,
				"JIRA Key": { title: [{ plain_text: "LSC-84944" }] },
				Status: { status: { name: "Cancelled" } },
				Spillover: { formula: { boolean: true } },
				"Spillover Count": { formula: { number: 2 } },
				Description: {
					rich_text: [{ plain_text: "Second spill reason" }],
				},
				Sprints: {
					relation: [
						{ id: sprint7Id },
						{ id: sprint5Id },
						{ id: sprint6Id },
					],
				},
			},
		} as unknown);
	const allocations =
		options.allocations ??
		[
			notionAllocationPage(
				"allocation-sprint-5",
				"Sprint 5 allocation",
				sprint5Id,
				"99999999-9999-9999-9999-999999999999",
				10,
				"Initial plan",
			),
			notionAllocationPage(
				"allocation-sprint-6",
				"Sprint 6 allocation",
				sprint6Id,
				"99999999-9999-9999-9999-999999999999",
				0,
				"",
				"Reason A",
				true,
			),
		];
	const allocationNextPage = options.allocationNextPage ?? [];
	const fetchMock = vi.fn((url: string, init?: RequestInit) => {
		if (url.endsWith("/v1/pages/linked-jira-id")) {
			return Promise.resolve(
				Response.json({
					...notionJiraPage,
					id: "linked-jira-id",
					parent: { data_source_id: testEnv.JIRAS_DATA_SOURCE_ID },
					properties: {
						...notionJiraPage.properties,
						"JIRA Key": { title: [{ plain_text: "LINK-1" }] },
						Summary: { rich_text: [{ plain_text: "Linked target" }] },
						"Linked JIRA": { relation: [] },
						"Linked From": { relation: [] },
					},
				}),
			);
		}

		if (url.endsWith("/v1/pages/linked-from-id")) {
			return Promise.resolve(
				Response.json({
					...notionJiraPage,
					id: "linked-from-id",
					parent: { data_source_id: testEnv.JIRAS_DATA_SOURCE_ID },
					properties: {
						...notionJiraPage.properties,
						"JIRA Key": { title: [{ plain_text: "LINK-2" }] },
						Summary: { rich_text: [{ plain_text: "Linked source" }] },
						"Linked JIRA": {
							relation: [{ id: (jiraDetailPage as { id: string }).id }],
						},
						"Linked From": { relation: [] },
						"Link Type": { select: { name: "Dependency for" } },
						"Link Reason": { rich_text: [{ plain_text: "Source-owned reason" }] },
						"Linked On": { date: { start: "2026-09-02" } },
						"Resolved On": { date: { start: "2026-09-03" } },
					},
				}),
			);
		}

		const body = init?.body ? JSON.parse(String(init.body)) : {};

		if (url.includes(testEnv.JIRAS_DATA_SOURCE_ID)) {
			if (body.filter?.title) {
				return Promise.resolve(notionResponse([jiraDetailPage]));
			}

			return Promise.resolve(notionResponse([]));
		}

		if (url.includes(testEnv.SPRINTS_DATA_SOURCE_ID)) {
			return Promise.resolve(
				notionResponse([
					notionSprintPage(sprint6Id, "Sprint - 26.3 - Sprint 6", "2026-09-02", "2026-09-15", true),
					notionSprintPage(sprint5Id, "Sprint - 26.3 - Sprint 5", "2026-08-19", "2026-09-01"),
					notionSprintPage(sprint7Id, "Sprint - 26.3 - Sprint 7", "2026-09-16", "2026-09-29"),
					notionSprintPage(sprint8Id, "Sprint - 26.3 - Sprint 8", null, null),
				]),
			);
		}

		if (url.includes(testEnv.PROJECTS_DATA_SOURCE_ID)) {
			return Promise.resolve(notionResponse([]));
		}

		if (url.includes(testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)) {
			return Promise.resolve(
				body.start_cursor
					? notionResponse(allocationNextPage)
					: notionResponse(allocations, allocationNextPage.length ? "next-allocation" : null),
			);
		}

		return Promise.resolve(notionResponse([]));
	});

	vi.stubGlobal("fetch", fetchMock);

	return fetchMock;
}

describe("Work Tracker API worker", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("returns the root health response", async () => {
		const response = await fetchWorker("/");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			name: "Work Tracker API",
			status: "ok",
		});
	});

	it("returns 404 when no route matches", async () => {
		const response = await fetchWorker("/missing");

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it.each(routeCases)(
		"queries Notion and maps JIRAs for $path",
		async ({ path, expectedFilter }) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(response.status).toBe(200);
			expectNotionPostBody(fetchMock, expectedFilter);
			expect(await response.json()).toEqual({
				data: [mappedJira],
				count: 1,
				hasMore: false,
				nextCursor: null,
			});
		},
	);

	it("queries lightweight JIRA options with the active sprint filter by default", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker(
			"/api/jiras/options",
			jsonRequest("QUERY", { filters: {} }),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Accept-Query")).toBe("application/json");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expectJiraOptionsBody(fetchMock, {
			page_size: 20,
			filter: activeSprintFilter,
			sorts: [{ property: "JIRA Key", direction: "ascending" }],
		});
		expect(await response.json()).toEqual({
			data: [
				{
					id: "jira-page-id",
					jiraKey: "ABC-123",
					summary: "Fix API response",
					status: "Done",
					inActiveSprint: false,
				},
			],
			count: 1,
			hasMore: false,
			nextCursor: null,
		});
	});

	it.each([
		["missing q", {}],
		["empty q", { q: "" }],
		["whitespace q", { q: "   " }],
	])("uses active sprint JIRA options filter for %s", async (_name, filters) => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker(
			"/api/jiras/options",
			jsonRequest("QUERY", { filters }),
		);

		expect(response.status).toBe(200);
		expectJiraOptionsBody(fetchMock, {
			page_size: 20,
			filter: activeSprintFilter,
			sorts: [{ property: "JIRA Key", direction: "ascending" }],
		});
	});

	it("searches all JIRAs for non-empty options q without active sprint filtering", async () => {
		const fetchMock = stubNotionFetchWithResponse({
			results: [
				{
					...notionJiraPage,
					properties: {
						...notionJiraPage.properties,
						"In Active Sprint": { formula: { boolean: false } },
					},
				},
			],
			has_more: true,
			next_cursor: "next-jira-option",
		});

		const response = await fetchWorker(
			"/api/jiras/options",
			jsonRequest("QUERY", {
				filters: { q: "CRI-1234" },
				pageSize: 12,
				cursor: "opaque-option-cursor",
			}),
		);

		expect(response.status).toBe(200);
		expectJiraOptionsBody(fetchMock, {
			page_size: 12,
			start_cursor: "opaque-option-cursor",
			filter: {
				or: [
					{
						property: "JIRA Key",
						title: {
							contains: "CRI-1234",
						},
					},
					{
						property: "Summary",
						rich_text: {
							contains: "CRI-1234",
						},
					},
				],
			},
			sorts: [{ property: "JIRA Key", direction: "ascending" }],
		});
		const body = (await response.json()) as {
			data: Array<Record<string, unknown>>;
			count: number;
			hasMore: boolean;
			nextCursor: string | null;
		};
		expect(Object.keys(body.data[0]).sort()).toEqual([
			"id",
			"inActiveSprint",
			"jiraKey",
			"status",
			"summary",
		]);
		expect(body).toMatchObject({
			count: 1,
			hasMore: true,
			nextCursor: "next-jira-option",
		});
		expect(
			fetchMock.mock.calls.some(([url]) =>
				String(url).includes(testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID),
			),
		).toBe(false);
		expect(
			fetchMock.mock.calls.some(([url]) =>
				String(url).includes(testEnv.SPRINTS_DATA_SOURCE_ID),
			),
		).toBe(false);
	});

	it("rejects unsupported JIRA options filters before Notion is called", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/jiras/options",
			jsonRequest("QUERY", { filters: { statuses: ["Done"] } }),
		);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid request",
			field: "statuses",
			message: "Unknown filter",
		});
	});

	it("rejects relation enrichment for JIRA options before Notion is called", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/jiras/options",
			jsonRequest("QUERY", { filters: {}, includeRelations: true }),
		);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid request",
			field: "includeRelations",
			message: "Relation enrichment is not supported for JIRA options",
		});
	});

	it("returns invalid JSON errors for malformed JIRA options QUERY bodies", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker("/api/jiras/options", {
			method: "QUERY",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid JSON",
		});
	});

	it("requires auth for JIRA options", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const request = new IncomingRequest("http://example.com/api/jiras/options", {
			method: "QUERY",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ filters: {} }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, testEnv, ctx);

		await waitOnExecutionContext(ctx);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
		});
	});

	it("advertises only QUERY and OPTIONS for JIRA options preflight", async () => {
		const response = await fetchWorker("/api/jiras/options", { method: "OPTIONS" });

		expect(response.status).toBe(204);
		expect(response.headers.get("Allow")).toBe("QUERY, OPTIONS");
		expect(response.headers.get("Accept-Query")).toBe("application/json");
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
			"GET, QUERY, POST, PATCH, DELETE, OPTIONS",
		);
	});

	it("does not interpret the static JIRA options path as a JIRA key", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker("/api/jiras/options");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("sends pagination without changing the blocked JIRA filter", async () => {
		const fetchMock = stubNotionFetchWithResponse({
			results: [notionJiraPage],
			has_more: true,
			next_cursor: "jira-cursor-next",
		});

		const response = await fetchWorker(
			"/api/jiras/blocked?pageSize=5&cursor=jira-cursor-1",
		);

		expect(response.status).toBe(200);
		const [, requestInit] = fetchMock.mock.calls[0];
		expect(JSON.parse(String(requestInit.body))).toEqual({
			page_size: 5,
			start_cursor: "jira-cursor-1",
			filter: {
				and: [
					activeSprintFilter,
					{
						property: "Status",
						status: {
							equals: "Blocked",
						},
					},
				],
			},
		});
		expect(await response.json()).toEqual({
			data: [mappedJira],
			count: 1,
			hasMore: true,
			nextCursor: "jira-cursor-next",
		});
	});

	it("returns one JIRA by JIRA key", async () => {
		const fetchMock = stubNotionFetchWithResults([
			{
				...notionJiraPage,
				properties: {
					...notionJiraPage.properties,
					"JIRA Key": {
						title: [{ plain_text: " CRI-1234 " }],
					},
				},
			},
		]);

		const response = await fetchWorker("/api/jiras/CRI-1234");

		expect(response.status).toBe(200);
		expectJiraKeyLookupBody(fetchMock, "CRI-1234");
		expect(await response.json()).toEqual({
			...mappedJira,
			jiraKey: "CRI-1234",
		});
	});

	it("decodes and trims the JIRA key path segment before querying Notion", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/jiras/%20CRI-1234%20");

		expect(response.status).toBe(200);
		expectJiraKeyLookupBody(fetchMock, "CRI-1234");
	});

	it("returns 404 when a JIRA key does not exist", async () => {
		const fetchMock = stubNotionFetchWithResults([]);

		const response = await fetchWorker("/api/jiras/CRI-404");

		expect(response.status).toBe(404);
		expectJiraKeyLookupBody(fetchMock, "CRI-404");
		expect(await response.json()).toEqual({
			error: "JIRA not found",
		});
	});

	it("returns 500 when more than one JIRA has the same key", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		const fetchMock = stubNotionFetchWithResults([notionJiraPage, notionJiraPage]);

		const response = await fetchWorker("/api/jiras/CRI-1234");

		expect(response.status).toBe(500);
		expectJiraKeyLookupBody(fetchMock, "CRI-1234");
		expect(consoleError).toHaveBeenCalledWith(
			"Expected one JIRA for key CRI-1234, found 2",
		);
		expect(await response.json()).toEqual({
			error: "Duplicate JIRA key found",
		});

		consoleError.mockRestore();
	});

	it("adds chronological sprint history and spill events to JIRA detail with relations", async () => {
		const fetchMock = stubJiraDetailFetch({});

		const response = await fetchWorker("/api/jiras/LSC-84944?include=relations");
		const body = (await response.json()) as Record<string, any>;

		expect(response.status).toBe(200);
		expect(body.status).toBe("Cancelled");
		expect(body.description).toBe("Second spill reason");
		expect(body.sprints.map((sprint: { id: string }) => sprint.id)).toEqual([
			sprint5Id,
			sprint6Id,
			sprint7Id,
		]);
		expect(body.sprints[1]).toEqual(
			expect.objectContaining({
				id: sprint6Id,
				active: true,
				startDate: "2026-09-02",
				endDate: "2026-09-15",
			}),
		);
		expect(body.sprintHistory).toMatchObject([
			{
				sprint: { id: sprint5Id },
				allocationId: "allocation-sprint-5",
				plannedDays: 10,
				allocationNotes: "Initial plan",
				spillReason: "",
				spilled: false,
				allocationConflict: false,
				allocationCount: 1,
			},
			{
				sprint: { id: sprint6Id },
				allocationId: "allocation-sprint-6",
				plannedDays: 0,
				allocationNotes: "",
				spillReason: "Reason A",
				spilled: true,
				allocationConflict: false,
				allocationCount: 1,
			},
			{
				sprint: { id: sprint7Id },
				allocationId: null,
				plannedDays: null,
				allocationNotes: "",
				allocationConflict: false,
				allocationCount: 0,
			},
		]);
		expect(body.spillEvents).toMatchObject([
			{
				number: 1,
				fromSprint: { id: sprint5Id },
				toSprint: { id: sprint6Id },
				reason: "Reason A",
			},
			{
				number: 2,
				fromSprint: { id: sprint6Id },
				toSprint: { id: sprint7Id },
				reason: null,
			},
		]);
		expect(body.latestSpill).toMatchObject({
			number: 2,
			fromSprint: { id: sprint6Id },
			toSprint: { id: sprint7Id },
			reason: null,
		});
		expect(postedBodies(fetchMock, testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)).toEqual([
			{
				page_size: 100,
				filter: {
					property: "JIRA",
					relation: {
						contains: "99999999-9999-9999-9999-999999999999",
					},
				},
			},
		]);
	});

	it("keeps the latest derived spill when spillover count exceeds available transitions", async () => {
		const fetchMock = stubJiraDetailFetch({
			jiraPage: {
				...notionJiraPage,
				id: "99999999-9999-9999-9999-999999999999",
				properties: {
					...notionJiraPage.properties,
					"JIRA Key": { title: [{ plain_text: "LSC-84944" }] },
					Spillover: { formula: { boolean: true } },
					"Spillover Count": { formula: { number: 3 } },
					Description: { rich_text: [{ plain_text: "No transition" }] },
					Sprints: { relation: [{ id: sprint5Id }, { id: sprint6Id }] },
				},
			},
		});

		const response = await fetchWorker("/api/jiras/LSC-84944?include=relations");
		const body = (await response.json()) as Record<string, any>;

		expect(response.status).toBe(200);
		expect(body.spillEvents).toHaveLength(1);
		expect(body.spillEvents[0].reason).toBe("Reason A");
		expect(body.latestSpill).toMatchObject({ number: 1 });
		expect(body.spillHistoryConsistent).toBe(false);
		expect(postedBodies(fetchMock, testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)).toHaveLength(
			1,
		);
	});

	it("fetches all Sprint Allocations for JIRA detail without one request per Sprint", async () => {
		const fetchMock = stubJiraDetailFetch({
			allocations: [
				notionAllocationPage(
					"allocation-sprint-5",
					"Sprint 5 allocation",
					sprint5Id,
					"99999999-9999-9999-9999-999999999999",
					10,
				),
			],
			allocationNextPage: [
				notionAllocationPage(
					"allocation-sprint-7",
					"Sprint 7 allocation",
					sprint7Id,
					"99999999-9999-9999-9999-999999999999",
					2.5,
				),
			],
		});

		const response = await fetchWorker("/api/jiras/LSC-84944?include=relations");
		const body = (await response.json()) as Record<string, any>;
		const allocationBodies = postedBodies(
			fetchMock,
			testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID,
		);

		expect(response.status).toBe(200);
		expect(body.sprintHistory).toMatchObject([
			{ sprint: { id: sprint5Id }, plannedDays: 10 },
			{ sprint: { id: sprint6Id }, plannedDays: null },
			{ sprint: { id: sprint7Id }, plannedDays: 2.5 },
		]);
		expect(allocationBodies).toHaveLength(2);
		expect(allocationBodies[1]).toMatchObject({
			start_cursor: "next-allocation",
		});
	});

	it("marks duplicate Sprint Allocations on JIRA detail without choosing planned days", async () => {
		const fetchMock = stubJiraDetailFetch({
			allocations: [
				notionAllocationPage(
					"allocation-sprint-5-a",
					"Sprint 5 allocation A",
					sprint5Id,
					"99999999-9999-9999-9999-999999999999",
					10,
					"First duplicate",
				),
				notionAllocationPage(
					"allocation-sprint-5-b",
					"Sprint 5 allocation B",
					sprint5Id,
					"99999999-9999-9999-9999-999999999999",
					3,
					"Second duplicate",
				),
				notionAllocationPage(
					"allocation-sprint-6",
					"Sprint 6 allocation",
					sprint6Id,
					"99999999-9999-9999-9999-999999999999",
					0,
				),
			],
		});

		const response = await fetchWorker("/api/jiras/LSC-84944?include=relations");
		const body = (await response.json()) as Record<string, any>;

		expect(response.status).toBe(200);
		expect(body.sprintHistory).toMatchObject([
			{
				sprint: { id: sprint5Id },
				allocationId: null,
				plannedDays: null,
				allocationNotes: "",
				allocationConflict: true,
				allocationCount: 2,
			},
			{
				sprint: { id: sprint6Id },
				allocationId: "allocation-sprint-6",
				plannedDays: 0,
				allocationConflict: false,
				allocationCount: 1,
			},
			{
				sprint: { id: sprint7Id },
				allocationId: null,
				plannedDays: null,
				allocationConflict: false,
				allocationCount: 0,
			},
		]);
		expect(postedBodies(fetchMock, testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)).toHaveLength(
			1,
		);
	});

	it("does not query Sprint Allocations for existing JIRA list routes", async () => {
		const fetchMock = stubJiraDetailFetch({});

		const response = await fetchWorker("/api/jiras/active?include=relations");

		expect(response.status).toBe(200);
		expect(postedBodies(fetchMock, testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)).toHaveLength(
			0,
		);
	});

	it("lets unknown JIRA subpaths fall through to the main Worker 404", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/jiras/random");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("returns null from the JIRA route handler for unknown JIRA subpaths", async () => {
		const response = await handleJiraRoutes(
			new IncomingRequest("http://example.com/api/jiras/random"),
			new URL("http://example.com/api/jiras/random"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});
