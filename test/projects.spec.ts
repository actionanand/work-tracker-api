import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleProjectRoutes } from "../src/features/projects/project.routes";
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
	FEEDBACK_DATA_SOURCE_ID: "test-feedback-data-source-id",
	WORK_LINKS_DATA_SOURCE_ID: "test-work-links-data-source-id",
};

const activeFilter = {
	property: "Active",
	checkbox: {
		equals: true,
	},
};

const companyFilter = {
	property: "Company",
	relation: {
		contains: "11111111-1111-1111-1111-111111111111",
	},
};

const teamFilter = {
	property: "Team",
	relation: {
		contains: "22222222-2222-2222-2222-222222222222",
	},
};

const invalidParameterResponse = (parameter: string) => ({
	error: "Invalid query parameter",
	parameter,
	message: "Expected a valid Notion page ID",
});

const routeCases = [
	{
		path: "/api/projects",
		expectedBody: {
			page_size: 100,
		},
	},
	{
		path: "/api/projects/active",
		expectedBody: {
			page_size: 100,
			filter: activeFilter,
		},
	},
	{
		path: "/api/projects?companyId=11111111-1111-1111-1111-111111111111",
		expectedBody: {
			page_size: 100,
			filter: companyFilter,
		},
	},
	{
		path: "/api/projects?teamId=22222222-2222-2222-2222-222222222222",
		expectedBody: {
			page_size: 100,
			filter: teamFilter,
		},
	},
	{
		path: "/api/projects?companyId=11111111-1111-1111-1111-111111111111&teamId=22222222-2222-2222-2222-222222222222",
		expectedBody: {
			page_size: 100,
			filter: {
				and: [companyFilter, teamFilter],
			},
		},
	},
	{
		path: "/api/projects/active?companyId=11111111-1111-1111-1111-111111111111&teamId=22222222-2222-2222-2222-222222222222",
		expectedBody: {
			page_size: 100,
			filter: {
				and: [activeFilter, companyFilter, teamFilter],
			},
		},
	},
	{
		path: "/api/projects?companyId=11111111111111111111111111111111",
		expectedBody: {
			page_size: 100,
			filter: companyFilter,
		},
	},
] as const;

const fullProjectPage = {
	id: "project-id",
	properties: {
		Project: {
			title: [{ plain_text: "  Work Tracker  " }],
		},
		Company: {
			relation: [{ id: "11111111-1111-1111-1111-111111111111" }],
		},
		Team: {
			relation: [{ id: "22222222-2222-2222-2222-222222222222" }],
		},
		Active: {
			checkbox: true,
		},
	},
};

const defaultProjectPage = {
	id: "default-project-id",
	properties: {},
};

const expectedProject = {
	id: "project-id",
	project: "Work Tracker",
	active: true,
	companyIds: ["11111111-1111-1111-1111-111111111111"],
	teamIds: ["22222222-2222-2222-2222-222222222222"],
};

const expectedDefaultProject = {
	id: "default-project-id",
	project: "",
	active: false,
	companyIds: [],
	teamIds: [],
};

function stubNotionFetch() {
	const fetchMock = vi.fn().mockResolvedValue(
		Response.json({
			results: [fullProjectPage, defaultProjectPage],
			has_more: false,
			next_cursor: null,
		}),
	);

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
		"https://api.notion.com/v1/data_sources/test-projects-data-source-id/query",
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

describe("Project API routes", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(routeCases)(
		"queries Notion and maps projects for $path",
		async ({ path, expectedBody }) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(response.status).toBe(200);
			expectNotionRequest(fetchMock, expectedBody);
			expect(await response.json()).toEqual({
				data: [expectedProject, expectedDefaultProject],
				count: 2,
				hasMore: false,
				nextCursor: null,
			});
		},
	);

	it("lets unknown Project subpaths fall through to the main Worker 404", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/projects/random/path");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it.each([
		["companyId", "/api/projects?companyId=invalid"],
		["companyId", "/api/projects?companyId=YOUR_COMPANY_PAGE_ID"],
		["teamId", "/api/projects?teamId=abc"],
		["teamId", "/api/projects?teamId=123"],
		["companyId", "/api/projects?companyId=invalid-uuid"],
	])(
		"returns 400 for invalid Project %s without calling Notion",
		async (parameter, path) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(fetchMock).not.toHaveBeenCalled();
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual(invalidParameterResponse(parameter));
		},
	);

	it("returns null from the Project route handler for unknown subpaths", async () => {
		const response = await handleProjectRoutes(
			new IncomingRequest("http://example.com/api/projects/random/path"),
			new URL("http://example.com/api/projects/random/path"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});

