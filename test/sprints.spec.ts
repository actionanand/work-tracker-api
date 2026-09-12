import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSprintRoutes } from "../src/features/sprints/sprint.routes";
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
	REFERENCE_LIBRARY_PAGE_ID: "test-reference-library-page-id",
};

const activeFilter = {
	property: "Active",
	checkbox: {
		equals: true,
	},
};

const historyFilter = {
	property: "Active",
	checkbox: {
		equals: false,
	},
};

const projectFilter = {
	property: "Project",
	relation: {
		contains: "33333333-3333-3333-3333-333333333333",
	},
};

const companyProjectsFilter = {
	property: "Company",
	relation: {
		contains: "11111111-1111-1111-1111-111111111111",
	},
};

const invalidParameterResponse = (parameter: string) => ({
	error: "Invalid query parameter",
	parameter,
	message: "Expected a valid Notion page ID",
});

const fromFilter = {
	property: "End Date",
	date: {
		on_or_after: "2026-09-01",
	},
};

const toFilter = {
	property: "Start Date",
	date: {
		on_or_before: "2026-09-30",
	},
};

const historySort = [{ property: "Start Date", direction: "descending" }];

const routeCases = [
	{
		path: "/api/sprints",
		expectedBody: {
			page_size: 25,
		},
	},
	{
		path: "/api/sprints/active",
		expectedBody: {
			page_size: 25,
			filter: activeFilter,
		},
	},
	{
		path: "/api/sprints/history",
		expectedBody: {
			page_size: 25,
			filter: historyFilter,
			sorts: historySort,
		},
	},
	{
		path: "/api/sprints?projectId=33333333-3333-3333-3333-333333333333",
		expectedBody: {
			page_size: 25,
			filter: projectFilter,
		},
	},
	{
		path: "/api/sprints?from=2026-09-01&to=2026-09-30",
		expectedBody: {
			page_size: 25,
			filter: {
				and: [fromFilter, toFilter],
			},
		},
	},
	{
		path: "/api/sprints/history?projectId=33333333-3333-3333-3333-333333333333&from=2026-09-01&to=2026-09-30",
		expectedBody: {
			page_size: 25,
			filter: {
				and: [historyFilter, projectFilter, fromFilter, toFilter],
			},
			sorts: historySort,
		},
	},
] as const;

const fullSprintPage = {
	id: "44444444-4444-4444-4444-444444444444",
	properties: {
		Sprint: {
			title: [{ plain_text: "Sprint 42" }],
		},
		Project: {
			relation: [{ id: "33333333-3333-3333-3333-333333333333" }],
		},
		Active: {
			checkbox: true,
		},
		"Start Date": {
			date: { start: "2026-09-01" },
		},
		"End Date": {
			date: { start: "2026-09-15" },
		},
		"Week Off 1": {
			select: { name: "Saturday" },
		},
		"Week Off 2": {
			select: { name: "Sunday" },
		},
		"Planned Leave Days": {
			number: 1,
		},
		"Holiday Days": {
			number: 2,
		},
		"Capacity Days": {
			formula: { type: "number", number: 10 },
		},
		"Available Days": {
			formula: { type: "number", number: 7 },
		},
		Allocations: {
			relation: [{ id: "allocation-page-id" }],
		},
		"Allocated Days": {
			rollup: { type: "number", number: 5 },
		},
		"Remaining Days": {
			formula: { type: "number", number: 2 },
		},
	},
};

const defaultSprintPage = {
	id: "default-44444444-4444-4444-4444-444444444444",
	properties: {},
};

const expectedSprint = {
	id: "44444444-4444-4444-4444-444444444444",
	sprint: "Sprint 42",
	active: true,
	startDate: "2026-09-01",
	endDate: "2026-09-15",
	weekOff1: "Saturday",
	weekOff2: "Sunday",
	plannedLeaveDays: 1,
	holidayDays: 2,
	capacityDays: 10,
	availableDays: 7,
	allocatedDays: 5,
	remainingDays: 2,
	projectIds: ["33333333-3333-3333-3333-333333333333"],
	allocationIds: ["allocation-page-id"],
};

