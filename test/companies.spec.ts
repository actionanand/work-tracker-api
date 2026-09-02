import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleCompanyRoutes } from "../src/features/companies/company.routes";
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
};

const activeFilter = {
	property: "Active",
	checkbox: {
		equals: true,
	},
};

const categoryFilter = {
	property: "Category",
	select: {
		equals: "Office Work",
	},
};

const routeCases = [
	{
		path: "/api/companies",
		expectedBody: {
			page_size: 100,
		},
	},
	{
		path: "/api/companies/active",
		expectedBody: {
			page_size: 100,
			filter: activeFilter,
		},
	},
	{
		path: "/api/companies?category=Office%20Work",
		expectedBody: {
			page_size: 100,
			filter: categoryFilter,
		},
	},
	{
		path: "/api/companies/active?category=Office%20Work",
		expectedBody: {
			page_size: 100,
			filter: {
				and: [activeFilter, categoryFilter],
			},
		},
	},
] as const;

const fullCompanyPage = {
	id: "company-id",
	properties: {
		Company: {
			title: [{ plain_text: "  Acme  " }],
		},
		Category: {
			select: { name: " Office Work " },
		},
		Division: {
			rich_text: [{ plain_text: "  Platform  " }],
		},
		Product: {
			rich_text: [{ plain_text: "  Tracker  " }],
		},
		Projects: {
			relation: [{ id: "project-id" }],
		},
		Teams: {
			relation: [{ id: "team-id" }],
		},
		Active: {
			checkbox: true,
		},
	},
};

const defaultCompanyPage = {
	id: "default-company-id",
	properties: {},
};

const expectedCompany = {
	id: "company-id",
	company: "Acme",
	category: "Office Work",
	division: "Platform",
	product: "Tracker",
	active: true,
	projectIds: ["project-id"],
	teamIds: ["team-id"],
};

const expectedDefaultCompany = {
	id: "default-company-id",
	company: "",
	category: null,
	division: "",
	product: "",
	active: false,
	projectIds: [],
	teamIds: [],
};

function stubNotionFetch() {
	const fetchMock = vi.fn().mockResolvedValue(
		Response.json({
			results: [fullCompanyPage, defaultCompanyPage],
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
		"https://api.notion.com/v1/data_sources/test-companies-data-source-id/query",
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

describe("Company API routes", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(routeCases)(
		"queries Notion and maps companies for $path",
		async ({ path, expectedBody }) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(response.status).toBe(200);
			expectNotionRequest(fetchMock, expectedBody);
			expect(await response.json()).toEqual({
				data: [expectedCompany, expectedDefaultCompany],
				count: 2,
				hasMore: false,
				nextCursor: null,
			});
		},
	);

	it("lets unknown Company subpaths fall through to the main Worker 404", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/companies/random/path");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("returns null from the Company route handler for unknown subpaths", async () => {
		const response = await handleCompanyRoutes(
			new IncomingRequest("http://example.com/api/companies/random/path"),
			new URL("http://example.com/api/companies/random/path"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});
