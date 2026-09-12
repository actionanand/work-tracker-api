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
	TODOS_DATA_SOURCE_ID: "test-todos-data-source-id",
	TASKS_DATA_SOURCE_ID: "test-tasks-data-source-id",
	MEMOS_DATA_SOURCE_ID: "test-memos-data-source-id",
	REFERENCE_LIBRARY_PAGE_ID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
};

const todoPageId = "11111111-1111-1111-1111-111111111111";
const taskPageId = "22222222-2222-2222-2222-222222222222";
const memoPageId = "33333333-3333-3333-3333-333333333333";
const companyId = "44444444-4444-4444-4444-444444444444";
const jiraId = "55555555-5555-5555-5555-555555555555";
const referencePageId = "66666666-6666-6666-6666-666666666666";

async function fetchWorker(path: string, init: RequestInit = {}): Promise<Response> {
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

function statusSchema(idsByName: Record<string, string>) {
	return {
		type: "status",
		status: {
			options: Object.entries(idsByName).map(([name, id]) => ({
				id,
				name,
				color: "default",
			})),
		},
	};
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

function multiSelectSchema(idsByName: Record<string, string>) {
	return {
		type: "multi_select",
		multi_select: {
			options: Object.entries(idsByName).map(([name, id]) => ({
				id,
				name,
				color: "default",
			})),
		},
	};
}

function todoPage(overrides: Record<string, unknown> = {}) {
	return {
		id: todoPageId,
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		parent: { data_source_id: testEnv.TODOS_DATA_SOURCE_ID },
		properties: {
			"To Do": { title: [{ plain_text: "Send update" }] },
			Status: { status: { name: "In progress" } },
			"Due Date": { date: { start: "2026-09-13" } },
			Notes: { rich_text: [{ plain_text: "Before standup" }] },
		},
		...overrides,
	};
}

function taskPage(overrides: Record<string, unknown> = {}) {
	return {
		id: taskPageId,
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		parent: { data_source_id: testEnv.TASKS_DATA_SOURCE_ID },
		properties: {
			Task: { title: [{ plain_text: "Follow up with team" }] },
			Status: { status: { name: "Not started" } },
			Priority: { select: { name: "High" } },
			Responsibility: { select: { name: "My Task" } },
			"Requested By": { rich_text: [{ plain_text: "Self" }] },
			"Requested By Type": { select: { name: "Self" } },
			"Assigned To": { rich_text: [{ plain_text: "Anand" }] },
			"Assigned To Type": { select: { name: "Self" } },
			"Due Date": { date: { start: "2026-09-14" } },
			"Follow-up Date": { date: null },
			"Completed Date": { date: null },
			Company: { relation: [{ id: companyId }] },
			JIRAs: { relation: [{ id: jiraId }] },
			Notes: { rich_text: [{ plain_text: "Ask for status" }] },
			"Outcome / Update": { rich_text: [] },
		},
		...overrides,
	};
}

function memoPage(overrides: Record<string, unknown> = {}) {
	return {
		id: memoPageId,
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		parent: { data_source_id: testEnv.MEMOS_DATA_SOURCE_ID },
		properties: {
			Memo: { title: [{ plain_text: "Architecture note" }] },
			Category: { select: { name: "Engineering" } },
			Tags: { multi_select: [{ name: "api" }, { name: "notion" }] },
			Pinned: { checkbox: true },
		},
		...overrides,
	};
}

function queryBody(fetchMock: ReturnType<typeof vi.fn>, dataSourceId: string) {
	const call = fetchMock.mock.calls.find(([url]) =>
		String(url).includes(`/data_sources/${dataSourceId}/query`),
	);

	if (!call) throw new Error(`No query call for ${dataSourceId}`);

	return JSON.parse(String(call[1]?.body));
}

describe("Productivity and Reference Library APIs", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each([
		["/api/todos", "GET, QUERY, POST, OPTIONS"],
		["/api/tasks", "GET, QUERY, POST, OPTIONS"],
		["/api/memos", "GET, QUERY, POST, OPTIONS"],
	])("advertises QUERY support for %s", async (path, allow) => {
		const response = await fetchWorker(path, { method: "OPTIONS" });

		expect(response.status).toBe(204);
		expect(response.headers.get("Allow")).toBe(allow);
		expect(response.headers.get("Accept-Query")).toBe("application/json");
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
			"GET, QUERY, POST, PATCH, DELETE, OPTIONS",
		);
	});

	it.each(["/api/todos/meta", "/api/tasks/meta", "/api/memos/meta"])(
		"does not advertise QUERY on metadata %s",
		async (path) => {
			const fetchMock = vi.fn().mockResolvedValue(schemaResponse({}));
			vi.stubGlobal("fetch", fetchMock);

			const response = await fetchWorker(path);

			expect(response.status).toBe(200);
			expect(response.headers.get("Accept-Query")).toBeNull();
		},
	);

	it("queries Todos with Notion-side filters and cursor pagination", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({ results: [todoPage()], has_more: true, next_cursor: "todo-next" }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/todos",
			jsonRequest("QUERY", {
				pageSize: 2,
				cursor: "todo-cursor",
				filters: {
					statuses: ["In progress", "Done"],
					dueFrom: "2026-09-01",
					dueOnOrBefore: "2026-09-30",
					q: "update",
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(queryBody(fetchMock, testEnv.TODOS_DATA_SOURCE_ID)).toEqual({
			page_size: 2,
			start_cursor: "todo-cursor",
			filter: {
				and: [
					{
						or: [
							{ property: "Status", status: { equals: "In progress" } },
							{ property: "Status", status: { equals: "Done" } },
						],
					},
					{ property: "Due Date", date: { on_or_after: "2026-09-01" } },
					{ property: "Due Date", date: { on_or_before: "2026-09-30" } },
					{ property: "To Do", title: { contains: "update" } },
				],
			},
			sorts: [{ property: "Due Date", direction: "ascending" }],
		});
		expect(await response.json()).toMatchObject({
			data: [{ toDo: "Send update", status: "In progress" }],
			count: 1,
			hasMore: true,
			nextCursor: "todo-next",
		});
	});

	it("creates and deletes Todos with status IDs and ownership checks", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith(`/data_sources/${testEnv.TODOS_DATA_SOURCE_ID}`)) {
				return Promise.resolve(
					schemaResponse({
						Status: statusSchema({ "In progress": "status-progress" }),
					}),
				);
			}
			if (url.endsWith("/v1/pages") && init?.method === "POST") {
				return Promise.resolve(Response.json(todoPage()));
			}
			if (url.endsWith(`/v1/pages/${todoPageId}`) && init?.method === "GET") {
				return Promise.resolve(Response.json(todoPage()));
			}
			if (url.endsWith(`/v1/pages/${todoPageId}`) && init?.method === "PATCH") {
				return Promise.resolve(Response.json(todoPage()));
			}
			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const created = await fetchWorker(
			"/api/todos",
			jsonRequest("POST", {
				toDo: "Send update",
				statusOptionId: "status-progress",
				dueDate: "2026-09-13",
				notes: "Before standup",
			}),
		);
		const deleted = await fetchWorker(`/api/todos/${todoPageId}`, { method: "DELETE" });

		const createBody = JSON.parse(
			String(
				fetchMock.mock.calls.find(
					([url, init]) => String(url).endsWith("/v1/pages") && init?.method === "POST",
				)?.[1]?.body,
			),
		);
		const deleteBody = JSON.parse(
			String(
				fetchMock.mock.calls.find(
					([url, init]) =>
						String(url).endsWith(`/v1/pages/${todoPageId}`) && init?.method === "PATCH",
				)?.[1]?.body,
			),
		);

		expect(created.status).toBe(201);
		expect(createBody.properties.Status).toEqual({ status: { id: "status-progress" } });
		expect(deleted.status).toBe(200);
		expect(deleteBody).toEqual({ in_trash: true });
	});

	it("queries Tasks with relation filters and relation enrichment enabled", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (String(url).includes(`/data_sources/${testEnv.TASKS_DATA_SOURCE_ID}/query`)) {
				return Promise.resolve(
					Response.json({ results: [taskPage()], has_more: false, next_cursor: null }),
				);
			}
			if (String(url).includes(`/data_sources/${testEnv.COMPANIES_DATA_SOURCE_ID}/query`)) {
				return Promise.resolve(
					Response.json({
						results: [
							{
								id: companyId,
								created_time: "",
								last_edited_time: "",
								properties: { Company: { title: [{ plain_text: "Orbit" }] } },
							},
						],
						has_more: false,
						next_cursor: null,
					}),
				);
			}
			if (String(url).includes(`/data_sources/${testEnv.JIRAS_DATA_SOURCE_ID}/query`)) {
				return Promise.resolve(
					Response.json({
						results: [
							{
								id: jiraId,
								created_time: "",
								last_edited_time: "",
								properties: {
									"JIRA Key": { title: [{ plain_text: "CRI-1234" }] },
									Summary: { rich_text: [{ plain_text: "Fix login" }] },
								},
							},
						],
						has_more: false,
						next_cursor: null,
					}),
				);
			}
			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/tasks",
			jsonRequest("QUERY", {
				includeRelations: true,
				filters: {
					priorities: ["High"],
					companyIds: [companyId],
					jiraIds: [jiraId],
					followUpBefore: "2026-09-20",
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(queryBody(fetchMock, testEnv.TASKS_DATA_SOURCE_ID).filter).toEqual({
			and: [
				{ property: "Priority", select: { equals: "High" } },
				{ property: "Company", relation: { contains: companyId } },
				{ property: "JIRAs", relation: { contains: jiraId } },
				{ property: "Follow-up Date", date: { before: "2026-09-20" } },
			],
		});
		expect(await response.json()).toMatchObject({
			data: [
				{
					task: "Follow up with team",
					companies: [{ id: companyId, name: "Orbit" }],
					jiras: [{ id: jiraId, key: "CRI-1234", summary: "Fix login" }],
				},
			],
		});
	});

	it("creates Tasks with status, select, text, date, and relation properties", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith(`/data_sources/${testEnv.TASKS_DATA_SOURCE_ID}`)) {
				return Promise.resolve(
					schemaResponse({
						Status: statusSchema({ "Not started": "status-new" }),
						Priority: selectSchema({ High: "priority-high" }),
						Responsibility: selectSchema({ "My Task": "responsibility-my" }),
						"Requested By Type": selectSchema({ Self: "requested-self" }),
						"Assigned To Type": selectSchema({ Self: "assigned-self" }),
					}),
				);
			}
			if (url.endsWith("/v1/pages") && init?.method === "POST") {
				return Promise.resolve(Response.json(taskPage()));
			}
			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/tasks",
			jsonRequest("POST", {
				task: "Follow up with team",
				statusOptionId: "status-new",
				priorityOptionId: "priority-high",
				responsibilityOptionId: "responsibility-my",
				requestedBy: "Self",
				requestedByTypeOptionId: "requested-self",
				assignedTo: "Anand",
				assignedToTypeOptionId: "assigned-self",
				dueDate: "2026-09-14",
				companyId,
				jiraIds: [jiraId],
			}),
		);

		const body = JSON.parse(
			String(
				fetchMock.mock.calls.find(
					([url, init]) => String(url).endsWith("/v1/pages") && init?.method === "POST",
				)?.[1]?.body,
			),
		);

		expect(response.status).toBe(201);
		expect(body.properties).toMatchObject({
			Status: { status: { id: "status-new" } },
			Priority: { select: { id: "priority-high" } },
			Company: { relation: [{ id: companyId }] },
			JIRAs: { relation: [{ id: jiraId }] },
		});
	});

	it("queries and updates Memos without treating markdown as a rich_text property", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (String(url).includes(`/data_sources/${testEnv.MEMOS_DATA_SOURCE_ID}/query`)) {
				return Promise.resolve(
					Response.json({ results: [memoPage()], has_more: false, next_cursor: null }),
				);
			}
			if (url.endsWith(`/v1/pages/${memoPageId}`) && init?.method === "GET") {
				return Promise.resolve(Response.json(memoPage()));
			}
			if (url.endsWith(`/data_sources/${testEnv.MEMOS_DATA_SOURCE_ID}`)) {
				return Promise.resolve(
					schemaResponse({
						Category: selectSchema({ Engineering: "category-eng" }),
						Tags: multiSelectSchema({ api: "tag-api" }),
					}),
				);
			}
			if (url.endsWith(`/v1/pages/${memoPageId}`) && init?.method === "PATCH") {
				return Promise.resolve(Response.json(memoPage()));
			}
			if (url.endsWith(`/v1/pages/${memoPageId}/markdown`) && init?.method === "PATCH") {
				return Promise.resolve(Response.json({ markdown: "# Updated" }));
			}
			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const list = await fetchWorker(
			"/api/memos",
			jsonRequest("QUERY", {
				filters: { categories: ["Engineering"], tags: ["api", "notion"], pinned: true },
			}),
		);
		const patch = await fetchWorker(
			`/api/memos/${memoPageId}`,
			jsonRequest("PATCH", {
				categoryOptionId: "category-eng",
				tagOptionIds: ["tag-api"],
				markdown: "# Updated",
			}),
		);

		expect(list.status).toBe(200);
		expect(queryBody(fetchMock, testEnv.MEMOS_DATA_SOURCE_ID).filter).toEqual({
			and: [
				{ property: "Category", select: { equals: "Engineering" } },
				{
					or: [
						{ property: "Tags", multi_select: { contains: "api" } },
						{ property: "Tags", multi_select: { contains: "notion" } },
					],
				},
				{ property: "Pinned", checkbox: { equals: true } },
			],
		});
		expect(patch.status).toBe(200);
		const pagePatchBody = JSON.parse(
			String(
				fetchMock.mock.calls.find(
					([url, init]) =>
						String(url).endsWith(`/v1/pages/${memoPageId}`) && init?.method === "PATCH",
				)?.[1]?.body,
			),
		);
		const markdownPatchBody = JSON.parse(
			String(
				fetchMock.mock.calls.find(
					([url, init]) =>
						String(url).endsWith(`/v1/pages/${memoPageId}/markdown`) &&
						init?.method === "PATCH",
				)?.[1]?.body,
			),
		);
		expect(pagePatchBody.properties.Markdown).toBeUndefined();
		expect(markdownPatchBody).toMatchObject({
			type: "replace_content",
			replace_content: { new_str: "# Updated" },
			allow_async: true,
		});
	});

	it("reads Reference Library child pages and rejects non-child detail ownership", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (String(url).includes(`/v1/blocks/${testEnv.REFERENCE_LIBRARY_PAGE_ID}/children`)) {
				return Promise.resolve(
					Response.json({
						results: [
							{
								id: referencePageId,
								type: "child_page",
								created_time: "2026-09-01T08:00:00.000Z",
								last_edited_time: "2026-09-01T09:00:00.000Z",
								child_page: { title: "Runbook" },
							},
							{ id: "paragraph-id", type: "paragraph" },
						],
						has_more: false,
						next_cursor: null,
					}),
				);
			}
			if (url.endsWith(`/v1/pages/${referencePageId}`) && init?.method === "GET") {
				return Promise.resolve(
					Response.json({
						id: referencePageId,
						created_time: "2026-09-01T08:00:00.000Z",
						last_edited_time: "2026-09-01T09:00:00.000Z",
						parent: { type: "data_source_id", data_source_id: testEnv.MEMOS_DATA_SOURCE_ID },
						properties: { title: { title: [{ plain_text: "Runbook" }] } },
					}),
				);
			}
			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const list = await fetchWorker("/api/reference-library");
		const detail = await fetchWorker(`/api/reference-library/${referencePageId}`);

		expect(list.status).toBe(200);
		expect(await list.json()).toMatchObject({
			data: [{ id: referencePageId, title: "Runbook" }],
			count: 1,
		});
		expect(detail.status).toBe(404);
		expect(await detail.json()).toEqual({ error: "Reference Library item not found" });
	});

	it("imports Reference Library markdown as a child page and normalizes async polling", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith("/v1/pages") && init?.method === "POST") {
				return Promise.resolve(
					Response.json({
						id: "async-task-id",
						status: "queued",
						poll_after_seconds: 2,
					}),
				);
			}
			if (url.endsWith("/v1/async_tasks/async-task-id")) {
				return Promise.resolve(
					Response.json({
						id: "async-task-id",
						status: "succeeded",
						result: { page_id: referencePageId },
					}),
				);
			}
			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const formData = new FormData();
		formData.set("file", new File(["# Hello"], "hello-world.md", { type: "text/markdown" }));

		const imported = await fetchWorker("/api/reference-library/import", {
			method: "POST",
			body: formData,
		});
		const polled = await fetchWorker("/api/reference-library/imports/async-task-id");

		const importBody = JSON.parse(
			String(
				fetchMock.mock.calls.find(
					([url, init]) => String(url).endsWith("/v1/pages") && init?.method === "POST",
				)?.[1]?.body,
			),
		);

		expect(imported.status).toBe(202);
		expect(importBody).toEqual({
			parent: { page_id: testEnv.REFERENCE_LIBRARY_PAGE_ID },
			properties: { title: { title: [{ text: { content: "hello-world" } }] } },
			markdown: "# Hello",
			allow_async: true,
		});
		expect(await imported.json()).toEqual({
			status: "queued",
			taskId: "async-task-id",
			pollAfterSeconds: 2,
		});
		expect(await polled.json()).toEqual({
			status: "succeeded",
			taskId: "async-task-id",
			pollAfterSeconds: null,
			pageId: referencePageId,
			failed: false,
		});
	});
});