const expectedDefaultSprint = {
	id: "default-44444444-4444-4444-4444-444444444444",
	sprint: "",
	active: false,
	startDate: null,
	endDate: null,
	weekOff1: null,
	weekOff2: null,
	plannedLeaveDays: 0,
	holidayDays: 0,
	capacityDays: 0,
	availableDays: 0,
	allocatedDays: 0,
	remainingDays: 0,
	projectIds: [],
	allocationIds: [],
};

const secondJiraPage = {
	id: "55555555-5555-5555-5555-555555555555",
	created_time: "2026-09-01T10:00:00.000Z",
	last_edited_time: "2026-09-02T10:00:00.000Z",
	properties: {
		"JIRA Key": {
			title: [{ plain_text: "CRI-2" }],
		},
		Summary: {
			rich_text: [{ plain_text: "Cancelled work" }],
		},
		Status: {
			status: { name: "Cancelled" },
		},
		Tags: {
			multi_select: [],
		},
		Appraisal: {
			checkbox: false,
		},
		Spillover: {
			formula: { boolean: false },
		},
		"Spillover Count": {
			formula: { number: 0 },
		},
		"Spillover Reason": {
			rich_text: [],
		},
		"In Active Sprint": {
			formula: { boolean: false },
		},
		"Demo Required": {
			checkbox: false,
		},
		"Demoed Date": {
			date: null,
		},
		"Demo Notes": {
			rich_text: [],
		},
		Sprints: {
			relation: [{ id: "44444444-4444-4444-4444-444444444444" }],
		},
		Project: {
			relation: [],
		},
		"Blocked By": {
			relation: [],
		},
		"Release Items": {
			relation: [],
		},
	},
};

function sprintDetailJiraPage(
	id: string,
	key: string,
	status: string,
	inActiveSprint: boolean,
) {
	return {
		id,
		created_time: "2026-09-01T10:00:00.000Z",
		last_edited_time: "2026-09-02T10:00:00.000Z",
		properties: {
			...secondJiraPage.properties,
			"JIRA Key": { title: [{ plain_text: key }] },
			Summary: { rich_text: [{ plain_text: `${key} summary` }] },
			Status: { status: { name: status } },
			"In Active Sprint": { formula: { boolean: inActiveSprint } },
		},
	};
}

function sprintDetailAllocationPage(
	id: string,
	jiraId: string,
	plannedDays: number,
	notes = "",
) {
	return {
		id,
		properties: {
			Allocation: { title: [{ plain_text: id }] },
			Sprint: {
				relation: [{ id: "44444444-4444-4444-4444-444444444444" }],
			},
			JIRA: { relation: [{ id: jiraId }] },
			"Planned Days": { number: plannedDays },
			Notes: { rich_text: [{ plain_text: notes }] },
			"Sprint Active": { rollup: { array: [{ formula: { boolean: true } }] } },
		},
	};
}

function stubNotionFetch() {
	const fetchMock = vi.fn().mockResolvedValue(
		Response.json({
			results: [fullSprintPage, defaultSprintPage],
			has_more: false,
			next_cursor: null,
		}),
	);

	vi.stubGlobal("fetch", fetchMock);

	return fetchMock;
}

function stubNotionFetchResponse(responseBody: unknown) {
	const fetchMock = vi.fn().mockResolvedValue(Response.json(responseBody));

	vi.stubGlobal("fetch", fetchMock);

	return fetchMock;
}

function stubSequentialNotionFetch(responses: unknown[]) {
	const fetchMock = vi.fn();

	for (const response of responses) {
		fetchMock.mockResolvedValueOnce(Response.json(response));
	}

	vi.stubGlobal("fetch", fetchMock);

	return fetchMock;
}

