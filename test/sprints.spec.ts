import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSprintRoutes } from "../src/features/sprints/sprint.routes";
import worker from "../src/index";
import type { Env } from "../src/shared/env";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const testEnv: Env = {
	NOTION_TOKEN: "test-notion-token",
	JIRAS_DATA_SOURCE_ID: "test-jiras-data-source-id",
	SPRINTS_DATA_SOURCE_ID: "test-sprints-data-source-id",
	SPRINT_ALLOCATIONS_DATA_SOURCE_ID: "test-sprint-allocations-data-source-id",
	PROJECTS_DATA_SOURCE_ID: "test-projects-data-source-id",
	COMPANIES_DATA_SOURCE_ID: "test-companies-data-source-id",
	TEAMS_DATA_SOURCE_ID: "test-teams-data-source-id",
	WORK_LOGS_DATA_SOURCE_ID: "test-work-logs-data-source-id",
	RELEASE_ITEMS_DATA_SOURCE_ID: "test-release-items-data-source-id",
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
			page_size: 100,
		},
	},
	{
		path: "/api/sprints/active",
		expectedBody: {
			page_size: 100,
			filter: activeFilter,
		},
	},
	{
		path: "/api/sprints/history",
		expectedBody: {
			page_size: 100,
			filter: historyFilter,
			sorts: historySort,
		},
	},
	{
		path: "/api/sprints?projectId=33333333-3333-3333-3333-333333333333",
		expectedBody: {
			page_size: 100,
			filter: projectFilter,
		},
	},
	{
		path: "/api/sprints?from=2026-09-01&to=2026-09-30",
		expectedBody: {
			page_size: 100,
			filter: {
				and: [fromFilter, toFilter],
			},
		},
	},
	{
		path: "/api/sprints/history?projectId=33333333-3333-3333-3333-333333333333&from=2026-09-01&to=2026-09-30",
		expectedBody: {
			page_size: 100,
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

function stubSequentialNotionFetch(responses: unknown[]) {
	const fetchMock = vi.fn();

	for (const response of responses) {
		fetchMock.mockResolvedValueOnce(Response.json(response));
	}

	vi.stubGlobal("fetch", fetchMock);

	return fetchMock;
}

async function fetchWorker(path: string): Promise<Response> {
	const request = new IncomingRequest(`http://example.com${path}`);
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
			page_size: 100,
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
			page_size: 100,
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
			page_size: 100,
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

	it("lets unknown Sprint subpaths fall through to the main Worker 404", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/sprints/random");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("returns null from the Sprint route handler for unknown Sprint subpaths", async () => {
		const response = await handleSprintRoutes(
			new IncomingRequest("http://example.com/api/sprints/random"),
			new URL("http://example.com/api/sprints/random"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});

