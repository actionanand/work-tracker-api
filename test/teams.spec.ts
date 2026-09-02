import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleTeamRoutes } from "../src/features/teams/team.routes";
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

const invalidParameterResponse = (parameter: string) => ({
	error: "Invalid query parameter",
	parameter,
	message: "Expected a valid Notion page ID",
});

const routeCases = [
	{
		path: "/api/teams",
		expectedBody: {
			page_size: 100,
		},
	},
	{
		path: "/api/teams/active",
		expectedBody: {
			page_size: 100,
			filter: activeFilter,
		},
	},
	{
		path: "/api/teams?companyId=11111111-1111-1111-1111-111111111111",
		expectedBody: {
			page_size: 100,
			filter: companyFilter,
		},
	},
	{
		path: "/api/teams/active?companyId=11111111-1111-1111-1111-111111111111",
		expectedBody: {
			page_size: 100,
			filter: {
				and: [activeFilter, companyFilter],
			},
		},
	},
] as const;

const fullTeamPage = {
	id: "22222222-2222-2222-2222-222222222222",
	properties: {
		Team: {
			title: [{ plain_text: "  Engineering  " }],
		},
		Company: {
			relation: [{ id: "11111111-1111-1111-1111-111111111111" }],
		},
		Projects: {
			relation: [{ id: "project-id" }],
		},
		Active: {
			checkbox: true,
		},
	},
};

const defaultTeamPage = {
	id: "default-22222222-2222-2222-2222-222222222222",
	properties: {},
};

const expectedTeam = {
	id: "22222222-2222-2222-2222-222222222222",
	team: "Engineering",
	active: true,
	companyIds: ["11111111-1111-1111-1111-111111111111"],
	projectIds: ["project-id"],
};

const expectedDefaultTeam = {
	id: "default-22222222-2222-2222-2222-222222222222",
	team: "",
	active: false,
	companyIds: [],
	projectIds: [],
};

function stubNotionFetch() {
	const fetchMock = vi.fn().mockResolvedValue(
		Response.json({
			results: [fullTeamPage, defaultTeamPage],
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
		"https://api.notion.com/v1/data_sources/test-teams-data-source-id/query",
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

describe("Team API routes", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(routeCases)(
		"queries Notion and maps teams for $path",
		async ({ path, expectedBody }) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(response.status).toBe(200);
			expectNotionRequest(fetchMock, expectedBody);
			expect(await response.json()).toEqual({
				data: [expectedTeam, expectedDefaultTeam],
				count: 2,
				hasMore: false,
				nextCursor: null,
			});
		},
	);

	it("lets unknown Team subpaths fall through to the main Worker 404", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/teams/random/path");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it.each([
		"/api/teams?companyId=invalid",
		"/api/teams/active?companyId=invalid-uuid",
	])("returns 400 for invalid Team companyId without calling Notion", async (path) => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker(path);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual(invalidParameterResponse("companyId"));
	});

	it("returns null from the Team route handler for unknown subpaths", async () => {
		const response = await handleTeamRoutes(
			new IncomingRequest("http://example.com/api/teams/random/path"),
			new URL("http://example.com/api/teams/random/path"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});

