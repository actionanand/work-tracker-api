import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleWorkLogRoutes } from "../src/features/work-logs/work-log.routes";
import worker from "../src/index";
import type { Env } from "../src/shared/env";
import {
	createAuthHeaders,
	createTestRateLimiter,
	TEST_AUTH_JWT_SECRET,
	TEST_AUTH_PASSWORD_HASH,
	TEST_AUTH_PASSWORD_ITERATIONS,
	TEST_AUTH_PASSWORD_SALT,
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
	AUTH_RATE_LIMITER: createTestRateLimiter(),
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
};

const projectId = "33333333-3333-3333-3333-333333333333";
const compactProjectId = "33333333333333333333333333333333";
const jiraId = "55555555-5555-5555-5555-555555555555";

const dateSort = [{ property: "Date", direction: "descending" }];

const fromFilter = {
	property: "Date",
	date: {
		on_or_after: "2026-09-01",
	},
};

const toFilter = {
	property: "Date",
	date: {
		on_or_before: "2026-09-30",
	},
};

const projectFilter = {
	property: "Project",
	relation: {
		contains: projectId,
	},
};

const jiraFilter = {
	property: "JIRAs",
	relation: {
		contains: jiraId,
	},
};

const categoryFilter = {
	property: "Category",
	select: {
		equals: "Office Work",
	},
};

const typeFilter = {
	property: "Type",
	select: {
		equals: "Meeting",
	},
};

const workModeFilter = {
	property: "Work Mode",
	select: {
		equals: "WFO (Office)",
	},
};

const appraisalFilter = {
	property: "Appraisal",
	checkbox: {
		equals: true,
	},
};

