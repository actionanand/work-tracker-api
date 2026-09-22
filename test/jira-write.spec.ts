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

const projectId = "33333333-3333-3333-3333-333333333333";
const activeSprintId = "44444444-4444-4444-4444-444444444444";
const otherDataSourceId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function statusSchema() {
	return {
		type: "status",
		status: {
			options: [{ id: "status-open", name: "Open", color: "blue" }],
		},
	};
}

function tagsSchema() {
	return {
		type: "multi_select",
		multi_select: {
			options: [
				{ id: "tag-api", name: "API", color: "green" },
				{ id: "tag-notion", name: "Notion", color: "purple" },
			],
		},
	};
}

function jiraSchemaResponse() {
	return Response.json({
		properties: {
			"JIRA Key": { type: "title" },
			Summary: { type: "rich_text" },
			Project: {
				type: "relation",
				relation: { data_source_id: testEnv.PROJECTS_DATA_SOURCE_ID },
			},
			Status: statusSchema(),
			"In Active Sprint": { type: "formula" },
			Tags: tagsSchema(),
			"Demo Required": { type: "checkbox" },
			Appraisal: { type: "checkbox" },
			Sprints: { type: "relation" },
			"Linked JIRA": { type: "relation" },
			"Release Items": { type: "relation" },
			Spillover: { type: "formula" },
			"Spillover Count": { type: "formula" },
			Description: { type: "rich_text" },
			"Demoed Date": { type: "date" },
			"Demo Notes": { type: "rich_text" },
			"Link Type": {
				type: "select",
				select: { options: [{ id: "link-blocks", name: "Blocks", color: "red" }] },
			},
		},
	});
}

function createdJiraPage() {
	return {
		id: "created-jira-id",
		created_time: "2026-09-13T10:00:00.000Z",
		last_edited_time: "2026-09-13T10:00:00.000Z",
		properties: {
			"JIRA Key": { title: [{ plain_text: "LSC-99999" }] },
			Summary: { rich_text: [{ plain_text: "Temporary API JIRA" }] },
			Project: { relation: [{ id: projectId }] },
			Status: { status: { name: "Open" } },
			Sprints: { relation: [{ id: activeSprintId }] },
			Tags: { multi_select: [{ name: "API" }, { name: "Notion" }] },
			"Demo Required": { checkbox: true },
			Appraisal: { checkbox: false },
			"In Active Sprint": { formula: { boolean: true } },
		},
	};
}

function notionResponse(results: unknown[], hasMore = false) {
	return Response.json({
		results,
		has_more: hasMore,
		next_cursor: hasMore ? "next-cursor" : null,
	});
}

async function fetchWorker(path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);

	for (const [key, value] of new Headers(await createAuthHeaders(testEnv))) {
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

function postJson(body: unknown): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	};
}

interface JiraFetchOptions {
	duplicateResults?: unknown[];
	projectParentDataSourceId?: string;
	projectStatus?: number;
	activeSprints?: Array<{ id: string }>;
	activeSprintsHasMore?: boolean;
}

function stubJiraWriteFetch(options: JiraFetchOptions = {}) {
	const fetchMock = vi.fn((url: string, init?: RequestInit) => {
		if (
			url.endsWith(`/data_sources/${testEnv.JIRAS_DATA_SOURCE_ID}/query`) &&
			init?.method === "POST"
		) {
			return Promise.resolve(notionResponse(options.duplicateResults ?? []));
		}

		if (url.endsWith(`/data_sources/${testEnv.JIRAS_DATA_SOURCE_ID}`)) {
			return Promise.resolve(jiraSchemaResponse());
		}

		if (url.endsWith(`/pages/${projectId}`)) {
			if (options.projectStatus === 404) {
				return Promise.resolve(new Response("not found", { status: 404 }));
			}

			return Promise.resolve(
				Response.json({
					id: projectId,
					parent: {
						data_source_id:
							options.projectParentDataSourceId ??
							testEnv.PROJECTS_DATA_SOURCE_ID,
					},
				}),
			);
		}

		if (
			url.endsWith(`/data_sources/${testEnv.SPRINTS_DATA_SOURCE_ID}/query`) &&
			init?.method === "POST"
		) {
			return Promise.resolve(
				notionResponse(
					options.activeSprints ?? [{ id: activeSprintId }],
					options.activeSprintsHasMore,
				),
			);
		}

		if (url.endsWith("/v1/pages") && init?.method === "POST") {
			return Promise.resolve(Response.json(createdJiraPage()));
		}

		return Promise.resolve(Response.json({}));
	});

	vi.stubGlobal("fetch", fetchMock);

	return fetchMock;
}

