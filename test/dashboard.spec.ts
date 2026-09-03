import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleDashboardRoutes } from "../src/features/dashboard/dashboard.routes";
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
const projectId = "33333333-3333-3333-3333-333333333333";
const compactProjectId = "33333333333333333333333333333333";
const teamId = "22222222-2222-2222-2222-222222222222";
const sprintId = "44444444-4444-4444-4444-444444444444";
const blockedJiraId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const activeSprintFilter = {
	property: "In Active Sprint",
	formula: {
		checkbox: {
			equals: true,
		},
	},
};

const projectFilter = {
	property: "Project",
	relation: {
		contains: projectId,
	},
};

const companyFilter = {
	property: "Company",
	relation: {
		contains: companyId,
	},
};

const hasDateFilter = {
	property: "Date",
	date: {
		is_not_empty: true,
	},
};

const activeWorkLinkFilter = {
	property: "Active",
	checkbox: {
		equals: true,
	},
};

const notionResponse = (results: unknown[]) =>
	Response.json({
		results,
		has_more: false,
		next_cursor: null,
	});

const dashboardSchema = new Map<string, Record<string, string>>([
	[
		testEnv.PROJECTS_DATA_SOURCE_ID,
		{
			Company: "relation",
			Team: "relation",
		},
	],
	[
		testEnv.SPRINTS_DATA_SOURCE_ID,
		{
			Project: "relation",
		},
	],
	[
		testEnv.JIRAS_DATA_SOURCE_ID,
		{
			Project: "relation",
		},
	],
	[
		testEnv.WORK_LOGS_DATA_SOURCE_ID,
		{
			Project: "relation",
			Company: "rollup",
			Team: "rollup",
			Sprints: "rollup",
		},
	],
	[
		testEnv.RELEASE_ITEMS_DATA_SOURCE_ID,
		{
			JIRAs: "relation",
			Sprints: "rollup",
			"JIRA Status": "rollup",
			"Spillover Count": "rollup",
		},
	],
	[
		testEnv.FEEDBACK_DATA_SOURCE_ID,
		{
			Company: "relation",
			Project: "rollup",
			Team: "relation",
		},
	],
	[
		testEnv.WORK_LINKS_DATA_SOURCE_ID,
		{
			Company: "relation",
			Project: "relation",
		},
	],
]);

function textProperty(value: string) {
	return {
		title: [{ plain_text: value }],
	};
}

function richTextProperty(value: string) {
	return {
		rich_text: [{ plain_text: value }],
	};
}

const companyPage = {
	id: companyId,
	properties: {
		Company: textProperty("Acme"),
		Active: { checkbox: true },
		Projects: { relation: [{ id: projectId }] },
		Teams: { relation: [{ id: teamId }] },
	},
};

const teamPage = {
	id: teamId,
	properties: {
		Team: textProperty("Platform"),
		Active: { checkbox: true },
		Company: { relation: [{ id: companyId }] },
	},
};

const projectPage = {
	id: projectId,
	properties: {
		Project: textProperty("Core API"),
		Active: { checkbox: true },
		Company: { relation: [{ id: companyId }] },
		Team: { relation: [{ id: teamId }] },
	},
};

const sprintPage = {
	id: sprintId,
	properties: {
		Sprint: textProperty("Sprint 42"),
		Active: { checkbox: true },
		"Start Date": { date: { start: "2026-09-01" } },
		"End Date": { date: { start: "2026-09-14" } },
		Project: { relation: [{ id: projectId }] },
	},
};