const routeCases = [
	{
		path: "/api/work-logs",
		expectedBody: {
			page_size: 25,
			sorts: dateSort,
		},
	},
	{
		path: "/api/work-logs/appraisal",
		expectedBody: {
			page_size: 25,
			filter: appraisalFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/work-logs?from=2026-09-01",
		expectedBody: {
			page_size: 25,
			filter: fromFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/work-logs?to=2026-09-30",
		expectedBody: {
			page_size: 25,
			filter: toFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/work-logs?from=2026-09-01&to=2026-09-30",
		expectedBody: {
			page_size: 25,
			filter: {
				and: [fromFilter, toFilter],
			},
			sorts: dateSort,
		},
	},
	{
		path: `/api/work-logs?projectId=${projectId}`,
		expectedBody: {
			page_size: 25,
			filter: projectFilter,
			sorts: dateSort,
		},
	},
	{
		path: `/api/work-logs?projectId=${compactProjectId}`,
		expectedBody: {
			page_size: 25,
			filter: projectFilter,
			sorts: dateSort,
		},
	},
	{
		path: `/api/work-logs?jiraId=${jiraId}`,
		expectedBody: {
			page_size: 25,
			filter: jiraFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/work-logs?category=Office%20Work",
		expectedBody: {
			page_size: 25,
			filter: categoryFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/work-logs?type=Meeting",
		expectedBody: {
			page_size: 25,
			filter: typeFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/work-logs?workMode=WFO%20(Office)",
		expectedBody: {
			page_size: 25,
			filter: workModeFilter,
			sorts: dateSort,
		},
	},
	{
		path: `/api/work-logs?from=2026-09-01&to=2026-09-30&projectId=${projectId}&jiraId=${jiraId}&category=Office%20Work&type=Meeting&workMode=WFO%20(Office)`,
		expectedBody: {
			page_size: 25,
			filter: {
				and: [
					fromFilter,
					toFilter,
					projectFilter,
					jiraFilter,
					categoryFilter,
					typeFilter,
					workModeFilter,
				],
			},
			sorts: dateSort,
		},
	},
] as const;

const fullWorkLogPage = {
	id: "work-log-id",
	created_time: "2026-09-01T08:00:00.000Z",
	last_edited_time: "2026-09-01T09:00:00.000Z",
	properties: {
		Update: {
			title: [{ plain_text: "  Daily update  " }],
		},
		Date: {
			date: { start: "2026-09-01" },
		},
		Category: {
			select: { name: " Office Work " },
		},
		Project: {
			relation: [{ id: projectId }],
		},
		Company: {
			rollup: {
				type: "array",
				array: [
					{
						type: "relation",
						relation: [{ id: "11111111-1111-1111-1111-111111111111" }],
					},
				],
			},
		},
		Team: {
			rollup: {
				type: "array",
				array: [
					{
						type: "relation",
						relation: [{ id: "22222222-2222-2222-2222-222222222222" }],
					},
				],
			},
		},
		Type: {
			select: { name: " Meeting " },
		},
		JIRAs: {
			relation: [{ id: jiraId }],
		},
		"Jira Status": {
			rollup: {
				type: "array",
				array: [
					{
						type: "status",
						status: { name: " Blocked " },
					},
					{
						type: "select",
						select: { name: "Done" },
					},
				],
			},
		},
		Sprints: {
			rollup: {
				type: "array",
				array: [
					{
						type: "relation",
						relation: [{ id: "44444444-4444-4444-4444-444444444444" }],
					},
				],
			},
		},
		"Spillover Count": {
			rollup: {
				type: "array",
				array: [
					{
						type: "number",
						number: 2,
					},
					{
						type: "formula",
						formula: {
							type: "number",
							number: 1,
						},
					},
				],
			},
		},
		Comment: {
			rich_text: [{ plain_text: "  Built endpoint  " }],
		},
		"Went Wrong": {
			rich_text: [{ plain_text: "  Blocked by review  " }],
		},
		"Work Mode": {
			select: { name: " WFO (Office) " },
		},
		Appraisal: {
			checkbox: true,
		},
	},
};

const defaultWorkLogPage = {
	id: "default-work-log-id",
	created_time: "2026-09-02T08:00:00.000Z",
	last_edited_time: "2026-09-02T09:00:00.000Z",
	properties: {},
};

const expectedWorkLog = {
	id: "work-log-id",
	createdTime: "2026-09-01T08:00:00.000Z",
	lastEditedTime: "2026-09-01T09:00:00.000Z",
	update: "Daily update",
	date: "2026-09-01",
	category: "Office Work",
	type: "Meeting",
	workMode: "WFO (Office)",
	comment: "Built endpoint",
	wentWrong: "Blocked by review",
	appraisal: true,
	projectIds: [projectId],
	jiraIds: [jiraId],
	companyIds: ["11111111-1111-1111-1111-111111111111"],
	teamIds: ["22222222-2222-2222-2222-222222222222"],
	jiraStatuses: ["Blocked", "Done"],
	sprintIds: ["44444444-4444-4444-4444-444444444444"],
	spilloverCount: 3,
};

const expectedDefaultWorkLog = {
	id: "default-work-log-id",
	createdTime: "2026-09-02T08:00:00.000Z",
	lastEditedTime: "2026-09-02T09:00:00.000Z",
	update: "",
	date: null,
	category: null,
	type: null,
	workMode: null,
	comment: "",
	wentWrong: "",
	appraisal: false,
	projectIds: [],
	jiraIds: [],
	companyIds: [],
	teamIds: [],
	jiraStatuses: [],
	sprintIds: [],
	spilloverCount: 0,
};

const invalidParameterResponse = (parameter: string) => ({
	error: parameter === "from" || parameter === "to"
		? "Invalid date query parameter"
		: "Invalid query parameter",
	parameter,
	...(parameter === "from" || parameter === "to"
		? { expectedFormat: "YYYY-MM-DD" }
		: { message: "Expected a valid Notion page ID" }),
});

function stubNotionFetch() {
	const fetchMock = vi.fn().mockResolvedValue(
		Response.json({
			results: [fullWorkLogPage, defaultWorkLogPage],
			has_more: false,
			next_cursor: null,
		}),
	);

	vi.stubGlobal("fetch", fetchMock);

	return fetchMock;
}

function stubNotionFetchResponse(responseBody: unknown, init?: ResponseInit) {
	const fetchMock = vi.fn().mockResolvedValue(Response.json(responseBody, init));

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
		"https://api.notion.com/v1/data_sources/test-work-logs-data-source-id/query",
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

describe("Work Log API routes", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(routeCases)(
		"queries Notion and maps Work Logs for $path",
		async ({ path, expectedBody }) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(response.status).toBe(200);
			expectNotionRequest(fetchMock, expectedBody);
			expect(await response.json()).toEqual({
				data: [expectedWorkLog, expectedDefaultWorkLog],
				count: 2,
				hasMore: false,
				nextCursor: null,
			});
		},
	);

	it.each([
		["projectId", "/api/work-logs?projectId=invalid"],
		["jiraId", "/api/work-logs?jiraId=invalid"],
		["from", "/api/work-logs?from=2026-99-99"],
		["to", "/api/work-logs?to=not-a-date"],
	])(
		"returns 400 for invalid Work Log %s without calling Notion",
		async (parameter, path) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(fetchMock).not.toHaveBeenCalled();
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual(invalidParameterResponse(parameter));
		},
	);

	it("ignores empty select query parameters consistently", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/work-logs?category=%20&type=&workMode=");

		expect(response.status).toBe(200);
		expectNotionRequest(fetchMock, {
			page_size: 25,
			sorts: dateSort,
		});
	});

	it("sends pagination with Work Log date filters", async () => {
		const fetchMock = stubNotionFetchResponse({
			results: [fullWorkLogPage],
			has_more: true,
			next_cursor: "cursor-next",
		});

		const response = await fetchWorker(
			"/api/work-logs?from=2026-09-01&to=2026-09-30&pageSize=10&cursor=cursor-2",
		);

		expect(response.status).toBe(200);
		expectNotionRequest(fetchMock, {
			page_size: 10,
			start_cursor: "cursor-2",
			filter: {
				and: [fromFilter, toFilter],
			},
			sorts: dateSort,
		});
		expect(await response.json()).toEqual({
			data: [expectedWorkLog],
			count: 1,
			hasMore: true,
			nextCursor: "cursor-next",
		});
	});

	it("returns 400 for invalid pagination cursor rejected by Notion", async () => {
		const fetchMock = stubNotionFetchResponse(
			{
				message: "Invalid start_cursor",
			},
			{
				status: 400,
			},
		);

		const response = await fetchWorker("/api/work-logs?cursor=stale-cursor");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid pagination cursor",
		});
	});

	it("lets unknown Work Log subpaths fall through to the main Worker 404", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/work-logs/random");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("returns null from the Work Log route handler for unknown subpaths", async () => {
		const response = await handleWorkLogRoutes(
			new IncomingRequest("http://example.com/api/work-logs/random"),
			new URL("http://example.com/api/work-logs/random"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});
