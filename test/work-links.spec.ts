import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleWorkLinkRoutes } from "../src/features/work-links/work-link.routes";
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
const compactCompanyId = "11111111111111111111111111111111";
const projectId = "33333333-3333-3333-3333-333333333333";

const linkSort = [{ property: "Link", direction: "ascending" }];

const activeFilter = {
	property: "Active",
	checkbox: {
		equals: true,
	},
};

const companyFilter = {
	property: "Company",
	relation: {
		contains: companyId,
	},
};

const projectFilter = {
	property: "Project",
	relation: {
		contains: projectId,
	},
};

const typeFilter = {
	property: "Type",
	select: {
		equals: "Documentation",
	},
};

const queryFilter = {
	property: "Link",
	title: {
		contains: "github",
	},
};

const routeCases = [
	{
		path: "/api/work-links",
		expectedBody: {
			page_size: 100,
			sorts: linkSort,
		},
	},
	{
		path: "/api/work-links/active",
		expectedBody: {
			page_size: 100,
			filter: activeFilter,
			sorts: linkSort,
		},
	},
	{
		path: `/api/work-links?companyId=${companyId}`,
		expectedBody: {
			page_size: 100,
			filter: companyFilter,
			sorts: linkSort,
		},
	},
	{
		path: `/api/work-links?companyId=${compactCompanyId}`,
		expectedBody: {
			page_size: 100,
			filter: companyFilter,
			sorts: linkSort,
		},
	},
	{
		path: `/api/work-links?projectId=${projectId}`,
		expectedBody: {
			page_size: 100,
			filter: projectFilter,
			sorts: linkSort,
		},
	},
	{
		path: "/api/work-links?type=Documentation",
		expectedBody: {
			page_size: 100,
			filter: typeFilter,
			sorts: linkSort,
		},
	},
	{
		path: `/api/work-links?companyId=${companyId}&projectId=${projectId}&type=Documentation`,
		expectedBody: {
			page_size: 100,
			filter: {
				and: [companyFilter, projectFilter, typeFilter],
			},
			sorts: linkSort,
		},
	},
	{
		path: `/api/work-links/active?companyId=${companyId}`,
		expectedBody: {
			page_size: 100,
			filter: {
				and: [activeFilter, companyFilter],
			},
			sorts: linkSort,
		},
	},
	{
		path: `/api/work-links/active?companyId=${companyId}&projectId=${projectId}&type=Documentation`,
		expectedBody: {
			page_size: 100,
			filter: {
				and: [activeFilter, companyFilter, projectFilter, typeFilter],
			},
			sorts: linkSort,
		},
	},
	{
		path: "/api/work-links?q=github",
		expectedBody: {
			page_size: 100,
			filter: queryFilter,
			sorts: linkSort,
		},
	},
	{
		path: `/api/work-links?q=github&companyId=${companyId}&type=Documentation`,
		expectedBody: {
			page_size: 100,
			filter: {
				and: [companyFilter, typeFilter, queryFilter],
			},
			sorts: linkSort,
		},
	},
] as const;

const fullWorkLinkPage = {
	id: "work-link-id",
	created_time: "2026-09-01T08:00:00.000Z",
	last_edited_time: "2026-09-01T09:00:00.000Z",
	properties: {
		Link: {
			title: [{ plain_text: "  GitHub Runbook  " }],
		},
		Type: {
			select: { name: " Documentation " },
		},
		URL: {
			url: "https://github.com/example/work-tracker",
		},
		Company: {
			relation: [{ id: companyId }],
		},
		Project: {
			relation: [{ id: projectId }],
		},
		Notes: {
			rich_text: [{ plain_text: "  Deployment notes and owner links.  " }],
		},
		Active: {
			checkbox: true,
		},
	},
};

const defaultWorkLinkPage = {
	id: "default-work-link-id",
	created_time: "2026-09-02T08:00:00.000Z",
	last_edited_time: "2026-09-02T09:00:00.000Z",
	properties: {},
};

const expectedWorkLink = {
	id: "work-link-id",
	createdTime: "2026-09-01T08:00:00.000Z",
	lastEditedTime: "2026-09-01T09:00:00.000Z",
	link: "GitHub Runbook",
	type: "Documentation",
	url: "https://github.com/example/work-tracker",
	notes: "Deployment notes and owner links.",
	active: true,
	companyIds: [companyId],
	projectIds: [projectId],
};

const expectedDefaultWorkLink = {
	id: "default-work-link-id",
	createdTime: "2026-09-02T08:00:00.000Z",
	lastEditedTime: "2026-09-02T09:00:00.000Z",
	link: "",
	type: null,
	url: null,
	notes: "",
	active: false,
	companyIds: [],
	projectIds: [],
};

const invalidParameterResponse = (parameter: string) => ({
	error: "Invalid query parameter",
	parameter,
	message: "Expected a valid Notion page ID",
});

function stubNotionFetch() {
	const fetchMock = vi.fn().mockResolvedValue(
		Response.json({
			results: [fullWorkLinkPage, defaultWorkLinkPage],
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
	expect(fetchMock).toHaveBeenCalledTimes(1);
	expect(fetchMock).toHaveBeenCalledWith(
		"https://api.notion.com/v1/data_sources/test-work-links-data-source-id/query",
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

describe("Work Link API routes", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(routeCases)(
		"queries Notion and maps Work Links for $path",
		async ({ path, expectedBody }) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(response.status).toBe(200);
			expectNotionRequest(fetchMock, expectedBody);
			expect(await response.json()).toEqual({
				data: [expectedWorkLink, expectedDefaultWorkLink],
				count: 2,
				hasMore: false,
				nextCursor: null,
			});
		},
	);

	it.each([
		["companyId", "/api/work-links?companyId=WRONG-ID"],
		["projectId", "/api/work-links?projectId=WRONG-ID"],
	])(
		"returns 400 for invalid Work Link %s without calling Notion",
		async (parameter, path) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(fetchMock).not.toHaveBeenCalled();
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual(invalidParameterResponse(parameter));
		},
	);

	it("ignores empty type and q query parameters consistently", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/work-links?type=%20&q=");

		expect(response.status).toBe(200);
		expectNotionRequest(fetchMock, {
			page_size: 100,
			sorts: linkSort,
		});
	});

	it("lets unknown Work Link subpaths fall through to the main Worker 404", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/work-links/random");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("returns null from the Work Link route handler for unknown subpaths", async () => {
		const response = await handleWorkLinkRoutes(
			new IncomingRequest("http://example.com/api/work-links/foo/bar"),
			new URL("http://example.com/api/work-links/foo/bar"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});