function jiraPage(
	id: string,
	key: string,
	status: string,
	overrides: Record<string, unknown> = {},
) {
	return {
		id,
		created_time: "2026-09-01T10:00:00.000Z",
		last_edited_time: "2026-09-02T10:00:00.000Z",
		properties: {
			"JIRA Key": textProperty(key),
			Summary: richTextProperty(`${key} summary`),
			Status: { status: { name: status } },
			Tags: { multi_select: [] },
			Appraisal: { checkbox: false },
			Spillover: { formula: { boolean: false } },
			"Spillover Count": { formula: { number: 0 } },
			"Spillover Reason": richTextProperty(""),
			"In Active Sprint": { formula: { boolean: true } },
			"Demo Required": { checkbox: false },
			"Demoed Date": { date: null },
			"Demo Notes": richTextProperty(""),
			Sprints: { relation: [{ id: sprintId }] },
			Project: { relation: [{ id: projectId }] },
			"Blocked By": { relation: [] },
			"Release Items": { relation: [] },
			...overrides,
		},
	};
}

const activeJira = jiraPage("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "CRI-1", "In Progress");
const blockedJira = jiraPage(blockedJiraId, "CRI-2", "Blocked");
const spilloverJira = jiraPage("cccccccc-cccc-cccc-cccc-cccccccccccc", "CRI-3", "In Progress", {
	Spillover: { formula: { boolean: true } },
	"Spillover Count": { formula: { number: 1 } },
});
const demoPendingJira = jiraPage("dddddddd-dddd-dddd-dddd-dddddddddddd", "CRI-4", "Ready", {
	"Demo Required": { checkbox: true },
	"Blocked By": { relation: [{ id: blockedJiraId }] },
});

const releaseJiraScopeFilter = {
	or: [activeJira, blockedJira, spilloverJira, demoPendingJira].map((jira) => ({
		property: "JIRAs",
		relation: {
			contains: jira.id,
		},
	})),
};

function workLogPage(index: number) {
	return {
		id: `work-log-${index}`,
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		properties: {
			Update: textProperty(`Work log ${index}`),
			Date: { date: { start: `2026-09-${String(index).padStart(2, "0")}` } },
			Category: { select: { name: "Delivery" } },
			Type: { select: { name: "Build" } },
			"Work Mode": { select: { name: "Focus" } },
			Project: { relation: [{ id: projectId }] },
			JIRAs: { relation: [{ id: activeJira.id }] },
			Company: { rollup: { array: [{ relation: [{ id: companyId }] }] } },
			Team: { rollup: { array: [{ relation: [{ id: teamId }] }] } },
			Sprints: { rollup: { array: [{ relation: [{ id: sprintId }] }] } },
		},
	};
}

const pendingRelease = {
	id: "release-pending",
	created_time: "2026-09-01T08:00:00.000Z",
	last_edited_time: "2026-09-01T09:00:00.000Z",
	properties: {
		"Release Items": textProperty("Release train"),
		"Component Name": richTextProperty("API"),
		"Deployment Type": { select: { name: "Service" } },
		"Formal Announced Date": { date: { start: "2026-09-10" } },
		"Confirmed Release Date": { date: null },
		JIRAs: { relation: [{ id: activeJira.id }] },
		Sprints: { rollup: { array: [{ relation: [{ id: sprintId }] }] } },
	},
};

const feedbackPage = {
	id: "feedback-id",
	created_time: "2026-09-01T08:00:00.000Z",
	last_edited_time: "2026-09-01T09:00:00.000Z",
	properties: {
		Feedback: textProperty("Useful feedback"),
		Date: { date: { start: "2026-09-01" } },
		Context: { select: { name: "Appraisal" } },
		"Feedback Type": { select: { name: "Positive" } },
		Company: { relation: [{ id: companyId }] },
		Project: { relation: [{ id: projectId }] },
		Team: { relation: [{ id: teamId }] },
	},
};

const activeWorkLink = {
	id: "work-link-id",
	created_time: "2026-09-01T08:00:00.000Z",
	last_edited_time: "2026-09-01T09:00:00.000Z",
	properties: {
		Link: textProperty("Runbook"),
		Type: { select: { name: "Documentation" } },
		URL: { url: "https://example.com/runbook" },
		Company: { relation: [{ id: companyId }] },
		Project: { relation: [{ id: projectId }] },
		Active: { checkbox: true },
	},
};

function bodyContains(body: unknown, value: string): boolean {
	return JSON.stringify(body).includes(value);
}

function hasDateCondition(
	filter: unknown,
	property: string,
	condition: "is_empty" | "is_not_empty",
): boolean {
	if (!filter || typeof filter !== "object") {
		return false;
	}

	const candidate = filter as {
		property?: unknown;
		date?: Record<string, unknown>;
		and?: unknown[];
		or?: unknown[];
	};

	if (candidate.property === property && candidate.date?.[condition] === true) {
		return true;
	}

	return [...(candidate.and ?? []), ...(candidate.or ?? [])].some((child) =>
		hasDateCondition(child, property, condition),
	);
}

function hasRelationCondition(
	filter: unknown,
	property: string,
	value: string,
): boolean {
	if (!filter || typeof filter !== "object") {
		return false;
	}

	const candidate = filter as {
		property?: unknown;
		relation?: { contains?: unknown };
		and?: unknown[];
		or?: unknown[];
	};

	if (
		candidate.property === property &&
		candidate.relation?.contains === value
	) {
		return true;
	}

	return [...(candidate.and ?? []), ...(candidate.or ?? [])].some((child) =>
		hasRelationCondition(child, property, value),
	);
}

function hasRelationProperty(filter: unknown, property: string): boolean {
	if (!filter || typeof filter !== "object") {
		return false;
	}

	const candidate = filter as {
		property?: unknown;
		relation?: unknown;
		and?: unknown[];
		or?: unknown[];
	};

	if (candidate.property === property && candidate.relation) {
		return true;
	}

	return [...(candidate.and ?? []), ...(candidate.or ?? [])].some((child) =>
		hasRelationProperty(child, property),
	);
}

function relationFilterMismatch(
	filter: unknown,
	schema: Record<string, string>,
): string | null {
	if (!filter || typeof filter !== "object") {
		return null;
	}

	const candidate = filter as {
		property?: unknown;
		relation?: unknown;
		and?: unknown[];
		or?: unknown[];
	};

	if (
		typeof candidate.property === "string" &&
		candidate.relation &&
		schema[candidate.property] &&
		schema[candidate.property] !== "relation"
	) {
		return candidate.property;
	}

	for (const child of [...(candidate.and ?? []), ...(candidate.or ?? [])]) {
		const mismatch = relationFilterMismatch(child, schema);

		if (mismatch) {
			return mismatch;
		}
	}

	return null;
}

function validateFilterAgainstSchema(dataSourceId: string, filter: unknown) {
	const schema = dashboardSchema.get(dataSourceId);
	const mismatch = schema ? relationFilterMismatch(filter, schema) : null;

	if (!mismatch) {
		return null;
	}

	return new Response(
		`The property type in the database does not match the property type of the filter provided: database property ${schema?.[mismatch]} does not match filter relation`,
		{
			status: 400,
		},
	);
}

function dashboardFetchStub(
	options: {
		companies?: unknown[];
		projects?: unknown[];
		sprints?: unknown[];
		projectJiras?: unknown[];
	} = {},
) {
	const companies = options.companies ?? [companyPage];
	const projects = options.projects ?? [projectPage];
	const sprints = options.sprints ?? [sprintPage];
	const projectJiras = options.projectJiras ?? [
		activeJira,
		blockedJira,
		spilloverJira,
		demoPendingJira,
	];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const body = init?.body ? JSON.parse(String(init.body)) : {};
		const dataSourceId = [...dashboardSchema.keys()].find((id) =>
			url.includes(id),
		);
		const validationError = dataSourceId
			? validateFilterAgainstSchema(dataSourceId, body.filter)
			: null;

		if (validationError) {
			return validationError;
		}

		if (url.includes(testEnv.COMPANIES_DATA_SOURCE_ID)) {
			return notionResponse(companies);
		}

		if (url.includes(testEnv.TEAMS_DATA_SOURCE_ID)) {
			return notionResponse([teamPage]);
		}

		if (url.includes(testEnv.PROJECTS_DATA_SOURCE_ID)) {
			return notionResponse(projects);
		}

		if (url.includes(testEnv.SPRINTS_DATA_SOURCE_ID)) {
			if (body.filter && bodyContains(body.filter, "Active")) {
				return notionResponse(sprints);
			}

			return notionResponse([sprintPage]);
		}

		if (url.includes(testEnv.JIRAS_DATA_SOURCE_ID)) {
			if (!body.filter) {
				return notionResponse([activeJira, blockedJira, spilloverJira, demoPendingJira]);
			}

			if (
				hasRelationCondition(body.filter, "Project", projectId) &&
				!bodyContains(body.filter, "In Active Sprint") &&
				!bodyContains(body.filter, "Status") &&
				!bodyContains(body.filter, "Spillover") &&
				!bodyContains(body.filter, "Demo Required")
			) {
				return notionResponse(projectJiras);
			}

			if (bodyContains(body.filter, "Status")) {
				return notionResponse([blockedJira]);
			}

			if (bodyContains(body.filter, "Spillover")) {
				return notionResponse([spilloverJira]);
			}

			if (bodyContains(body.filter, "Demo Required")) {
				return notionResponse([demoPendingJira]);
			}

			return notionResponse([activeJira, blockedJira, spilloverJira, demoPendingJira]);
		}

		if (url.includes(testEnv.WORK_LOGS_DATA_SOURCE_ID)) {
			return notionResponse(Array.from({ length: 10 }, (_, index) => workLogPage(index + 1)));
		}

		if (url.includes(testEnv.RELEASE_ITEMS_DATA_SOURCE_ID)) {
			if (
				hasDateCondition(
					body.filter,
					"Confirmed Release Date",
					"is_not_empty",
				)
			) {
				return notionResponse([pendingRelease, { ...pendingRelease, id: "release-confirmed" }]);
			}

			if (
				hasDateCondition(
					body.filter,
					"Formal Announced Date",
					"is_empty",
				)
			) {
				return notionResponse([]);
			}

			return notionResponse([pendingRelease]);
		}

		if (url.includes(testEnv.FEEDBACK_DATA_SOURCE_ID)) {
			if (bodyContains(body.filter, "Improvement")) {
				return notionResponse([feedbackPage]);
			}

			if (bodyContains(body.filter, "Negative")) {
				return notionResponse([]);
			}

			return notionResponse([feedbackPage, { ...feedbackPage, id: "feedback-id-2" }]);
		}

		if (url.includes(testEnv.WORK_LINKS_DATA_SOURCE_ID)) {
			return notionResponse([activeWorkLink]);
		}

		return notionResponse([]);
	});

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

