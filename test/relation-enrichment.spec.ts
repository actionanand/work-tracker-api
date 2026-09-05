import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const companyId = "11111111-1111-1111-1111-111111111111";
const missingCompanyId = "11111111-1111-1111-1111-111111111112";
const teamId = "22222222-2222-2222-2222-222222222222";
const projectId = "33333333-3333-3333-3333-333333333333";
const sprintId = "44444444-4444-4444-4444-444444444444";
const jiraId = "55555555-5555-5555-5555-555555555555";
const blockedById = "66666666-6666-6666-6666-666666666666";

const companyRef = { id: companyId, name: "Clarivate" };
const teamRef = { id: teamId, name: "Jupiter" };
const projectRef = { id: projectId, name: "Work Tracker" };
const sprintRef = { id: sprintId, name: "Sprint 42" };
const jiraRef = { id: jiraId, key: "CRI-1234", summary: "Build API" };
const blockedByRef = { id: blockedById, key: "CRI-1000", summary: "Blocked task" };

function companyPage(id = companyId) {
	return {
		id,
		properties: {
			Company: { title: [{ plain_text: " Clarivate " }] },
		},
	};
}

function teamPage() {
	return {
		id: teamId,
		properties: {
			Team: { title: [{ plain_text: " Jupiter " }] },
		},
	};
}

function projectPage(id = projectId, includeRelations = false) {
	return {
		id,
		properties: {
			Project: { title: [{ plain_text: " Work Tracker " }] },
			Active: { checkbox: true },
			Company: {
				relation: includeRelations
					? [{ id: companyId }, { id: companyId }, { id: missingCompanyId }]
					: [{ id: companyId }],
			},
			Team: { relation: includeRelations ? [{ id: teamId }, { id: teamId }] : [] },
		},
	};
}

function sprintPage() {
	return {
		id: sprintId,
		properties: {
			Sprint: { title: [{ plain_text: "Sprint 42" }] },
			Project: { relation: [{ id: projectId }] },
		},
	};
}

function jiraPage(id = jiraId, key = "CRI-1234", summary = "Build API") {
	return {
		id,
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		properties: {
			"JIRA Key": { title: [{ plain_text: key }] },
			Summary: { rich_text: [{ plain_text: summary }] },
			Project: { relation: [{ id: projectId }] },
			Sprints: { relation: [{ id: sprintId }] },
			"Blocked By": { relation: id === jiraId ? [{ id: blockedById }] : [] },
		},
	};
}

function workLogPage() {
	return {
		id: "work-log-id",
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		properties: {
			Update: { title: [{ plain_text: "Daily update" }] },
			Company: {
				rollup: {
					type: "array",
					array: [{ type: "relation", relation: [{ id: companyId }] }],
				},
			},
			Team: {
				rollup: {
					type: "array",
					array: [{ type: "relation", relation: [{ id: teamId }] }],
				},
			},
			Project: { relation: [{ id: projectId }] },
			JIRAs: { relation: [{ id: jiraId }] },
			Sprints: {
				rollup: {
					type: "array",
					array: [{ type: "relation", relation: [{ id: sprintId }] }],
				},
			},
		},
	};
}

function releasePage() {
	return {
		id: "release-id",
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		properties: {
			"Release Items": { title: [{ plain_text: "Release item" }] },
			JIRAs: { relation: [{ id: jiraId }] },
			Sprints: {
				rollup: {
					type: "array",
					array: [{ type: "relation", relation: [{ id: sprintId }] }],
				},
			},
		},
	};
}

function feedbackPage() {
	return {
		id: "feedback-id",
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		properties: {
			Feedback: { title: [{ plain_text: "Good work" }] },
			Company: { relation: [{ id: companyId }] },
			Project: { relation: [{ id: projectId }] },
			Team: { relation: [{ id: teamId }] },
		},
	};
}

