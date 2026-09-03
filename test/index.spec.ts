import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleJiraRoutes } from "../src/features/jiras/jira.routes";
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
	spilloverReason: "Dependency",
	inActiveSprint: false,
	demoRequired: true,
	demoedDate: "2026-09-02",
	demoNotes: "Shown in sprint review",
	sprintIds: ["sprint-id"],
	projectIds: ["project-id"],
	blockedByIds: ["blocked-by-id"],
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
		"Spillover Reason": {
			rich_text: [{ plain_text: "Dependency" }],
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
		"Blocked By": {
			relation: [{ id: "blocked-by-id" }],
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

async function fetchWorker(path: string): Promise<Response> {
	const request = new IncomingRequest(`http://example.com${path}`, {
		headers: await createAuthHeaders(testEnv),
	});
	const ctx = createExecutionContext();

	const response = await worker.fetch(request, testEnv, ctx);

	await waitOnExecutionContext(ctx);

	return response;
}

function expectNotionPostBody(
	fetchMock: ReturnType<typeof vi.fn>,
	expectedFilter: unknown,
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
			page_size: 100,
			filter: expectedFilter,
		});
	} else {
		expect(body).toEqual({
			page_size: 100,
		});
	}
}

function expectJiraKeyLookupBody(fetchMock: ReturnType<typeof vi.fn>, jiraKey: string) {
	expectNotionPostBody(fetchMock, {
		property: "JIRA Key",
		title: {
			equals: jiraKey,
		},
	});
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
