import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/shared/env";
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
};

const companyId = "11111111-1111-1111-1111-111111111111";
const teamId = "22222222-2222-2222-2222-222222222222";
const compactProjectId = "33333333333333333333333333333333";
const projectId = "33333333-3333-3333-3333-333333333333";
const jiraId = "55555555-5555-5555-5555-555555555555";
const workLogPageId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const otherDataSourceId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

async function fetchWorker(
	path: string,
	init: RequestInit = {},
): Promise<Response> {
	const authHeaders = new Headers(await createAuthHeaders(testEnv));
	const headers = new Headers(init.headers);

	for (const [key, value] of authHeaders) {
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

function schemaResponse(properties: Record<string, unknown>) {
	return Response.json({ properties });
}

function selectSchema(idsByName: Record<string, string>) {
	return {
		type: "select",
		select: {
			options: Object.entries(idsByName).map(([name, id]) => ({
				id,
				name,
				color: "default",
			})),
		},
	};
}

function relationSchema(dataSourceId: string) {
	return {
		type: "relation",
		relation: { data_source_id: dataSourceId },
	};
}

function workLogPage() {
	return {
		id: "work-log-id",
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		properties: {
			Update: { title: [{ plain_text: "Daily update" }] },
			Date: { date: { start: "2026-09-01" } },
			Category: { select: { name: "Office Work" } },
			Type: { select: { name: "Meeting" } },
			"Work Mode": { select: { name: "WFO (Office)" } },
			Project: { relation: [{ id: projectId }] },
			JIRAs: { relation: [{ id: jiraId }] },
			Comment: { rich_text: [{ plain_text: "Built endpoint" }] },
			"Went Wrong": { rich_text: [] },
			Appraisal: { checkbox: true },
		},
	};
}

function feedbackPage() {
	return {
		id: "feedback-id",
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		properties: {
			Feedback: { title: [{ plain_text: "Useful feedback" }] },
			Date: { date: { start: "2026-09-02" } },
			"Feedback From": { rich_text: [{ plain_text: "Priya" }] },
			"Person Type": { select: { name: "Manager" } },
			Context: { select: { name: "Weekly Update" } },
			"Feedback Type": { select: { name: "Positive" } },
			Company: { relation: [{ id: companyId }] },
			Team: { relation: [{ id: teamId }] },
			"Work Type": {
				rollup: {
					type: "array",
					array: [{ type: "select", select: { name: "Office Work" } }],
				},
			},
			Details: { rich_text: [] },
			"Action / Follow-up": { rich_text: [] },
		},
	};
}

function workLinkPage() {
	return {
		id: "work-link-id",
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		properties: {
			Link: { title: [{ plain_text: "GitHub Runbook" }] },
			Type: { select: { name: "Documentation" } },
			URL: { url: "https://github.com/example/work-tracker" },
			Company: { relation: [{ id: companyId }] },
			Project: { relation: [{ id: projectId }] },
			Notes: { rich_text: [{ plain_text: "Deployment notes" }] },
			Active: { checkbox: true },
		},
	};
}

function jiraPage() {
	return {
		id: "jira-page-id",
		created_time: "2026-09-01T10:00:00.000Z",
		last_edited_time: "2026-09-02T10:00:00.000Z",
		properties: {
			"JIRA Key": { title: [{ plain_text: "ABC-123" }] },
			Summary: { rich_text: [{ plain_text: "Fix API response" }] },
			Status: { status: { name: "Cancelled" } },
			Tags: { multi_select: [{ name: "api" }] },
			Appraisal: { checkbox: false },
			Spillover: { formula: { boolean: false } },
			"Spillover Count": { formula: { number: 0 } },
			"Spillover Reason": { rich_text: [] },
			"In Active Sprint": { formula: { boolean: true } },
			"Demo Required": { checkbox: false },
			"Demoed Date": { date: null },
			"Demo Notes": { rich_text: [] },
			Sprints: { relation: [] },
			Project: { relation: [] },
			"Blocked By": { relation: [] },
			"Release Items": { relation: [] },
		},
	};
}

function queryBody(fetchMock: ReturnType<typeof vi.fn>, dataSourceId: string) {
	const call = fetchMock.mock.calls.find(([url]) =>
		String(url).includes(`/data_sources/${dataSourceId}/query`),
	);

	if (!call) {
		throw new Error(`No query call for ${dataSourceId}`);
	}

	return JSON.parse(String(call[1]?.body));
}

describe("QUERY, write, and metadata API support", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each([
		["/api/work-logs", "GET, QUERY, POST, OPTIONS"],
		["/api/feedback", "GET, QUERY, POST, OPTIONS"],
		["/api/work-links", "GET, QUERY, POST, OPTIONS"],
		["/api/jiras", "GET, QUERY, OPTIONS"],
	])(
		"advertises accurate QUERY support on CORS preflight for %s",
		async (path, allow) => {
			const response = await fetchWorker(path, { method: "OPTIONS" });

			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
				"GET, QUERY, POST, PATCH, DELETE, OPTIONS",
			);
			expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
				"Accept-Query",
			);
			expect(response.headers.get("Allow")).toBe(allow);
			expect(response.headers.get("Accept-Query")).toBe("application/json");
		},
	);

	it.each([
		"/api/work-logs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		"/api/feedback/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		"/api/work-links/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
	])("advertises PATCH only on item preflight for %s", async (path) => {
		const response = await fetchWorker(path, { method: "OPTIONS" });

		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
			"GET, QUERY, POST, PATCH, DELETE, OPTIONS",
		);
		expect(response.headers.get("Allow")).toBe("PATCH, OPTIONS");
		expect(response.headers.get("Accept-Query")).toBeNull();
	});

	it("serves Work Log metadata from the live Notion data source schema", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			schemaResponse({
				Update: { type: "title" },
				Category: selectSchema({ "Office Work": "category-office" }),
				Project: relationSchema(testEnv.PROJECTS_DATA_SOURCE_ID),
				JIRAs: relationSchema(testEnv.JIRAS_DATA_SOURCE_ID),
				Sprints: { type: "rollup" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker("/api/work-logs/meta");

		expect(response.status).toBe(200);
		expect(response.headers.get("Accept-Query")).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.notion.com/v1/data_sources/test-work-logs-data-source-id",
			expect.objectContaining({ method: "GET" }),
		);
		expect(await response.json()).toMatchObject({
			resource: "work-logs",
			fields: expect.arrayContaining([
				{
					key: "categoryOptionId",
					label: "Category",
					type: "select",
					writable: true,
					options: [
						{
							id: "category-office",
							name: "Office Work",
							color: "default",
						},
					],
				},
				{
					key: "sprintIds",
					label: "Sprints",
					type: "rollup",
					writable: false,
				},
			]),
		});
	});

	it.each([
		["/api/feedback/meta", testEnv.FEEDBACK_DATA_SOURCE_ID],
		["/api/work-links/meta", testEnv.WORK_LINKS_DATA_SOURCE_ID],
	])("does not advertise QUERY on metadata response for %s", async (path, dataSourceId) => {
		const fetchMock = vi.fn().mockResolvedValue(schemaResponse({}));
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(path);

		expect(response.status).toBe(200);
		expect(response.headers.get("Accept-Query")).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(
			`https://api.notion.com/v1/data_sources/${dataSourceId}`,
			expect.objectContaining({ method: "GET" }),
		);
	});

	it.each([
		["GET", "/api/work-logs", testEnv.WORK_LOGS_DATA_SOURCE_ID, workLogPage()],
		["QUERY", "/api/work-logs", testEnv.WORK_LOGS_DATA_SOURCE_ID, workLogPage()],
		["GET", "/api/feedback", testEnv.FEEDBACK_DATA_SOURCE_ID, feedbackPage()],
		["QUERY", "/api/feedback", testEnv.FEEDBACK_DATA_SOURCE_ID, feedbackPage()],
		["GET", "/api/work-links", testEnv.WORK_LINKS_DATA_SOURCE_ID, workLinkPage()],
		["QUERY", "/api/work-links", testEnv.WORK_LINKS_DATA_SOURCE_ID, workLinkPage()],
		["GET", "/api/jiras", testEnv.JIRAS_DATA_SOURCE_ID, jiraPage()],
		["QUERY", "/api/jiras", testEnv.JIRAS_DATA_SOURCE_ID, jiraPage()],
	])(
		"advertises QUERY on %s %s collection responses",
		async (method, path, dataSourceId, page) => {
			const fetchMock = vi.fn().mockResolvedValue(
				Response.json({
					results: [page],
					has_more: false,
					next_cursor: null,
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			const response = await fetchWorker(
				path,
				method === "QUERY"
					? jsonRequest("QUERY", { filters: {} })
					: { method: "GET" },
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Accept-Query")).toBe("application/json");
			expect(queryBody(fetchMock, dataSourceId)).toMatchObject({
				page_size: 25,
			});
		},
	);

	it("translates Work Log QUERY filters into a Notion data-source query", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				results: [workLogPage()],
				has_more: true,
				next_cursor: "next-work-log",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/work-logs",
			jsonRequest("QUERY", {
				pageSize: 7,
				cursor: "cursor-1",
				filters: {
					from: "2026-09-01",
					projectIds: [compactProjectId],
					jiraIds: [jiraId],
					categories: ["Office Work", "Focus"],
					appraisal: false,
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(queryBody(fetchMock, testEnv.WORK_LOGS_DATA_SOURCE_ID)).toEqual({
			page_size: 7,
			start_cursor: "cursor-1",
			filter: {
				and: [
					{ property: "Date", date: { on_or_after: "2026-09-01" } },
					{
						or: [
							{ property: "Category", select: { equals: "Office Work" } },
							{ property: "Category", select: { equals: "Focus" } },
						],
					},
					{ property: "Project", relation: { contains: projectId } },
					{ property: "JIRAs", relation: { contains: jiraId } },
					{ property: "Appraisal", checkbox: { equals: false } },
				],
			},
			sorts: [{ property: "Date", direction: "descending" }],
		});
		expect(await response.json()).toMatchObject({
			count: 1,
			hasMore: true,
			nextCursor: "next-work-log",
		});
	});

	it("creates a Work Log through allow-listed Notion page properties", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith(`/data_sources/${testEnv.WORK_LOGS_DATA_SOURCE_ID}`)) {
				return Promise.resolve(
					schemaResponse({
						Category: selectSchema({ "Office Work": "category-office" }),
						Type: selectSchema({ Meeting: "type-meeting" }),
						"Work Mode": selectSchema({ "WFO (Office)": "mode-office" }),
					}),
				);
			}

			if (url.endsWith("/v1/pages") && init?.method === "POST") {
				return Promise.resolve(Response.json(workLogPage()));
			}

			return Promise.resolve(Response.json({ results: [] }));
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/work-logs",
			jsonRequest("POST", {
				update: "Daily update",
				date: "2026-09-01",
				categoryOptionId: "category-office",
				typeOptionId: "type-meeting",
				workModeOptionId: "mode-office",
				projectId,
				jiraIds: [jiraId],
				comment: "Built endpoint",
				appraisal: true,
			}),
		);

		const createCall = fetchMock.mock.calls.find(
			([url, init]) => String(url).endsWith("/v1/pages") && init?.method === "POST",
		);

		expect(response.status).toBe(201);
		expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
			parent: { data_source_id: testEnv.WORK_LOGS_DATA_SOURCE_ID },
			properties: {
				Update: { title: [{ text: { content: "Daily update" } }] },
				Date: { date: { start: "2026-09-01" } },
				Category: { select: { id: "category-office" } },
				Type: { select: { id: "type-meeting" } },
				"Work Mode": { select: { id: "mode-office" } },
				Project: { relation: [{ id: projectId }] },
				JIRAs: { relation: [{ id: jiraId }] },
				Comment: { rich_text: [{ text: { content: "Built endpoint" } }] },
				Appraisal: { checkbox: true },
			},
		});
		expect(await response.json()).toMatchObject({
			data: {
				id: "work-log-id",
				update: "Daily update",
			},
		});
	});

	it("rejects read-only Feedback write fields before calling Notion", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/feedback",
			jsonRequest("POST", {
				feedback: "Useful feedback",
				workType: "Office Work",
			}),
		);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid request",
			field: "workType",
			message: "Unknown or read-only field",
		});
	});

	it("creates Feedback without forwarding removed Project fields or Work Type", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith(`/data_sources/${testEnv.FEEDBACK_DATA_SOURCE_ID}`)) {
				return Promise.resolve(
					schemaResponse({
						"Person Type": selectSchema({ Manager: "person-manager" }),
						Context: selectSchema({ "Weekly Update": "context-weekly" }),
						"Feedback Type": selectSchema({ Positive: "feedback-positive" }),
					}),
				);
			}

			if (url.endsWith("/v1/pages") && init?.method === "POST") {
				return Promise.resolve(Response.json(feedbackPage()));
			}

			return Promise.resolve(Response.json({ results: [] }));
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/feedback",
			jsonRequest("POST", {
				feedback: "Useful feedback",
				date: "2026-09-02",
				personTypeOptionId: "person-manager",
				contextOptionId: "context-weekly",
				feedbackTypeOptionId: "feedback-positive",
				companyId,
				teamId,
			}),
		);

		const createCall = fetchMock.mock.calls.find(
			([url, init]) => String(url).endsWith("/v1/pages") && init?.method === "POST",
		);
		const body = JSON.parse(String(createCall?.[1]?.body));

		expect(response.status).toBe(201);
		expect(body.properties).toEqual({
			Feedback: { title: [{ text: { content: "Useful feedback" } }] },
			Date: { date: { start: "2026-09-02" } },
			"Person Type": { select: { id: "person-manager" } },
			Context: { select: { id: "context-weekly" } },
			"Feedback Type": { select: { id: "feedback-positive" } },
			Company: { relation: [{ id: companyId }] },
			Team: { relation: [{ id: teamId }] },
		});
		expect(body.properties.Project).toBeUndefined();
		expect(body.properties["Work Type"]).toBeUndefined();
		expect(await response.json()).toMatchObject({
			data: {
				id: "feedback-id",
				workType: "Office Work",
				companyIds: [companyId],
				teamIds: [teamId],
			},
		});
	});

	it("rejects a Work Link PATCH when the page belongs to another data source", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith(`/v1/pages/${workLogPageId}`) && init?.method === "GET") {
				return Promise.resolve(
					Response.json({
						id: workLogPageId,
						parent: { data_source_id: otherDataSourceId },
						properties: {},
					}),
				);
			}

			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			`/api/work-links/${workLogPageId}`,
			jsonRequest("PATCH", { active: false }),
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Work Link not found" });
		expect(
			fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
		).toBe(false);
	});

	it("translates Work Link QUERY filters and validates URL writes", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				results: [workLinkPage()],
				has_more: false,
				next_cursor: null,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/work-links",
			jsonRequest("QUERY", {
				filters: {
					companyIds: [companyId],
					projectIds: [projectId],
					types: ["Documentation", "Runbook"],
					active: true,
					q: "github",
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(queryBody(fetchMock, testEnv.WORK_LINKS_DATA_SOURCE_ID)).toEqual({
			page_size: 25,
			filter: {
				and: [
					{ property: "Company", relation: { contains: companyId } },
					{ property: "Project", relation: { contains: projectId } },
					{
						or: [
							{ property: "Type", select: { equals: "Documentation" } },
							{ property: "Type", select: { equals: "Runbook" } },
						],
					},
					{ property: "Active", checkbox: { equals: true } },
					{ property: "Link", title: { contains: "github" } },
				],
			},
			sorts: [{ property: "Link", direction: "ascending" }],
		});

		const invalidFetchMock = vi.fn((url: string) => {
			if (url.endsWith(`/data_sources/${testEnv.WORK_LINKS_DATA_SOURCE_ID}`)) {
				return Promise.resolve(
					schemaResponse({
						Type: selectSchema({ Documentation: "type-docs" }),
					}),
				);
			}

			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", invalidFetchMock);

		const invalidResponse = await fetchWorker(
			"/api/work-links",
			jsonRequest("POST", {
				link: "Broken URL",
				url: "not-a-url",
			}),
		);

		expect(invalidResponse.status).toBe(400);
		expect(await invalidResponse.json()).toEqual({
			error: "Invalid request",
			field: "url",
			message: "Expected a valid URL",
		});
	});

	it("translates JIRA QUERY filters including Cancelled status", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				results: [jiraPage()],
				has_more: false,
				next_cursor: null,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/jiras",
			jsonRequest("QUERY", {
				filters: {
					statuses: ["In progress", "Cancelled"],
					tags: ["api", "ops"],
					inActiveSprint: true,
					q: "ABC",
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(queryBody(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)).toEqual({
			page_size: 25,
			filter: {
				and: [
					{
						or: [
							{ property: "Status", status: { equals: "In progress" } },
							{ property: "Status", status: { equals: "Cancelled" } },
						],
					},
					{
						or: [
							{ property: "Tags", multi_select: { contains: "api" } },
							{ property: "Tags", multi_select: { contains: "ops" } },
						],
					},
					{
						property: "In Active Sprint",
						formula: { checkbox: { equals: true } },
					},
					{
						or: [
							{ property: "JIRA Key", title: { contains: "ABC" } },
							{ property: "Summary", rich_text: { contains: "ABC" } },
						],
					},
				],
			},
		});
		expect(await response.json()).toMatchObject({
			data: [{ status: "Cancelled" }],
		});
	});

	it("rejects unknown QUERY filters before Notion is called", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/feedback",
			jsonRequest("QUERY", {
				filters: { projectIds: [projectId] },
			}),
		);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid request",
			field: "projectIds",
			message: "Unknown filter",
		});
	});
});
