import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSprintAllocationRoutes } from "../src/features/sprint-allocations/sprint-allocation.routes";
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

const currentFilter = {
	property: "Sprint Active",
	rollup: {
		any: {
			checkbox: {
				equals: true,
			},
		},
	},
};

const sprintFilter = {
	property: "Sprint",
	relation: {
		contains: "44444444-4444-4444-4444-444444444444",
	},
};

const jiraFilter = {
	property: "JIRA",
	relation: {
		contains: "55555555-5555-5555-5555-555555555555",
	},
};

const invalidParameterResponse = (parameter: string) => ({
	error: "Invalid query parameter",
	parameter,
	message: "Expected a valid Notion page ID",
});

const routeCases = [
	{
		path: "/api/sprint-allocations",
		expectedBody: {
			page_size: 100,
		},
	},
	{
		path: "/api/sprint-allocations/current",
		expectedBody: {
			page_size: 100,
			filter: currentFilter,
		},
	},
	{
		path: "/api/sprint-allocations?sprintId=44444444-4444-4444-4444-444444444444",
		expectedBody: {
			page_size: 100,
			filter: sprintFilter,
		},
	},
	{
		path: "/api/sprint-allocations?jiraId=55555555-5555-5555-5555-555555555555",
		expectedBody: {
			page_size: 100,
			filter: jiraFilter,
		},
	},
	{
		path: "/api/sprint-allocations?sprintId=44444444-4444-4444-4444-444444444444&jiraId=55555555-5555-5555-5555-555555555555",
		expectedBody: {
			page_size: 100,
			filter: {
				and: [sprintFilter, jiraFilter],
			},
		},
	},
] as const;

const fullAllocationPage = {
	id: "allocation-page-id",
	properties: {
		Allocation: {
			title: [{ plain_text: "Sprint 42 - ABC-123" }],
		},
		Sprint: {
			relation: [{ id: "44444444-4444-4444-4444-444444444444" }],
		},
		JIRA: {
			relation: [{ id: "55555555-5555-5555-5555-555555555555" }],
		},
		"Planned Days": {
			number: 3,
		},
		Notes: {
			rich_text: [{ plain_text: "Backend work" }],
		},
		"Sprint Active": {
			rollup: {
				type: "array",
				array: [
					{
						type: "checkbox",
						checkbox: true,
					},
				],
			},
		},
	},
};

const directCheckboxRollupPage = {
	id: "direct-rollup-allocation-page-id",
	properties: {
		Allocation: {
			title: [{ plain_text: "Direct rollup" }],
		},
		"Planned Days": {
			number: null,
		},
		Notes: {
			rich_text: [],
		},
		"Sprint Active": {
			rollup: {
				type: "checkbox",
				checkbox: true,
			},
		},
	},
};

const defaultAllocationPage = {
	id: "default-allocation-page-id",
	properties: {
		"Sprint Active": {
			rollup: null,
		},
	},
};

const expectedAllocation = {
	id: "allocation-page-id",
	allocation: "Sprint 42 - ABC-123",
	plannedDays: 3,
	notes: "Backend work",
	sprintIds: ["44444444-4444-4444-4444-444444444444"],
	jiraIds: ["55555555-5555-5555-5555-555555555555"],
	sprintActive: true,
};

const expectedDirectCheckboxRollupAllocation = {
	id: "direct-rollup-allocation-page-id",
	allocation: "Direct rollup",
	plannedDays: 0,
	notes: "",
	sprintIds: [],
	jiraIds: [],
	sprintActive: true,
};

const expectedDefaultAllocation = {
	id: "default-allocation-page-id",
	allocation: "",
	plannedDays: 0,
	notes: "",
	sprintIds: [],
	jiraIds: [],
	sprintActive: false,
};

function stubNotionFetch() {
	const fetchMock = vi.fn().mockResolvedValue(
		Response.json({
			results: [
				fullAllocationPage,
				directCheckboxRollupPage,
				defaultAllocationPage,
			],
			has_more: false,
			next_cursor: null,
		}),
	);

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
		"https://api.notion.com/v1/data_sources/test-sprint-allocations-data-source-id/query",
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

describe("Sprint Allocation API routes", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(routeCases)(
		"queries Notion and maps sprint allocations for $path",
		async ({ path, expectedBody }) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(response.status).toBe(200);
			expectNotionRequest(fetchMock, expectedBody);
			expect(await response.json()).toEqual({
				data: [
					expectedAllocation,
					expectedDirectCheckboxRollupAllocation,
					expectedDefaultAllocation,
				],
				count: 3,
				hasMore: false,
				nextCursor: null,
			});
		},
	);

	it("lets unknown Sprint Allocation subpaths fall through to the main Worker 404", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/sprint-allocations/random");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it.each([
		["sprintId", "/api/sprint-allocations?sprintId=invalid"],
		["jiraId", "/api/sprint-allocations?jiraId=invalid-uuid"],
	])(
		"returns 400 for invalid Sprint Allocation %s without calling Notion",
		async (parameter, path) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(fetchMock).not.toHaveBeenCalled();
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual(invalidParameterResponse(parameter));
		},
	);

	it("returns null from the Sprint Allocation route handler for unknown subpaths", async () => {
		const response = await handleSprintAllocationRoutes(
			new IncomingRequest("http://example.com/api/sprint-allocations/random"),
			new URL("http://example.com/api/sprint-allocations/random"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});