function postedBodies(fetchMock: ReturnType<typeof vi.fn>, dataSourceId: string) {
	return fetchMock.mock.calls
		.filter(([url]) => String(url).includes(dataSourceId))
		.map(([, init]) => JSON.parse(String(init.body)));
}

describe("Dashboard API routes", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("returns the aggregate dashboard with enriched relations", async () => {
		const fetchMock = dashboardFetchStub();

		const response = await fetchWorker("/api/dashboard");
		const body = (await response.json()) as Record<string, any>;

		expect(response.status).toBe(200);
		expect(body.generatedAt).toEqual(expect.any(String));
		expect(body.company).toBeNull();
		expect(body.project).toBeNull();
		expect(body.currentSprint.projects).toEqual([{ id: projectId, name: "Core API" }]);
		expect(body.jiraSummary).toEqual({
			active: 4,
			blocked: 1,
			spillovers: 1,
			demoPending: 1,
		});
		expect(body.demoPendingJiras[0].blockedBy).toEqual([
			{ id: blockedJiraId, key: "CRI-2", summary: "CRI-2 summary" },
		]);
		expect(body.recentWorkLogs).toHaveLength(10);
		expect(body.recentWorkLogs[0].companies).toEqual([{ id: companyId, name: "Acme" }]);
		expect(body.releaseSummary).toEqual({
			pending: 1,
			confirmed: 2,
			notAnnounced: 0,
		});
		expect(body.pendingReleases[0].jiras).toEqual([
			{ id: activeJira.id, key: "CRI-1", summary: "CRI-1 summary" },
		]);
		expect(body.feedbackSummary).toEqual({
			appraisal: 2,
			improvementFollowUp: 1,
			negative: 0,
		});
		expect(body.activeWorkLinks[0].projects).toEqual([{ id: projectId, name: "Core API" }]);

		const workLogBodies = postedBodies(fetchMock, testEnv.WORK_LOGS_DATA_SOURCE_ID);
		expect(workLogBodies).toContainEqual({
			page_size: 10,
			filter: hasDateFilter,
			sorts: [{ property: "Date", direction: "descending" }],
		});
	});

	it("applies project scope to project-related dashboard queries", async () => {
		const fetchMock = dashboardFetchStub();

		const response = await fetchWorker(`/api/dashboard?projectId=${compactProjectId}`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(
			expect.objectContaining({
				project: { id: projectId, name: "Core API" },
			}),
		);

		expect(postedBodies(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)).toContainEqual({
			page_size: 100,
			filter: {
				and: [activeSprintFilter, projectFilter],
			},
		});
		expect(postedBodies(fetchMock, testEnv.WORK_LOGS_DATA_SOURCE_ID)).toContainEqual({
			page_size: 10,
			filter: {
				and: [hasDateFilter, projectFilter],
			},
			sorts: [{ property: "Date", direction: "descending" }],
		});
		expect(postedBodies(fetchMock, testEnv.WORK_LINKS_DATA_SOURCE_ID)).toContainEqual({
			page_size: 100,
			filter: {
				and: [activeWorkLinkFilter, projectFilter],
			},
			sorts: [{ property: "Link", direction: "ascending" }],
		});
		expect(postedBodies(fetchMock, testEnv.FEEDBACK_DATA_SOURCE_ID)).toContainEqual({
			page_size: 100,
			filter: {
				and: [
					{
						or: [
							{ property: "Context", select: { equals: "Appraisal" } },
							{
								property: "Context",
								select: { equals: "Half-Yearly Appraisal" },
							},
						],
					},
					companyFilter,
				],
			},
			sorts: [{ property: "Date", direction: "descending" }],
		});
	});

	it("scopes project Release Items through matching JIRAs, never Sprint rollups", async () => {
		const fetchMock = dashboardFetchStub();

		const response = await fetchWorker(`/api/dashboard?projectId=${projectId}`);

		expect(response.status).toBe(200);
		expect(postedBodies(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)).toContainEqual({
			page_size: 100,
			filter: projectFilter,
		});

		const releaseBodies = postedBodies(
			fetchMock,
			testEnv.RELEASE_ITEMS_DATA_SOURCE_ID,
		);

		expect(releaseBodies).toHaveLength(3);
		for (const body of releaseBodies) {
			expect(hasRelationProperty(body.filter, "Sprints")).toBe(false);
			expect(hasRelationCondition(body.filter, "Sprints", projectId)).toBe(false);
			expect(hasRelationCondition(body.filter, "JIRAs", activeJira.id)).toBe(true);
			expect(hasRelationCondition(body.filter, "JIRAs", projectId)).toBe(false);
		}

		expect(releaseBodies).toContainEqual({
			page_size: 100,
			filter: {
				and: [
					{
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
					},
					releaseJiraScopeFilter,
				],
			},
			sorts: [{ property: "Formal Announced Date", direction: "descending" }],
		});
	});

	it("returns zero project-scoped release counts when the Project has no JIRAs", async () => {
		const fetchMock = dashboardFetchStub({ projectJiras: [] });

		const response = await fetchWorker(`/api/dashboard?projectId=${projectId}`);
		const body = (await response.json()) as Record<string, any>;

		expect(response.status).toBe(200);
		expect(body.releaseSummary).toEqual({
			pending: 0,
			confirmed: 0,
			notAnnounced: 0,
		});
		expect(body.pendingReleases).toEqual([]);
		expect(postedBodies(fetchMock, testEnv.RELEASE_ITEMS_DATA_SOURCE_ID)).toHaveLength(
			0,
		);
	});

	it("validates company scope and resolves matching projects before querying scoped slices", async () => {
		const fetchMock = dashboardFetchStub();

		const response = await fetchWorker(`/api/dashboard?companyId=${companyId}`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(
			expect.objectContaining({
				company: { id: companyId, name: "Acme" },
				project: null,
			}),
		);
		expect(postedBodies(fetchMock, testEnv.PROJECTS_DATA_SOURCE_ID)).toContainEqual({
			page_size: 100,
			filter: companyFilter,
		});
		expect(postedBodies(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)).toContainEqual({
			page_size: 100,
			filter: {
				and: [activeSprintFilter, projectFilter],
			},
		});
	});

	it("uses Company relation for Feedback when company and project scope are both supplied", async () => {
		const fetchMock = dashboardFetchStub();

		const response = await fetchWorker(
			`/api/dashboard?companyId=${companyId}&projectId=${projectId}`,
		);

		expect(response.status).toBe(200);
		expect(postedBodies(fetchMock, testEnv.FEEDBACK_DATA_SOURCE_ID)).toContainEqual({
			page_size: 100,
			filter: {
				and: [
					{
						or: [
							{ property: "Context", select: { equals: "Appraisal" } },
							{
								property: "Context",
								select: { equals: "Half-Yearly Appraisal" },
							},
						],
					},
					companyFilter,
				],
			},
			sorts: [{ property: "Date", direction: "descending" }],
		});
	});

	it.each([
		["companyId", "/api/dashboard?companyId=invalid"],
		["projectId", "/api/dashboard?projectId=invalid"],
	])("returns 400 for invalid %s without calling Notion", async (parameter, path) => {
		const fetchMock = dashboardFetchStub();

		const response = await fetchWorker(path);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Invalid query parameter",
			parameter,
			message: "Expected a valid Notion page ID",
		});
	});

	it("returns 404 when a scoped company does not exist", async () => {
		const fetchMock = dashboardFetchStub({ companies: [] });

		const response = await fetchWorker(`/api/dashboard?companyId=${companyId}`);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Company not found",
		});
		expect(postedBodies(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)).toHaveLength(0);
	});

	it("returns 404 when a scoped project does not exist", async () => {
		const fetchMock = dashboardFetchStub({ projects: [] });

		const response = await fetchWorker(`/api/dashboard?projectId=${projectId}`);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Project not found",
		});
		expect(postedBodies(fetchMock, testEnv.JIRAS_DATA_SOURCE_ID)).toHaveLength(0);
	});

	it("returns null currentSprint and empty scoped collections when a company has no projects", async () => {
		dashboardFetchStub({ projects: [] });

		const response = await fetchWorker(`/api/dashboard?companyId=${companyId}`);
		const body = (await response.json()) as Record<string, any>;

		expect(response.status).toBe(200);
		expect(body.currentSprint).toBeNull();
		expect(body.activeJiras).toEqual([]);
		expect(body.recentWorkLogs).toEqual([]);
		expect(body.releaseSummary).toEqual({
			pending: 0,
			confirmed: 0,
			notAnnounced: 0,
		});
		expect(body.pendingReleases).toEqual([]);
	});

	it("lets unknown dashboard subpaths fall through to the main Worker 404", async () => {
		const fetchMock = dashboardFetchStub();

		const response = await fetchWorker("/api/dashboard/random");

		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("returns null from the Dashboard route handler for unknown subpaths", async () => {
		const response = await handleDashboardRoutes(
			new IncomingRequest("http://example.com/api/dashboard/random"),
			new URL("http://example.com/api/dashboard/random"),
			testEnv,
		);

		expect(response).toBeNull();
	});
});
