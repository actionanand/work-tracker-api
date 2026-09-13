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
	REFERENCE_LIBRARY_DATA_SOURCE_ID: "test-reference-library-data-source-id",
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

function referenceLibraryPage(overrides: Record<string, unknown> = {}) {
	return {
		id: referencePageId,
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		parent: { data_source_id: testEnv.REFERENCE_LIBRARY_DATA_SOURCE_ID },
		properties: {
			Article: { title: [{ plain_text: "Angular Signal" }] },
			Category: { select: { name: "Official" } },
			Tags: { multi_select: [{ name: "Angular" }, { name: "Technical" }] },
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
		["/api/reference-library", "GET, QUERY, OPTIONS"],
	])("advertises QUERY support for %s", async (path, allow) => {
		const response = await fetchWorker(path, { method: "OPTIONS" });

		expect(response.status).toBe(204);
		expect(response.headers.get("Allow")).toBe(allow);
		expect(response.headers.get("Accept-Query")).toBe("application/json");
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
			"GET, QUERY, POST, PATCH, DELETE, OPTIONS",
		);
	});

	it.each([
		"/api/todos/meta",
		"/api/tasks/meta",
		"/api/memos/meta",
		"/api/reference-library/meta",
	])(
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

	it("creates Memos with markdown synchronously", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith(`/data_sources/${testEnv.MEMOS_DATA_SOURCE_ID}`)) {
				return Promise.resolve(
					schemaResponse({
						Category: selectSchema({ Command: "category-command" }),
						Tags: multiSelectSchema({ "CI/CD": "tag-cicd", Info: "tag-info" }),
					}),
				);
			}
			if (url.endsWith("/v1/pages") && init?.method === "POST") {
				return Promise.resolve(
					Response.json(
						memoPage({
							properties: {
								Memo: { title: [{ plain_text: "API memo" }] },
								Category: { select: { name: "Command" } },
								Tags: { multi_select: [{ name: "CI/CD" }, { name: "Info" }] },
								Pinned: { checkbox: true },
							},
						}),
					),
				);
			}
			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/memos",
			jsonRequest("POST", {
				memo: "API memo",
				categoryOptionId: "category-command",
				tagOptionIds: ["tag-cicd", "tag-info"],
				pinned: true,
				markdown: "# Test\n\nSome markdown",
			}),
		);
		const createBody = JSON.parse(
			String(
				fetchMock.mock.calls.find(
					([url, init]) => String(url).endsWith("/v1/pages") && init?.method === "POST",
				)?.[1]?.body,
			),
		);

		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({
			data: {
				memo: "API memo",
				markdown: "# Test\n\nSome markdown",
				pinned: true,
			},
		});
		expect(createBody).toMatchObject({
			parent: { data_source_id: testEnv.MEMOS_DATA_SOURCE_ID },
			properties: {
				Memo: { title: [{ text: { content: "API memo" } }] },
				Category: { select: { id: "category-command" } },
				Tags: { multi_select: [{ id: "tag-cicd" }, { id: "tag-info" }] },
				Pinned: { checkbox: true },
			},
			markdown: "# Test\n\nSome markdown",
		});
		expect(createBody).not.toHaveProperty("allow_async");
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
				memo: "Updated memo",
				categoryOptionId: "category-eng",
				tagOptionIds: ["tag-api"],
				pinned: false,
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
		expect(pagePatchBody.properties).toMatchObject({
			Memo: { title: [{ text: { content: "Updated memo" } }] },
			Pinned: { checkbox: false },
		});
		expect(markdownPatchBody).toMatchObject({
			type: "replace_content",
			replace_content: { new_str: "# Updated" },
		});
		expect(markdownPatchBody).not.toHaveProperty("allow_async");
	});

	it("updates Memo markdown synchronously without metadata changes", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith(`/data_sources/${testEnv.MEMOS_DATA_SOURCE_ID}`)) {
				return Promise.resolve(schemaResponse({}));
			}
			if (url.endsWith(`/v1/pages/${memoPageId}`) && init?.method === "GET") {
				return Promise.resolve(Response.json(memoPage()));
			}
			if (url.endsWith(`/v1/pages/${memoPageId}/markdown`) && init?.method === "PATCH") {
				return Promise.resolve(Response.json({ markdown: "# Updated" }));
			}
			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			`/api/memos/${memoPageId}`,
			jsonRequest("PATCH", { markdown: "# Updated" }),
		);
		const pagePatch = fetchMock.mock.calls.find(
			([url, init]) =>
				String(url).endsWith(`/v1/pages/${memoPageId}`) && init?.method === "PATCH",
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

		expect(response.status).toBe(200);
		expect(pagePatch).toBeUndefined();
		expect(markdownPatchBody).toEqual({
			type: "replace_content",
			replace_content: { new_str: "# Updated" },
		});
	});

	it("preserves intentionally empty Memo markdown", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith(`/data_sources/${testEnv.MEMOS_DATA_SOURCE_ID}`)) {
				return Promise.resolve(schemaResponse({}));
			}
			if (url.endsWith(`/v1/pages/${memoPageId}`) && init?.method === "GET") {
				return Promise.resolve(Response.json(memoPage()));
			}
			if (url.endsWith(`/v1/pages/${memoPageId}/markdown`) && init?.method === "PATCH") {
				return Promise.resolve(Response.json({ markdown: "" }));
			}
			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			`/api/memos/${memoPageId}`,
			jsonRequest("PATCH", { markdown: "" }),
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

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ data: { markdown: "" } });
		expect(markdownPatchBody).toEqual({
			type: "replace_content",
			replace_content: { new_str: "" },
		});
	});

	it("returns live Reference Library metadata", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			schemaResponse({
				Article: { type: "title", title: {} },
				Category: selectSchema({ Official: "category-official" }),
				Tags: multiSelectSchema({ Angular: "tag-angular", Technical: "tag-technical" }),
				Created: { type: "created_time", created_time: {} },
				"Last Edited": { type: "last_edited_time", last_edited_time: {} },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker("/api/reference-library/meta");

		expect(response.status).toBe(200);
		expect(response.headers.get("Accept-Query")).toBeNull();
		expect(await response.json()).toEqual({
			resource: "reference-library",
			fields: [
				{ key: "article", label: "Article", type: "title", writable: true },
				{
					key: "categoryOptionId",
					label: "Category",
					type: "select",
					writable: true,
					options: [{ id: "category-official", name: "Official", color: "default" }],
				},
				{
					key: "tagOptionIds",
					label: "Tags",
					type: "multi_select",
					writable: true,
					options: [
						{ id: "tag-angular", name: "Angular", color: "default" },
						{ id: "tag-technical", name: "Technical", color: "default" },
					],
				},
				{ key: "created", label: "Created", type: "created_time", writable: false },
				{
					key: "lastEdited",
					label: "Last Edited",
					type: "last_edited_time",
					writable: false,
				},
			],
		});
	});

	it("lists Reference Library data-source pages with cursor pagination", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				results: [referenceLibraryPage()],
				has_more: true,
				next_cursor: "reference-next",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/reference-library?pageSize=2&cursor=reference-cursor",
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Accept-Query")).toBe("application/json");
		expect(queryBody(fetchMock, testEnv.REFERENCE_LIBRARY_DATA_SOURCE_ID)).toEqual({
			page_size: 2,
			start_cursor: "reference-cursor",
			sorts: [{ property: "Last Edited", direction: "descending" }],
		});
		expect(await response.json()).toEqual({
			data: [
				{
					id: referencePageId,
					article: "Angular Signal",
					category: "Official",
					tags: ["Angular", "Technical"],
					createdTime: "2026-09-01T08:00:00.000Z",
					lastEditedTime: "2026-09-01T09:00:00.000Z",
				},
			],
			count: 1,
			hasMore: true,
			nextCursor: "reference-next",
		});
	});

	it("queries Reference Library with Notion-side category, tag, and title filters", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({ results: [referenceLibraryPage()], has_more: false, next_cursor: null }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/reference-library",
			jsonRequest("QUERY", {
				filters: {
					categories: ["Official", "Learning"],
					tags: ["Angular", "Technical"],
					q: "signal",
				},
				pageSize: 10,
				cursor: "reference-query-cursor",
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Accept-Query")).toBe("application/json");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(queryBody(fetchMock, testEnv.REFERENCE_LIBRARY_DATA_SOURCE_ID)).toEqual({
			page_size: 10,
			start_cursor: "reference-query-cursor",
			sorts: [{ property: "Last Edited", direction: "descending" }],
			filter: {
				and: [
					{
						or: [
							{ property: "Category", select: { equals: "Official" } },
							{ property: "Category", select: { equals: "Learning" } },
						],
					},
					{
						or: [
							{ property: "Tags", multi_select: { contains: "Angular" } },
							{ property: "Tags", multi_select: { contains: "Technical" } },
						],
					},
					{ property: "Article", title: { contains: "signal" } },
				],
			},
		});
	});

	it("rejects unknown Reference Library QUERY filters before calling Notion", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker(
			"/api/reference-library",
			jsonRequest("QUERY", { filters: { status: "Published" } }),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid request",
			field: "status",
			message: "Unknown filter",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reads owned Reference Library markdown and safely normalizes empty blocks", async () => {
		const outsiderPageId = "77777777-7777-7777-7777-777777777777";
		const markdown = [
			"## Angular 22",
			"",
			"  <empty-block/> \t",
			"",
			"```mermaid",
			"flowchart TD",
			"    A[Start] --> B[End]",
			"<empty-block/>",
			"```",
			"",
			"~~~text",
			"<empty-block/>",
			"~~~",
			"",
			"Inline `<empty-block/>` remains literal.",
			"",
			"$$E = mc^2$$",
			"<unknown id=\"block-id\"/>",
		].join("\n");
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith(`/v1/pages/${referencePageId}`) && init?.method === "GET") {
				return Promise.resolve(Response.json(referenceLibraryPage()));
			}
			if (url.endsWith(`/v1/pages/${referencePageId}/markdown`)) {
				return Promise.resolve(Response.json({ markdown }));
			}
			if (url.endsWith(`/v1/pages/${outsiderPageId}`) && init?.method === "GET") {
				return Promise.resolve(
					Response.json(
						referenceLibraryPage({
							id: outsiderPageId,
							parent: { data_source_id: testEnv.MEMOS_DATA_SOURCE_ID },
						}),
					),
				);
			}
			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const detail = await fetchWorker(`/api/reference-library/${referencePageId}`);
		const outsider = await fetchWorker(`/api/reference-library/${outsiderPageId}`);
		const body = (await detail.json()) as { markdown: string };

		expect(detail.status).toBe(200);
		expect(detail.headers.get("Accept-Query")).toBeNull();
		expect(body).toMatchObject({
			article: "Angular Signal",
			category: "Official",
			tags: ["Angular", "Technical"],
		});
		expect(body.markdown).toContain("```mermaid\nflowchart TD");
		expect(body.markdown).toContain("```mermaid\nflowchart TD\n    A[Start] --> B[End]\n<empty-block/>\n```");
		expect(body.markdown).toContain("~~~text\n<empty-block/>\n~~~");
		expect(body.markdown).toContain("Inline `<empty-block/>` remains literal.");
		expect(body.markdown).toContain("$$E = mc^2$$");
		expect(body.markdown).toContain("<unknown id=\"block-id\"/>");
		expect(body.markdown).not.toContain("<empty-block/> \t");
		expect(outsider.status).toBe(404);
		expect(await outsider.json()).toEqual({ error: "Reference Library item not found" });
		expect(
			fetchMock.mock.calls.some(([url]) =>
				String(url).endsWith(`/v1/pages/${outsiderPageId}/markdown`),
			),
		).toBe(false);
	});

	it("imports Reference Library markdown with validated metadata and async polling", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url.endsWith(`/data_sources/${testEnv.REFERENCE_LIBRARY_DATA_SOURCE_ID}`)) {
				return Promise.resolve(
					schemaResponse({
						Category: selectSchema({ Official: "category-official" }),
						Tags: multiSelectSchema({
							Angular: "tag-angular",
							Technical: "tag-technical",
						}),
					}),
				);
			}
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

		const markdown = "# Angular Signal\n\n```mermaid\nflowchart TD\nA --> B\n```\n\n$$x^2$$";
		const formData = new FormData();
		formData.set("file", new File([markdown], "angular-signal.md", { type: "text/markdown" }));
		formData.set("article", "Angular Signal");
		formData.set("categoryOptionId", "category-official");
		formData.append("tagOptionIds", "tag-angular");
		formData.append("tagOptionIds", "tag-technical");

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
			parent: { data_source_id: testEnv.REFERENCE_LIBRARY_DATA_SOURCE_ID },
			properties: {
				Article: { title: [{ text: { content: "Angular Signal" } }] },
				Category: { select: { id: "category-official" } },
				Tags: { multi_select: [{ id: "tag-angular" }, { id: "tag-technical" }] },
			},
			markdown,
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

	it("rejects unknown Reference Library import options before creating a page", async () => {
		const fetchMock = vi.fn((url: string) => {
			if (url.endsWith(`/data_sources/${testEnv.REFERENCE_LIBRARY_DATA_SOURCE_ID}`)) {
				return Promise.resolve(
					schemaResponse({
						Category: selectSchema({ Official: "category-official" }),
					}),
				);
			}
			return Promise.resolve(Response.json({}));
		});
		vi.stubGlobal("fetch", fetchMock);

		const formData = new FormData();
		formData.set("file", new File(["# Article"], "article.md", { type: "text/markdown" }));
		formData.set("categoryOptionId", "unknown-category");

		const response = await fetchWorker("/api/reference-library/import", {
			method: "POST",
			body: formData,
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid request",
			field: "categoryOptionId",
			message: "Unknown option ID",
		});
		expect(
			fetchMock.mock.calls.some(([url]) => String(url).endsWith("/v1/pages")),
		).toBe(false);
	});
});