function findCreateCall(fetchMock: ReturnType<typeof vi.fn>) {
	return fetchMock.mock.calls.find(
		([url, init]) => String(url).endsWith("/v1/pages") && init?.method === "POST",
	);
}

function validCreateBody() {
	return {
		jiraKey: " LSC-99999 ",
		summary: " Temporary API JIRA ",
		projectId,
		statusOptionId: "status-open",
		inActiveSprint: true,
		tagOptionIds: ["tag-api", "tag-notion", "tag-api"],
		demoRequired: true,
		appraisal: false,
	};
}

describe("JIRA create API", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("returns live simple-create metadata plus the synthetic active Sprint field", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jiraSchemaResponse());
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker("/api/jiras/meta");
		const body = (await response.json()) as {
			resource: string;
			fields: Array<Record<string, unknown>>;
		};

		expect(response.status).toBe(200);
		expect(response.headers.get("Accept-Query")).toBeNull();
		expect(body.resource).toBe("jiras");
		expect(body.fields.map((field) => field.key)).toEqual([
			"jiraKey",
			"summary",
			"projectId",
			"statusOptionId",
			"inActiveSprint",
			"tagOptionIds",
			"demoRequired",
			"appraisal",
		]);
		expect(body.fields).toContainEqual({
			key: "projectId",
			label: "Project",
			type: "relation",
			writable: true,
			optionsEndpoint: "/api/projects/active",
		});
		expect(body.fields).toContainEqual({
			key: "inActiveSprint",
			label: "In Active Sprint",
			type: "checkbox",
			writable: true,
		});
		expect(body.fields.find((field) => field.key === "statusOptionId")?.options).toEqual([
			{ id: "status-open", name: "Open", color: "blue" },
		]);
		expect(body.fields.find((field) => field.key === "tagOptionIds")?.options).toEqual([
			{ id: "tag-api", name: "API", color: "green" },
			{ id: "tag-notion", name: "Notion", color: "purple" },
		]);
		expect(fetchMock).toHaveBeenCalledWith(
			`https://api.notion.com/v1/data_sources/${testEnv.JIRAS_DATA_SOURCE_ID}`,
			expect.objectContaining({ method: "GET" }),
		);
	});

	it("returns only PATCH-writable fields for edit metadata", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jiraSchemaResponse());
		vi.stubGlobal("fetch", fetchMock);

		const response = await fetchWorker("/api/jiras/meta?mode=edit");
		const body = (await response.json()) as {
			fields: Array<Record<string, unknown>>;
		};
		const keys = body.fields.map((field) => field.key);

		expect(keys).toEqual([
			"summary", "descriptionMarkdown", "descriptionRichTextHtml", "projectId",
			"statusOptionId", "tagOptionIds", "appraisal", "demoRequired",
			"demoedDate", "demoNotes", "linkedJiraId", "linkTypeOptionId",
			"linkReason", "linkedOn", "resolvedOn",
		]);
		expect(keys).not.toContain("jiraKey");
		expect(keys).not.toContain("inActiveSprint");
		expect(body.fields.find((field) => field.key === "projectId")).toMatchObject({ optionsEndpoint: "/api/projects/active" });
		expect(body.fields.find((field) => field.key === "linkedJiraId")).toMatchObject({ optionsEndpoint: "/api/jiras/options" });
		expect(body.fields.find((field) => field.key === "statusOptionId")?.options).toEqual([{ id: "status-open", name: "Open", color: "blue" }]);
		expect(body.fields.find((field) => field.key === "tagOptionIds")?.options).toEqual([{ id: "tag-api", name: "API", color: "green" }, { id: "tag-notion", name: "Notion", color: "purple" }]);
		expect(body.fields.find((field) => field.key === "linkTypeOptionId")?.options).toEqual([{ id: "link-blocks", name: "Blocks", color: "red" }]);
	});

	it("creates a mapped JIRA with validated relations, options, and one active Sprint", async () => {
		const fetchMock = stubJiraWriteFetch();

		const response = await fetchWorker("/api/jiras", postJson(validCreateBody()));
		const duplicateCall = fetchMock.mock.calls.find(([url]) =>
			String(url).endsWith(`/data_sources/${testEnv.JIRAS_DATA_SOURCE_ID}/query`),
		);
		const sprintCall = fetchMock.mock.calls.find(([url]) =>
			String(url).endsWith(`/data_sources/${testEnv.SPRINTS_DATA_SOURCE_ID}/query`),
		);
		const createCall = findCreateCall(fetchMock);

		expect(response.status).toBe(201);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(JSON.parse(String(duplicateCall?.[1]?.body))).toEqual({
			page_size: 1,
			filter: {
				property: "JIRA Key",
				title: { equals: "LSC-99999" },
			},
		});
		expect(JSON.parse(String(sprintCall?.[1]?.body))).toEqual({
			page_size: 2,
			filter: {
				property: "Active",
				checkbox: { equals: true },
			},
		});
		expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
			parent: { data_source_id: testEnv.JIRAS_DATA_SOURCE_ID },
			properties: {
				"JIRA Key": { title: [{ text: { content: "LSC-99999" } }] },
				Summary: { rich_text: [{ text: { content: "Temporary API JIRA" } }] },
				Project: { relation: [{ id: projectId }] },
				Status: { status: { id: "status-open" } },
				Sprints: { relation: [{ id: activeSprintId }] },
				Tags: {
					multi_select: [{ id: "tag-api" }, { id: "tag-notion" }],
				},
				"Demo Required": { checkbox: true },
				Appraisal: { checkbox: false },
			},
		});
		expect(JSON.parse(String(createCall?.[1]?.body)).properties).not.toHaveProperty(
			"In Active Sprint",
		);
		expect(await response.json()).toEqual({
			data: {
				id: "created-jira-id",
				createdTime: "2026-09-13T10:00:00.000Z",
				lastEditedTime: "2026-09-13T10:00:00.000Z",
				jiraKey: "LSC-99999",
				summary: "Temporary API JIRA",
				status: "Open",
				tags: ["API", "Notion"],
				appraisal: false,
				spillover: false,
				spilloverCount: 0,
				description: "",
				firstSprintStart: null,
				inActiveSprint: true,
				demoRequired: true,
				demoedDate: null,
				demoNotes: "",
				sprintIds: [activeSprintId],
				projectIds: [projectId],
				linkedJiraIds: [],
				linkedFromIds: [],
				linkType: null,
				linkReason: "",
				linkedOn: null,
				resolvedOn: null,
				releaseItemIds: [],
			},
		});
		expect(
			fetchMock.mock.calls.some(([url]) =>
				String(url).includes(testEnv.SPRINT_ALLOCATIONS_DATA_SOURCE_ID),
			),
		).toBe(false);
	});

	it("uses defaults and skips the active Sprint query when inActiveSprint is omitted", async () => {
		const fetchMock = stubJiraWriteFetch();

		const response = await fetchWorker(
			"/api/jiras",
			postJson({ jiraKey: "LSC-99999", summary: "Temporary API JIRA" }),
		);
		const createCall = findCreateCall(fetchMock);
		const payload = JSON.parse(String(createCall?.[1]?.body));

		expect(response.status).toBe(201);
		expect(payload.properties.Project).toEqual({ relation: [] });
		expect(payload.properties.Status).toEqual({ status: null });
		expect(payload.properties.Sprints).toEqual({ relation: [] });
		expect(payload.properties.Tags).toEqual({ multi_select: [] });
		expect(payload.properties["Demo Required"]).toEqual({ checkbox: false });
		expect(payload.properties.Appraisal).toEqual({ checkbox: false });
		expect(
			fetchMock.mock.calls.some(([url]) =>
				String(url).includes(testEnv.SPRINTS_DATA_SOURCE_ID),
			),
		).toBe(false);
	});

	it("returns 409 without creating when no active Sprint is configured", async () => {
		const fetchMock = stubJiraWriteFetch({ activeSprints: [] });

		const response = await fetchWorker("/api/jiras", postJson(validCreateBody()));

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "No active Sprint is configured",
			field: "inActiveSprint",
		});
		expect(findCreateCall(fetchMock)).toBeUndefined();
	});

	it("returns 409 without choosing when multiple active Sprints are configured", async () => {
		const fetchMock = stubJiraWriteFetch({
			activeSprints: [{ id: activeSprintId }, { id: "second-sprint-id" }],
		});

		const response = await fetchWorker("/api/jiras", postJson(validCreateBody()));

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "Multiple active Sprints are configured",
			field: "inActiveSprint",
		});
		expect(findCreateCall(fetchMock)).toBeUndefined();
	});

	it("returns 409 without creating when the JIRA key already exists", async () => {
		const fetchMock = stubJiraWriteFetch({ duplicateResults: [createdJiraPage()] });

		const response = await fetchWorker(
			"/api/jiras",
			postJson({ jiraKey: "LSC-99999", summary: "Duplicate" }),
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "JIRA already exists",
			field: "jiraKey",
		});
		expect(findCreateCall(fetchMock)).toBeUndefined();
	});

	it.each([
		["another data source", { projectParentDataSourceId: otherDataSourceId }],
		["a missing page", { projectStatus: 404 }],
	])("rejects a Project from %s", async (_name, options) => {
		const fetchMock = stubJiraWriteFetch(options);

		const response = await fetchWorker(
			"/api/jiras",
			postJson({
				jiraKey: "LSC-99999",
				summary: "Temporary API JIRA",
				projectId,
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid request",
			field: "projectId",
			message: "Expected a Project page",
		});
		expect(findCreateCall(fetchMock)).toBeUndefined();
	});

	it.each([
		["statusOptionId", { statusOptionId: "unknown-status" }],
		["tagOptionIds", { tagOptionIds: ["unknown-tag"] }],
	])("rejects an unknown %s from the live schema", async (field, extra) => {
		const fetchMock = stubJiraWriteFetch();

		const response = await fetchWorker(
			"/api/jiras",
			postJson({ jiraKey: "LSC-99999", summary: "Temporary API JIRA", ...extra }),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid request",
			field,
			message: "Unknown option ID",
		});
		expect(findCreateCall(fetchMock)).toBeUndefined();
	});

	it.each([
		["missing jiraKey", { summary: "Summary" }, "jiraKey", "Expected a valid JIRA key"],
		["blank jiraKey", { jiraKey: "  ", summary: "Summary" }, "jiraKey", "Expected a valid JIRA key"],
		["invalid jiraKey", { jiraKey: "LSC-ABC", summary: "Summary" }, "jiraKey", "Expected a valid JIRA key"],
		["missing summary", { jiraKey: "LSC-1" }, "summary", "Expected a non-empty string"],
		["blank summary", { jiraKey: "LSC-1", summary: "  " }, "summary", "Expected a non-empty string"],
		["invalid projectId", { jiraKey: "LSC-1", summary: "Summary", projectId: "invalid" }, "projectId", "Expected a valid Notion page ID"],
		["non-array tags", { jiraKey: "LSC-1", summary: "Summary", tagOptionIds: "tag-api" }, "tagOptionIds", "Expected an array of strings"],
		["string active flag", { jiraKey: "LSC-1", summary: "Summary", inActiveSprint: "true" }, "inActiveSprint", "Expected a boolean"],
		["numeric demo flag", { jiraKey: "LSC-1", summary: "Summary", demoRequired: 1 }, "demoRequired", "Expected a boolean"],
		["string appraisal flag", { jiraKey: "LSC-1", summary: "Summary", appraisal: "false" }, "appraisal", "Expected a boolean"],
		["read-only field", { jiraKey: "LSC-1", summary: "Summary", sprintIds: [] }, "sprintIds", "Unknown or read-only field"],
	] as const)("rejects %s before creating a Notion page", async (_name, body, field, message) => {
		const fetchMock = stubJiraWriteFetch();

		const response = await fetchWorker("/api/jiras", postJson(body));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid request",
			field,
			message,
		});
		expect(findCreateCall(fetchMock)).toBeUndefined();
	});

	it("advertises create and edit support without adding delete routes", async () => {
		const collection = await fetchWorker("/api/jiras", { method: "OPTIONS" });
		const metadata = await fetchWorker("/api/jiras/meta", { method: "OPTIONS" });
		const item = await fetchWorker("/api/jiras/LSC-84944", { method: "OPTIONS" });

		expect(collection.headers.get("Allow")).toBe("GET, QUERY, POST, OPTIONS");
		expect(collection.headers.get("Accept-Query")).toBe("application/json");
		expect(metadata.headers.get("Allow")).toBe("GET, OPTIONS");
		expect(metadata.headers.get("Accept-Query")).toBeNull();
		expect(item.headers.get("Allow")).toBe("GET, PATCH, OPTIONS");

		const fetchMock = vi.fn().mockResolvedValue(notionResponse([]));
		vi.stubGlobal("fetch", fetchMock);
		const patchResponse = await fetchWorker("/api/jiras/LSC-99999", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});

		expect(patchResponse.status).toBe(404);
		expect(await patchResponse.json()).toEqual({ error: "JIRA not found" });
		expect(fetchMock).toHaveBeenCalledWith(
			`https://api.notion.com/v1/data_sources/${testEnv.JIRAS_DATA_SOURCE_ID}/query`,
			expect.objectContaining({ method: "POST" }),
		);
		const deleteResponse = await fetchWorker("/api/jiras/LSC-99999", {
			method: "DELETE",
		});
		const bulkDeleteResponse = await fetchWorker(
			"/api/jiras/bulk-delete",
			postJson({ pageIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"] }),
		);

		expect(deleteResponse.status).toBe(404);
		expect(bulkDeleteResponse.status).toBe(404);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