function workLinkPage() {
	return {
		id: "work-link-id",
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		properties: {
			Link: { title: [{ plain_text: "GitHub" }] },
			URL: { url: "https://github.com/example/work-tracker" },
			Company: { relation: [{ id: companyId }] },
			Project: { relation: [{ id: projectId }] },
		},
	};
}

const emptyResponse = {
	results: [],
	has_more: false,
	next_cursor: null,
};

function response(results: unknown[], nextCursor: string | null = null) {
	return Response.json({
		results,
		has_more: nextCursor !== null,
		next_cursor: nextCursor,
	});
}

function stubCatalogFetch(primaryDataSourceId: string, primaryResults: unknown[]) {
	const fetchMock = vi.fn((url: string, init: RequestInit) => {
		const body = JSON.parse(String(init.body));
		const dataSourceId = url.match(/\/data_sources\/([^/]+)\/query$/)?.[1];

		if (dataSourceId === primaryDataSourceId && body.filter) {
			return Promise.resolve(response(primaryResults));
		}

		if (
			dataSourceId === primaryDataSourceId &&
			dataSourceId !== testEnv.JIRAS_DATA_SOURCE_ID &&
			!body.start_cursor
		) {
			return Promise.resolve(response(primaryResults));
		}

		if (dataSourceId === testEnv.COMPANIES_DATA_SOURCE_ID) {
			return Promise.resolve(
				body.start_cursor
					? response([companyPage()], null)
					: response([], "next-company-page"),
			);
		}

		if (dataSourceId === testEnv.TEAMS_DATA_SOURCE_ID) {
			return Promise.resolve(response([teamPage()]));
		}

		if (dataSourceId === testEnv.PROJECTS_DATA_SOURCE_ID) {
			return Promise.resolve(response([projectPage()]));
		}

		if (dataSourceId === testEnv.SPRINTS_DATA_SOURCE_ID) {
			return Promise.resolve(response([sprintPage()]));
		}

		if (dataSourceId === testEnv.JIRAS_DATA_SOURCE_ID) {
			return Promise.resolve(
				response([
					jiraPage(jiraId, " CRI-1234 ", " Build API "),
					jiraPage(blockedById, " CRI-1000 ", " Blocked task "),
				]),
			);
		}

		return Promise.resolve(Response.json(emptyResponse));
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

function callsFor(fetchMock: ReturnType<typeof vi.fn>, dataSourceId: string) {
	return fetchMock.mock.calls.filter(([url]) =>
		String(url).includes(`/data_sources/${dataSourceId}/query`),
	);
}

describe("relation enrichment", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("keeps existing responses unchanged when include=relations is absent", async () => {
		const fetchMock = stubCatalogFetch(testEnv.PROJECTS_DATA_SOURCE_ID, [
			projectPage(projectId, true),
		]);

		const response = await fetchWorker("/api/projects");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			data: [
				{
					id: projectId,
					project: "Work Tracker",
					active: true,
					companyIds: [companyId, companyId, missingCompanyId],
					teamIds: [teamId, teamId],
				},
			],
			count: 1,
			hasMore: false,
			nextCursor: null,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("enriches Project company and team refs, dedupes catalog loads, paginates catalogs, and omits unresolved IDs", async () => {
		const fetchMock = stubCatalogFetch(testEnv.PROJECTS_DATA_SOURCE_ID, [
			projectPage(projectId, true),
		]);

		const response = await fetchWorker("/api/projects?include=relations");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			data: [
				{
					id: projectId,
					project: "Work Tracker",
					active: true,
					companyIds: [companyId, companyId, missingCompanyId],
					teamIds: [teamId, teamId],
					companies: [companyRef, companyRef],
					teams: [teamRef, teamRef],
				},
			],
			count: 1,
			hasMore: false,
			nextCursor: null,
		});
		expect(callsFor(fetchMock, testEnv.PROJECTS_DATA_SOURCE_ID)).toHaveLength(1);
		expect(callsFor(fetchMock, testEnv.COMPANIES_DATA_SOURCE_ID)).toHaveLength(2);
		expect(callsFor(fetchMock, testEnv.TEAMS_DATA_SOURCE_ID)).toHaveLength(1);
		expect(
			JSON.parse(String(callsFor(fetchMock, testEnv.COMPANIES_DATA_SOURCE_ID)[1][1].body)),
		).toMatchObject({ start_cursor: "next-company-page" });
	});

	it("enriches Sprint project refs", async () => {
		const fetchMock = stubCatalogFetch(testEnv.SPRINTS_DATA_SOURCE_ID, [sprintPage()]);

		const response = await fetchWorker("/api/sprints?include=relations");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			data: [
				{
					id: sprintId,
					projectIds: [projectId],
					projects: [projectRef],
				},
			],
		});
		expect(callsFor(fetchMock, testEnv.PROJECTS_DATA_SOURCE_ID)).toHaveLength(1);
		expect(callsFor(fetchMock, testEnv.COMPANIES_DATA_SOURCE_ID)).toHaveLength(0);
	});

	it("enriches JIRA by key with one-level project, sprint, and blockedBy refs", async () => {
		const fetchMock = stubCatalogFetch(testEnv.JIRAS_DATA_SOURCE_ID, [jiraPage()]);

		const response = await fetchWorker("/api/jiras/CRI-1234?include=relations");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			id: jiraId,
			projectIds: [projectId],
			sprintIds: [sprintId],
			blockedByIds: [blockedById],
			projects: [projectRef],
			sprints: [sprintRef],
			blockedBy: [blockedByRef],
		});
		expect(callsFor(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)).toHaveLength(2);
	});

	it("preserves pagination metadata when enriching a paged JIRA list", async () => {
		const secondJiraId = "77777777-7777-7777-7777-777777777777";
		let jiraCallCount = 0;
		const fetchMock = vi.fn((url: string, init: RequestInit) => {
			const dataSourceId = url.match(/\/data_sources\/([^/]+)\/query$/)?.[1];

			if (dataSourceId === testEnv.JIRAS_DATA_SOURCE_ID) {
				jiraCallCount += 1;

				return Promise.resolve(
					jiraCallCount === 1
						? response(
								[jiraPage(jiraId), jiraPage(secondJiraId, "CRI-5678", "Second")],
								"cursor-next",
							)
						: response([jiraPage(blockedById, "CRI-1000", "Blocked task")]),
				);
			}

			if (dataSourceId === testEnv.PROJECTS_DATA_SOURCE_ID) {
				return Promise.resolve(response([projectPage()]));
			}

			if (dataSourceId === testEnv.SPRINTS_DATA_SOURCE_ID) {
				return Promise.resolve(response([sprintPage()]));
			}

			return Promise.resolve(Response.json(emptyResponse));
		});
		vi.stubGlobal("fetch", fetchMock);

		const apiResponse = await fetchWorker(
			"/api/jiras/active?pageSize=2&cursor=cursor-1&include=relations",
		);
		const firstJiraBody = JSON.parse(
			String(callsFor(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)[0][1].body),
		);

		expect(apiResponse.status).toBe(200);
		expect(firstJiraBody).toMatchObject({
			page_size: 2,
			start_cursor: "cursor-1",
		});
		expect(await apiResponse.json()).toMatchObject({
			count: 2,
			hasMore: true,
			nextCursor: "cursor-next",
			data: [
				{
					id: jiraId,
					projects: [projectRef],
					sprints: [sprintRef],
					blockedBy: [blockedByRef],
				},
				{
					id: secondJiraId,
					projects: [projectRef],
					sprints: [sprintRef],
					blockedBy: [],
				},
			],
		});
	});

	it("enriches Work Logs with all shallow relation refs", async () => {
		const fetchMock = stubCatalogFetch(testEnv.WORK_LOGS_DATA_SOURCE_ID, [workLogPage()]);

		const response = await fetchWorker("/api/work-logs?include=relations");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			data: [
				{
					companyIds: [companyId],
					teamIds: [teamId],
					projectIds: [projectId],
					jiraIds: [jiraId],
					sprintIds: [sprintId],
					companies: [companyRef],
					teams: [teamRef],
					projects: [projectRef],
					jiras: [jiraRef],
					sprints: [sprintRef],
				},
			],
		});
		expect(callsFor(fetchMock, testEnv.COMPANIES_DATA_SOURCE_ID)).toHaveLength(2);
		expect(callsFor(fetchMock, testEnv.TEAMS_DATA_SOURCE_ID)).toHaveLength(1);
		expect(callsFor(fetchMock, testEnv.PROJECTS_DATA_SOURCE_ID)).toHaveLength(1);
		expect(callsFor(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)).toHaveLength(1);
		expect(callsFor(fetchMock, testEnv.SPRINTS_DATA_SOURCE_ID)).toHaveLength(1);
	});

	it("enriches Release Items with JIRA and Sprint refs", async () => {
		const fetchMock = stubCatalogFetch(testEnv.RELEASE_ITEMS_DATA_SOURCE_ID, [
			releasePage(),
		]);

		const response = await fetchWorker("/api/releases?include=relations");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			data: [
				{
					jiraIds: [jiraId],
					sprintIds: [sprintId],
					jiras: [jiraRef],
					sprints: [sprintRef],
				},
			],
		});
		expect(callsFor(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)).toHaveLength(1);
		expect(callsFor(fetchMock, testEnv.SPRINTS_DATA_SOURCE_ID)).toHaveLength(1);
		expect(callsFor(fetchMock, testEnv.COMPANIES_DATA_SOURCE_ID)).toHaveLength(0);
	});

	it("enriches Feedback with company, project, and team refs", async () => {
		const fetchMock = stubCatalogFetch(testEnv.FEEDBACK_DATA_SOURCE_ID, [feedbackPage()]);

		const response = await fetchWorker("/api/feedback?include=relations");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			data: [
				{
					companyIds: [companyId],
					projectIds: [projectId],
					teamIds: [teamId],
					companies: [companyRef],
					projects: [projectRef],
					teams: [teamRef],
				},
			],
		});
		expect(callsFor(fetchMock, testEnv.COMPANIES_DATA_SOURCE_ID)).toHaveLength(2);
		expect(callsFor(fetchMock, testEnv.PROJECTS_DATA_SOURCE_ID)).toHaveLength(1);
		expect(callsFor(fetchMock, testEnv.TEAMS_DATA_SOURCE_ID)).toHaveLength(1);
	});

	it("enriches Work Links only with company and project refs", async () => {
		const fetchMock = stubCatalogFetch(testEnv.WORK_LINKS_DATA_SOURCE_ID, [
			workLinkPage(),
		]);

		const response = await fetchWorker("/api/work-links?include=relations");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			data: [
				{
					url: "https://github.com/example/work-tracker",
					companyIds: [companyId],
					projectIds: [projectId],
					companies: [companyRef],
					projects: [projectRef],
				},
			],
		});
		expect(callsFor(fetchMock, testEnv.COMPANIES_DATA_SOURCE_ID)).toHaveLength(2);
		expect(callsFor(fetchMock, testEnv.PROJECTS_DATA_SOURCE_ID)).toHaveLength(1);
		expect(callsFor(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)).toHaveLength(0);
		expect(callsFor(fetchMock, testEnv.SPRINTS_DATA_SOURCE_ID)).toHaveLength(0);
		expect(callsFor(fetchMock, testEnv.TEAMS_DATA_SOURCE_ID)).toHaveLength(0);
		expect(fetchMock).not.toHaveBeenCalledWith(
			"https://github.com/example/work-tracker",
			expect.anything(),
		);
	});

	it("returns 400 for invalid include values without calling Notion", async () => {
		const fetchMock = stubCatalogFetch(testEnv.PROJECTS_DATA_SOURCE_ID, [
			projectPage(),
		]);

		const response = await fetchWorker("/api/projects?include=everything");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid query parameter",
			parameter: "include",
			message: "Supported value: relations",
		});
	});
});
