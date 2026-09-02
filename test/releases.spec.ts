import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleReleaseRoutes } from "../src/features/releases/release.routes";
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
};

const jiraId = "55555555-5555-5555-5555-555555555555";
const compactJiraId = "55555555555555555555555555555555";

const announcedDateSort = [
	{ property: "Formal Announced Date", direction: "descending" },
];
const confirmedDateSort = [
	{ property: "Confirmed Release Date", direction: "descending" },
];

const pendingFilter = {
	and: [
		{
			property: "Formal Announced Date",
			date: {
				is_not_empty: true,
			},
		},
		{
			property: "Confirmed Release Date",
			date: {
				is_empty: true,
			},
		},
	],
};

const confirmedFilter = {
	property: "Confirmed Release Date",
	date: {
		is_not_empty: true,
	},
};

const notAnnouncedFilter = {
	property: "Formal Announced Date",
	date: {
		is_empty: true,
	},
};

const jiraFilter = {
	property: "JIRAs",
	relation: {
		contains: jiraId,
	},
};

const deploymentTypeFilter = {
	property: "Deployment Type",
	select: {
		equals: "Backstage",
	},
};

const componentFilter = {
	property: "Component Name",
	rich_text: {
		contains: "cortellis",
	},
};

const fromFilter = {
	property: "Formal Announced Date",
	date: {
		on_or_after: "2026-08-01",
	},
};

const toFilter = {
	property: "Formal Announced Date",
	date: {
		on_or_before: "2026-09-30",
	},
};

const routeCases = [
	{
		path: "/api/releases",
		expectedBody: {
			page_size: 100,
			sorts: announcedDateSort,
		},
	},
	{
		path: "/api/releases/pending",
		expectedBody: {
			page_size: 100,
			filter: pendingFilter,
			sorts: announcedDateSort,
		},
	},
	{
		path: "/api/releases/confirmed",
		expectedBody: {
			page_size: 100,
			filter: confirmedFilter,
			sorts: confirmedDateSort,
		},
	},
	{
		path: "/api/releases/not-announced",
		expectedBody: {
			page_size: 100,
			filter: notAnnouncedFilter,
			sorts: announcedDateSort,
		},
	},
	{
		path: `/api/releases?jiraId=${jiraId}`,
		expectedBody: {
			page_size: 100,
			filter: jiraFilter,
			sorts: announcedDateSort,
		},
	},
	{
		path: `/api/releases?jiraId=${compactJiraId}`,
		expectedBody: {
			page_size: 100,
			filter: jiraFilter,
			sorts: announcedDateSort,
		},
	},
	{
		path: "/api/releases?deploymentType=Backstage",
		expectedBody: {
			page_size: 100,
			filter: deploymentTypeFilter,
			sorts: announcedDateSort,
		},
	},
	{
		path: "/api/releases?component=cortellis",
		expectedBody: {
			page_size: 100,
			filter: componentFilter,
			sorts: announcedDateSort,
		},
	},
	{
		path: "/api/releases?from=2026-08-01",
		expectedBody: {
			page_size: 100,
			filter: fromFilter,
			sorts: announcedDateSort,
		},
	},
	{
		path: "/api/releases?to=2026-09-30",
		expectedBody: {
			page_size: 100,
			filter: toFilter,
			sorts: announcedDateSort,
		},
	},
	{
		path: "/api/releases?from=2026-08-01&to=2026-09-30",
		expectedBody: {
			page_size: 100,
			filter: {
				and: [fromFilter, toFilter],
			},
			sorts: announcedDateSort,
		},
	},
	{
		path: `/api/releases/pending?jiraId=${jiraId}&deploymentType=Backstage`,
		expectedBody: {
			page_size: 100,
			filter: {
				and: [pendingFilter, jiraFilter, deploymentTypeFilter],
			},
			sorts: announcedDateSort,
		},
	},
	{
		path: `/api/releases?jiraId=${jiraId}&deploymentType=Backstage&component=cortellis&from=2026-08-01&to=2026-09-30`,
		expectedBody: {
			page_size: 100,
			filter: {
				and: [
					jiraFilter,
					deploymentTypeFilter,
					componentFilter,
					fromFilter,
					toFilter,
				],
			},
			sorts: announcedDateSort,
		},
	},
] as const;

