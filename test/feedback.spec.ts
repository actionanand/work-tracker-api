import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFeedbackRoutes } from "../src/features/feedback/feedback.routes";
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

const companyId = "11111111-1111-1111-1111-111111111111";
const compactCompanyId = "11111111111111111111111111111111";
const projectId = "33333333-3333-3333-3333-333333333333";
const teamId = "22222222-2222-2222-2222-222222222222";

const dateSort = [{ property: "Date", direction: "descending" }];

const appraisalFilter = {
	or: [
		{
			property: "Context",
			select: {
				equals: "Appraisal",
			},
		},
		{
			property: "Context",
			select: {
				equals: "Half-Yearly Appraisal",
			},
		},
	],
};

const improvementFollowUpFilter = {
	or: [
		{
			property: "Feedback Type",
			select: {
				equals: "Improvement",
			},
		},
		{
			property: "Feedback Type",
			select: {
				equals: "Suggestion",
			},
		},
	],
};

const negativeFilter = {
	property: "Feedback Type",
	select: {
		equals: "Negative",
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

const teamFilter = {
	property: "Team",
	relation: {
		contains: teamId,
	},
};

const personTypeFilter = {
	property: "Person Type",
	select: {
		equals: "Manager",
	},
};

const contextFilter = {
	property: "Context",
	select: {
		equals: "Weekly Update",
	},
};

const feedbackTypeFilter = {
	property: "Feedback Type",
	select: {
		equals: "Positive",
	},
};

const fromFilter = {
	property: "Date",
	date: {
		on_or_after: "2026-01-01",
	},
};

const toFilter = {
	property: "Date",
	date: {
		on_or_before: "2026-12-31",
	},
};

const routeCases = [
	{
		path: "/api/feedback",
		expectedBody: {
			page_size: 100,
			sorts: dateSort,
		},
	},
	{
		path: "/api/feedback/appraisal",
		expectedBody: {
			page_size: 100,
			filter: appraisalFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/feedback/improvement-follow-up",
		expectedBody: {
			page_size: 100,
			filter: improvementFollowUpFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/feedback/negative",
		expectedBody: {
			page_size: 100,
			filter: negativeFilter,
			sorts: dateSort,
		},
	},
	{
		path: `/api/feedback?companyId=${companyId}`,
		expectedBody: {
			page_size: 100,
			filter: companyFilter,
			sorts: dateSort,
		},
	},
	{
		path: `/api/feedback?companyId=${compactCompanyId}`,
		expectedBody: {
			page_size: 100,
			filter: companyFilter,
			sorts: dateSort,
		},
	},
	{
		path: `/api/feedback?projectId=${projectId}`,
		expectedBody: {
			page_size: 100,
			filter: projectFilter,
			sorts: dateSort,
		},
	},
	{
		path: `/api/feedback?teamId=${teamId}`,
		expectedBody: {
			page_size: 100,
			filter: teamFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/feedback?personType=Manager",
		expectedBody: {
			page_size: 100,
			filter: personTypeFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/feedback?context=Weekly%20Update",
		expectedBody: {
			page_size: 100,
			filter: contextFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/feedback?feedbackType=Positive",
		expectedBody: {
			page_size: 100,
			filter: feedbackTypeFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/feedback?from=2026-01-01",
		expectedBody: {
			page_size: 100,
			filter: fromFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/feedback?to=2026-12-31",
		expectedBody: {
			page_size: 100,
			filter: toFilter,
			sorts: dateSort,
		},
	},
	{
		path: "/api/feedback?from=2026-01-01&to=2026-12-31",
		expectedBody: {
			page_size: 100,
			filter: {
				and: [fromFilter, toFilter],
			},
			sorts: dateSort,
		},
	},
	{
		path: `/api/feedback/negative?companyId=${companyId}&from=2026-01-01&to=2026-12-31`,
		expectedBody: {
			page_size: 100,
			filter: {
				and: [negativeFilter, companyFilter, fromFilter, toFilter],
			},
			sorts: dateSort,
		},
	},
	{
		path: `/api/feedback?companyId=${companyId}&projectId=${projectId}&teamId=${teamId}&personType=Manager&context=Weekly%20Update&feedbackType=Positive&from=2026-01-01&to=2026-12-31`,
		expectedBody: {
			page_size: 100,
			filter: {
				and: [
					companyFilter,
					projectFilter,
					teamFilter,
					personTypeFilter,
					contextFilter,
					feedbackTypeFilter,
					fromFilter,
					toFilter,
				],
			},
			sorts: dateSort,
		},
	},
] as const;

const fullFeedbackPage = {
	id: "feedback-id",
	created_time: "2026-09-01T08:00:00.000Z",
	last_edited_time: "2026-09-01T09:00:00.000Z",
	properties: {
		Feedback: {
			title: [{ plain_text: "  Strong delivery  " }],
		},
		Date: {
			date: { start: "2026-09-01" },
		},
		"Feedback From": {
			rich_text: [{ plain_text: "  Priya  " }],
		},
		"Person Type": {
			select: { name: " Manager " },
		},
		Context: {
			select: { name: " Weekly Update " },
		},
		"Feedback Type": {
			select: { name: " Positive " },
		},
		Company: {
			relation: [{ id: companyId }],
		},
		Project: {
			relation: [{ id: projectId }],
		},
		Team: {
			relation: [{ id: teamId }],
		},
		Details: {
			rich_text: [{ plain_text: "  Delivered the release coordination well.  " }],
		},
		"Action / Follow-up": {
			rich_text: [{ plain_text: "  Share template with the team.  " }],
		},
	},
};

const defaultFeedbackPage = {
	id: "default-feedback-id",
	created_time: "2026-09-02T08:00:00.000Z",
	last_edited_time: "2026-09-02T09:00:00.000Z",
	properties: {},
};

const expectedFeedback = {
	id: "feedback-id",
	createdTime: "2026-09-01T08:00:00.000Z",
	lastEditedTime: "2026-09-01T09:00:00.000Z",
	feedback: "Strong delivery",
	date: "2026-09-01",
	feedbackFrom: "Priya",
	personType: "Manager",
	context: "Weekly Update",
	feedbackType: "Positive",
	details: "Delivered the release coordination well.",
	actionFollowUp: "Share template with the team.",
	companyIds: [companyId],
	projectIds: [projectId],
	teamIds: [teamId],
};

const expectedDefaultFeedback = {
	id: "default-feedback-id",
	createdTime: "2026-09-02T08:00:00.000Z",
	lastEditedTime: "2026-09-02T09:00:00.000Z",
	feedback: "",
	date: null,
	feedbackFrom: "",
	personType: null,
	context: null,
	feedbackType: null,
	details: "",
	actionFollowUp: "",
	companyIds: [],
	projectIds: [],
	teamIds: [],
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
			results: [fullFeedbackPage, defaultFeedbackPage],
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
		"https://api.notion.com/v1/data_sources/test-feedback-data-source-id/query",
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

describe("Feedback API routes", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(routeCases)(
		"queries Notion and maps Feedback for $path",
		async ({ path, expectedBody }) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(response.status).toBe(200);
			expectNotionRequest(fetchMock, expectedBody);
			expect(await response.json()).toEqual({
				data: [expectedFeedback, expectedDefaultFeedback],
				count: 2,
				hasMore: false,
				nextCursor: null,
			});
		},
	);

	it.each([
		["companyId", "/api/feedback?companyId=invalid"],
		["projectId", "/api/feedback?projectId=invalid"],
		["teamId", "/api/feedback?teamId=invalid"],
		["from", "/api/feedback?from=2026-99-99"],
		["to", "/api/feedback?to=not-a-date"],
	])(
		"returns 400 for invalid Feedback %s without calling Notion",
		async (parameter, path) => {
			const fetchMock = stubNotionFetch();

			const response = await fetchWorker(path);

			expect(fetchMock).not.toHaveBeenCalled();
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual(invalidParameterResponse(parameter));
		},
	);

	it("ignores empty select query parameters consistently", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker(
			"/api/feedback?personType=%20&context=&feedbackType=",
		);

		expect(response.status).toBe(200);
		expectNotionRequest(fetchMock, {
			page_size: 100,
			sorts: dateSort,
		});
	});

	it("lets unknown Feedback subpaths fall through to the main Worker 404", async () => {
		const fetchMock = stubNotionFetch();

		const response = await fetchWorker("/api/feedback/random");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("returns null from the Feedback route handler for unknown subpaths", async () => {
		const response = await handleFeedbackRoutes(
			new IncomingRequest("http://example.com/api/feedback/foo/bar"),
			new URL("http://example.com/api/feedback/foo/bar"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});