function stubSprintDetailFetch(options: {
	sprintResponse?: Response;
	allocations?: unknown[];
	jiraNextPage?: unknown[];
	allocationNextPage?: unknown[];
} = {}) {
	const jiras = [
		sprintDetailJiraPage("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "CRI-3", "Done", false),
		sprintDetailJiraPage("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "CRI-1", "Blocked", true),
		sprintDetailJiraPage("cccccccc-cccc-cccc-cccc-cccccccccccc", "CRI-2", "Cancelled", false),
		sprintDetailJiraPage("dddddddd-dddd-dddd-dddd-dddddddddddd", "CRI-4", "Future Status", false),
	];
	const allocations = options.allocations ?? [
		sprintDetailAllocationPage(
			"allocation-cri-1",
			"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
			2.5,
			"Carryover plan",
		),
		sprintDetailAllocationPage(
			"allocation-cri-2",
			"cccccccc-cccc-cccc-cccc-cccccccccccc",
			6,
		),
		sprintDetailAllocationPage(
			"allocation-cri-3",
			"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
			0,
		),
	];
	const fetchMock = vi.fn((url: string, init?: RequestInit) => {
		const body = init?.body ? JSON.parse(String(init.body)) : {};

		if (url === "https://api.notion.com/v1/pages/44444444-4444-4444-4444-444444444444") {
			return Promise.resolve(options.sprintResponse ?? Response.json(fullSprintPage));
		}

		if (url.includes(testEnv.PROJECTS_DATA_SOURCE_ID)) {
			return Promise.resolve(
				Response.json({
					results: [
						{
							id: "33333333-3333-3333-3333-333333333333",
							properties: {
								Project: { title: [{ plain_text: "Work Tracker" }] },
							},
						},
					],
					has_more: false,
					next_cursor: null,
				}),
			);
		}

		if (url.includes(testEnv.JIRAS_DATA_SOURCE_ID)) {
			return Promise.resolve(
				Response.json({
					results: body.start_cursor ? options.jiraNextPage ?? [] : jiras,
					has_more: !body.start_cursor && Boolean(options.jiraNextPage?.length),
					next_cursor: !body.start_cursor && options.jiraNextPage?.length ? "next-jiras" : null,
				}),
			);
		}

		if (url.includes(testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)) {
			return Promise.resolve(
				Response.json({
					results: body.start_cursor
						? options.allocationNextPage ?? []
						: allocations,
					has_more:
						!body.start_cursor && Boolean(options.allocationNextPage?.length),
					next_cursor:
						!body.start_cursor && options.allocationNextPage?.length
							? "next-allocations"
							: null,
				}),
			);
		}

		return Promise.resolve(
			Response.json({ results: [], has_more: false, next_cursor: null }),
		);
	});

	vi.stubGlobal("fetch", fetchMock);

	return fetchMock;
}

async function fetchWorker(path: string): Promise<Response> {
	const request = new IncomingRequest(`http://example.com${path}`, {
		headers: await createAuthHeaders(testEnv),
	});
	const ctx = createExecutionContext();

	const response = await worker.fetch(request, testEnv, ctx);

	await waitOnExecutionContext(ctx);

	return response;
}

function expectNotionRequest(
	fetchMock: ReturnType<typeof vi.fn>,
	expectedBody: unknown,
) {
	expect(fetchMock).toHaveBeenCalledWith(
		"https://api.notion.com/v1/data_sources/test-sprints-data-source-id/query",
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

function expectNotionCall(
	fetchMock: ReturnType<typeof vi.fn>,
	callIndex: number,
	dataSourceId: string,
	expectedBody: unknown,
) {
	expect(fetchMock.mock.calls[callIndex][0]).toBe(
		`https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
	);
	expect(fetchMock.mock.calls[callIndex][1]).toMatchObject({
		method: "POST",
		headers: {
			Authorization: "Bearer test-notion-token",
			"Notion-Version": "2026-03-11",
			"Content-Type": "application/json",
		},
	});
	expect(JSON.parse(String(fetchMock.mock.calls[callIndex][1].body))).toEqual(
		expectedBody,
	);
}

function expectPostedBody(
	fetchMock: ReturnType<typeof vi.fn>,
	dataSourceId: string,
	expectedBody: unknown,
) {
	const call = fetchMock.mock.calls.find(([url]) =>
		String(url).includes(`/data_sources/${dataSourceId}/query`),
	);

	expect(call).toBeDefined();
	expect(JSON.parse(String(call?.[1].body))).toEqual(expectedBody);
}

function postedBodies(fetchMock: ReturnType<typeof vi.fn>, dataSourceId: string) {
	return fetchMock.mock.calls
		.filter(([url]) => String(url).includes(`/data_sources/${dataSourceId}/query`))
		.map(([, init]) => JSON.parse(String(init.body)));
}

describe("Sprint API routes", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(routeCases)(
		"queries Notion and maps sprints for $path",
		async ({ path, expectedBody }) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(response.status).toBe(200);
			expectNotionRequest(fetchMock, expectedBody);
			expect(await response.json()).toEqual({
				data: [expectedSprint, expectedDefaultSprint],
				count: 2,
				hasMore: false,
				nextCursor: null,
			});
		},
	);

	it("sends pagination with Sprint history filters and preserves newest-first sort", async () => {
		const fetchMock = stubNotionFetchResponse({
			results: [fullSprintPage],
			has_more: true,
			next_cursor: "sprint-cursor-next",
		});

		const response = await fetchWorker(
			"/api/sprints/history?projectId=33333333-3333-3333-3333-333333333333&pageSize=12&cursor=sprint-cursor-1",
		);

		expect(response.status).toBe(200);
		expectNotionRequest(fetchMock, {
			page_size: 12,
			start_cursor: "sprint-cursor-1",
			filter: {
				and: [historyFilter, projectFilter],
			},
			sorts: historySort,
		});
		expect(await response.json()).toEqual({
			data: [expectedSprint],
			count: 1,
			hasMore: true,
			nextCursor: "sprint-cursor-next",
		});
	});

	it("returns 400 for an invalid from date without calling Notion", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/sprints?from=2026-99-99");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid date query parameter",
			parameter: "from",
			expectedFormat: "YYYY-MM-DD",
		});
	});

	it("returns 400 for an invalid to date without calling Notion", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/sprints/history?to=not-a-date");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid date query parameter",
			parameter: "to",
			expectedFormat: "YYYY-MM-DD",
		});
	});

	it("queries Sprint history by resolving Company projects first", async () => {
		const fetchMock = stubSequentialNotionFetch([
			{
				results: [{ id: "33333333-3333-3333-3333-333333333333-1" }, { id: "33333333-3333-3333-3333-333333333333-2" }],
				has_more: false,
				next_cursor: null,
			},
			{
				results: [fullSprintPage],
				has_more: false,
				next_cursor: null,
			},
		]);

		const response = await fetchWorker("/api/sprints/history?companyId=11111111-1111-1111-1111-111111111111");

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expectNotionCall(fetchMock, 0, "test-projects-data-source-id", {
			page_size: 100,
			filter: companyProjectsFilter,
		});
		expectNotionCall(fetchMock, 1, "test-sprints-data-source-id", {
			page_size: 25,
			filter: {
				and: [
					historyFilter,
					{
						or: [
							{
								property: "Project",
								relation: {
									contains: "33333333-3333-3333-3333-333333333333-1",
								},
							},
							{
								property: "Project",
								relation: {
									contains: "33333333-3333-3333-3333-333333333333-2",
								},
							},
						],
					},
				],
			},
			sorts: historySort,
		});
		expect(await response.json()).toEqual({
			data: [expectedSprint],
			count: 1,
			hasMore: false,
			nextCursor: null,
		});
	});

	it("combines Company project resolution with Sprint history date filters", async () => {
		const fetchMock = stubSequentialNotionFetch([
			{
				results: [{ id: "33333333-3333-3333-3333-333333333333" }],
				has_more: false,
				next_cursor: null,
			},
			{
				results: [fullSprintPage],
				has_more: false,
				next_cursor: null,
			},
		]);

		const response = await fetchWorker(
			"/api/sprints/history?companyId=11111111-1111-1111-1111-111111111111&from=2026-09-01&to=2026-09-30",
		);

		expect(response.status).toBe(200);
		expectNotionCall(fetchMock, 1, "test-sprints-data-source-id", {
			page_size: 25,
			filter: {
				and: [historyFilter, projectFilter, fromFilter, toFilter],
			},
			sorts: historySort,
		});
	});

	it("returns an empty Sprint history collection when a Company has no Projects", async () => {
		const fetchMock = stubSequentialNotionFetch([
			{
				results: [],
				has_more: false,
				next_cursor: null,
			},
		]);

		const response = await fetchWorker("/api/sprints/history?companyId=11111111-1111-1111-1111-111111111111");

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expectNotionCall(fetchMock, 0, "test-projects-data-source-id", {
			page_size: 100,
			filter: companyProjectsFilter,
		});
		expect(await response.json()).toEqual({
			data: [],
			count: 0,
			hasMore: false,
			nextCursor: null,
		});
	});

	it("paginates Company project resolution before querying Sprint history", async () => {
		const fetchMock = stubSequentialNotionFetch([
			{
				results: [{ id: "33333333-3333-3333-3333-333333333333-1" }],
				has_more: true,
				next_cursor: "next-project-cursor",
			},
			{
				results: [{ id: "33333333-3333-3333-3333-333333333333-2" }],
				has_more: false,
				next_cursor: null,
			},
			{
				results: [fullSprintPage],
				has_more: false,
				next_cursor: null,
			},
		]);

		const response = await fetchWorker("/api/sprints/history?companyId=11111111-1111-1111-1111-111111111111");

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expectNotionCall(fetchMock, 0, "test-projects-data-source-id", {
			page_size: 100,
			filter: companyProjectsFilter,
		});
		expectNotionCall(fetchMock, 1, "test-projects-data-source-id", {
			page_size: 100,
			filter: companyProjectsFilter,
			start_cursor: "next-project-cursor",
		});
		expectNotionCall(fetchMock, 2, "test-sprints-data-source-id", {
			page_size: 25,
			filter: {
				and: [
					historyFilter,
					{
						or: [
							{
								property: "Project",
								relation: {
									contains: "33333333-3333-3333-3333-333333333333-1",
								},
							},
							{
								property: "Project",
								relation: {
									contains: "33333333-3333-3333-3333-333333333333-2",
								},
							},
						],
					},
				],
			},
			sorts: historySort,
		});
	});

	it.each([
		["projectId", "/api/sprints/history?projectId=invalid"],
		["companyId", "/api/sprints/history?companyId=invalid"],
		["companyId", "/api/sprints/history?companyId=YOUR_COMPANY_PAGE_ID"],
	])(
		"returns 400 for invalid Sprint %s without calling Notion",
		async (parameter, path) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(fetchMock).not.toHaveBeenCalled();
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual(invalidParameterResponse(parameter));
		},
	);

	it("returns Sprint detail with all historical/current JIRAs and merged allocations", async () => {
		const fetchMock = stubSprintDetailFetch();

		const response = await fetchWorker(
			"/api/sprints/44444444-4444-4444-4444-444444444444",
		);
		const body = (await response.json()) as Record<string, any>;

		expect(response.status).toBe(200);
		expect(fetchMock.mock.calls[0]).toMatchObject([
			"https://api.notion.com/v1/pages/44444444-4444-4444-4444-444444444444",
			{
				method: "GET",
				headers: {
					Authorization: "Bearer test-notion-token",
					"Notion-Version": "2026-03-11",
					"Content-Type": "application/json",
				},
			},
		]);
		expect(body.sprint).toMatchObject({
			...expectedSprint,
			projects: [{ id: "33333333-3333-3333-3333-333333333333", name: "Work Tracker" }],
		});
		expect(body.jiras.map((jira: { jiraKey: string }) => jira.jiraKey)).toEqual([
			"CRI-1",
			"CRI-2",
			"CRI-3",
			"CRI-4",
		]);
		expect(body.jiras).toMatchObject([
			{
				jiraKey: "CRI-1",
				status: "Blocked",
				inActiveSprint: true,
				plannedDays: 2.5,
				allocationId: "allocation-cri-1",
				allocationNotes: "Carryover plan",
				allocationConflict: false,
				allocationCount: 1,
			},
			{
				jiraKey: "CRI-2",
				status: "Cancelled",
				plannedDays: 6,
				allocationConflict: false,
				allocationCount: 1,
			},
			{
				jiraKey: "CRI-3",
				status: "Done",
				plannedDays: 0,
				allocationConflict: false,
				allocationCount: 1,
			},
			{
				jiraKey: "CRI-4",
				status: "Future Status",
				plannedDays: null,
				allocationId: null,
				allocationNotes: "",
				allocationConflict: false,
				allocationCount: 0,
			},
		]);
		expect(body.count).toBe(4);
		expectPostedBody(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID, {
			page_size: 100,
			filter: {
				property: "Sprints",
				relation: {
					contains: "44444444-4444-4444-4444-444444444444",
				},
			},
		});
		expectPostedBody(fetchMock, testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID, {
			page_size: 100,
			filter: {
				property: "Sprint",
				relation: {
					contains: "44444444-4444-4444-4444-444444444444",
				},
			},
		});
	});

	it("paginates Sprint detail JIRA and Allocation queries", async () => {
		const fetchMock = stubSprintDetailFetch({
			jiraNextPage: [
				sprintDetailJiraPage(
					"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
					"CRI-5",
					"Done",
					false,
				),
			],
			allocationNextPage: [
				sprintDetailAllocationPage(
					"allocation-cri-5",
					"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
					1,
				),
			],
		});

		const response = await fetchWorker(
			"/api/sprints/44444444-4444-4444-4444-444444444444",
		);
		const body = (await response.json()) as Record<string, any>;

		expect(response.status).toBe(200);
		expect(body.jiras).toContainEqual(
			expect.objectContaining({
				jiraKey: "CRI-5",
				plannedDays: 1,
			}),
		);
		expect(postedBodies(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)[1]).toMatchObject({
			start_cursor: "next-jiras",
		});
		expect(
			postedBodies(fetchMock, testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)[1],
		).toMatchObject({
			start_cursor: "next-allocations",
		});
	});

	it("marks duplicate Sprint Allocations on Sprint detail JIRAs without choosing planned days", async () => {
		const fetchMock = stubSprintDetailFetch({
			allocations: [
				sprintDetailAllocationPage(
					"allocation-cri-1-a",
					"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
					2.5,
					"First duplicate",
				),
				sprintDetailAllocationPage(
					"allocation-cri-1-b",
					"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
					9,
					"Second duplicate",
				),
				sprintDetailAllocationPage(
					"allocation-cri-2",
					"cccccccc-cccc-cccc-cccc-cccccccccccc",
					6,
				),
			],
		});

		const response = await fetchWorker(
			"/api/sprints/44444444-4444-4444-4444-444444444444",
		);
		const body = (await response.json()) as Record<string, any>;

		expect(response.status).toBe(200);
		expect(body.jiras).toMatchObject([
			{
				jiraKey: "CRI-1",
				allocationId: null,
				plannedDays: null,
				allocationNotes: "",
				allocationConflict: true,
				allocationCount: 2,
			},
			{
				jiraKey: "CRI-2",
				allocationId: "allocation-cri-2",
				plannedDays: 6,
				allocationConflict: false,
				allocationCount: 1,
			},
			{
				jiraKey: "CRI-3",
				allocationId: null,
				plannedDays: null,
				allocationConflict: false,
				allocationCount: 0,
			},
			{
				jiraKey: "CRI-4",
				allocationId: null,
				plannedDays: null,
				allocationConflict: false,
				allocationCount: 0,
			},
		]);
		expectPostedBody(fetchMock, testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID, {
			page_size: 100,
			filter: {
				property: "Sprint",
				relation: {
					contains: "44444444-4444-4444-4444-444444444444",
				},
			},
		});
	});

	it("returns 400 for malformed Sprint detail IDs before calling Notion", async () => {
		const fetchMock = stubSprintDetailFetch();

		const response = await fetchWorker("/api/sprints/not-a-sprint-id");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual(invalidParameterResponse("sprintId"));
	});

	it("returns 404 when a Sprint detail page does not exist", async () => {
		const fetchMock = stubSprintDetailFetch({
			sprintResponse: new Response("not found", { status: 404 }),
		});

		const response = await fetchWorker(
			"/api/sprints/44444444-4444-4444-4444-444444444444",
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Sprint not found",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("lets unknown nested Sprint subpaths fall through to the main Worker 404", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/sprints/random/extra");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("returns null from the Sprint route handler for unknown Sprint subpaths", async () => {
		const response = await handleSprintRoutes(
			new IncomingRequest("http://example.com/api/sprints/random/extra"),
			new URL("http://example.com/api/sprints/random/extra"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});