const fullReleasePage = {
	id: "release-item-id",
	created_time: "2026-09-01T08:00:00.000Z",
	last_edited_time: "2026-09-01T09:00:00.000Z",
	properties: {
		"Release Items": {
			title: [{ plain_text: "  Release CRI-1234  " }],
		},
		JIRAs: {
			relation: [{ id: jiraId }],
		},
		"Component Name": {
			rich_text: [{ plain_text: "  cortellis-admin  " }],
		},
		"Deployment Type": {
			select: { name: " Backstage " },
		},
		"Version Number": {
			rich_text: [{ plain_text: "  76.0.193-9862616  " }],
		},
		Branch: {
			rich_text: [{ plain_text: "  release/76.0  " }],
		},
		"Formal Announced Date": {
			date: { start: "2026-09-01" },
		},
		"Confirmed Release Date": {
			date: { start: "2026-09-03" },
		},
		Notes: {
			rich_text: [{ plain_text: "  TAR tracked in release notes  " }],
		},
		"JIRA Status": {
			rollup: {
				type: "array",
				array: [
					{
						type: "status",
						status: { name: " Done " },
					},
					{
						type: "select",
						select: { name: "Blocked" },
					},
				],
			},
		},
		Sprints: {
			rollup: {
				type: "array",
				array: [
					{
						type: "relation",
						relation: [{ id: "44444444-4444-4444-4444-444444444444" }],
					},
				],
			},
		},
		"Spillover Count": {
			rollup: {
				type: "array",
				array: [
					{
						type: "formula",
						formula: {
							type: "number",
							number: 2,
						},
					},
					{
						type: "number",
						number: 1,
					},
				],
			},
		},
	},
};

const defaultReleasePage = {
	id: "default-release-item-id",
	created_time: "2026-09-02T08:00:00.000Z",
	last_edited_time: "2026-09-02T09:00:00.000Z",
	properties: {},
};

const expectedReleaseItem = {
	id: "release-item-id",
	createdTime: "2026-09-01T08:00:00.000Z",
	lastEditedTime: "2026-09-01T09:00:00.000Z",
	releaseItem: "Release CRI-1234",
	componentName: "cortellis-admin",
	deploymentType: "Backstage",
	versionNumber: "76.0.193-9862616",
	branch: "release/76.0",
	formalAnnouncedDate: "2026-09-01",
	confirmedReleaseDate: "2026-09-03",
	notes: "TAR tracked in release notes",
	jiraIds: [jiraId],
	jiraStatuses: ["Done", "Blocked"],
	sprintIds: ["44444444-4444-4444-4444-444444444444"],
	spilloverCount: 3,
};

const expectedDefaultReleaseItem = {
	id: "default-release-item-id",
	createdTime: "2026-09-02T08:00:00.000Z",
	lastEditedTime: "2026-09-02T09:00:00.000Z",
	releaseItem: "",
	componentName: "",
	deploymentType: null,
	versionNumber: "",
	branch: "",
	formalAnnouncedDate: null,
	confirmedReleaseDate: null,
	notes: "",
	jiraIds: [],
	jiraStatuses: [],
	sprintIds: [],
	spilloverCount: 0,
};

const invalidParameterResponse = (parameter: string) => ({
	error: parameter === "from" || parameter === "to"
		? "Invalid date query parameter"
		: "Invalid query parameter",
	parameter,
	...(parameter === "from" || parameter === "to"
		? { expectedFormat: "YYYY-MM-DD" }
		: { message: "Expected a valid Notion page ID" }),
});

function stubNotionFetch() {
	const fetchMock = vi.fn().mockResolvedValue(
		Response.json({
			results: [fullReleasePage, defaultReleasePage],
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
		"https://api.notion.com/v1/data_sources/test-release-items-data-source-id/query",
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

describe("Release API routes", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(routeCases)(
		"queries Notion and maps Release Items for $path",
		async ({ path, expectedBody }) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(response.status).toBe(200);
			expectNotionRequest(fetchMock, expectedBody);
			expect(await response.json()).toEqual({
				data: [expectedReleaseItem, expectedDefaultReleaseItem],
				count: 2,
				hasMore: false,
				nextCursor: null,
			});
		},
	);

	it.each([
		["jiraId", "/api/releases?jiraId=invalid"],
		["from", "/api/releases?from=2026-99-99"],
		["to", "/api/releases?to=not-a-date"],
	])(
		"returns 400 for invalid Release %s without calling Notion",
		async (parameter, path) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(fetchMock).not.toHaveBeenCalled();
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual(invalidParameterResponse(parameter));
		},
	);

	it("ignores empty text query parameters consistently", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/releases?deploymentType=%20&component=");

		expect(response.status).toBe(200);
		expectNotionRequest(fetchMock, {
			page_size: 100,
			sorts: announcedDateSort,
		});
	});

	it("lets unknown Release subpaths fall through to the main Worker 404", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/releases/random");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("returns null from the Release route handler for unknown subpaths", async () => {
		const response = await handleReleaseRoutes(
			new IncomingRequest("http://example.com/api/releases/foo/bar"),
			new URL("http://example.com/api/releases/foo/bar"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});
