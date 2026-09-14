import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { createTodo } from "../src/features/todos/todo.service";
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
const todoPageId = "11111111-1111-1111-1111-111111111111";

const optionIds = {
	status: "status-open",
	daily: "schedule-daily",
	weekly: "schedule-weekly",
	monthly: "schedule-monthly",
	yearly: "schedule-yearly",
	custom: "schedule-custom",
	monday: "weekday-monday",
	tuesday: "weekday-tuesday",
	friday: "weekday-friday",
	someday: "weekday-someday",
	february: "month-february",
	april: "month-april",
	december: "month-december",
	smarchar: "month-smarchar",
	lastDay: "month-end-last",
	dayBeforeLast: "month-end-before-last",
	middle: "month-end-middle",
} as const;

function makeEnv(): Env {
	return {
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
}

async function fetchWorker(
	env: Env,
	path: string,
	init: RequestInit = {},
	authenticated = true,
): Promise<Response> {
	const headers = new Headers(init.headers);
	if (authenticated) {
		for (const [key, value] of new Headers(await createAuthHeaders(env))) headers.set(key, value);
	}

	const request = new IncomingRequest(`http://example.com${path}`, {
		method: init.method,
		body: init.body,
		headers,
	});
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
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

function options(type: "select" | "status" | "multi_select", values: Record<string, string>) {
	return {
		type,
		[type]: {
			options: Object.entries(values).map(([name, id]) => ({ id, name, color: "default" })),
		},
	};
}

function todoSchema() {
	return {
		"To Do": { type: "title", title: {} },
		Status: options("status", { "Not started": optionIds.status }),
		"Due Date": { type: "date", date: {} },
		Notes: { type: "rich_text", rich_text: {} },
		Schedule: options("select", {
			Daily: optionIds.daily,
			Weekly: optionIds.weekly,
			Monthly: optionIds.monthly,
			Yearly: optionIds.yearly,
			Custom: optionIds.custom,
		}),
		"Repeat On": options("multi_select", {
			Monday: optionIds.monday,
			Tuesday: optionIds.tuesday,
			Friday: optionIds.friday,
			Someday: optionIds.someday,
		}),
		Interval: { type: "number", number: {} },
		"Repeat Day": { type: "number", number: {} },
		"Repeat Month": options("select", {
			February: optionIds.february,
			April: optionIds.april,
			December: optionIds.december,
			Smarchar: optionIds.smarchar,
		}),
		"Month End": options("select", {
			"Last day": optionIds.lastDay,
			"Day before last day": optionIds.dayBeforeLast,
			Middle: optionIds.middle,
		}),
		"Repeat Start": { type: "date", date: {} },
		"Workday Adjust": { type: "checkbox", checkbox: {} },
		Assignee: { type: "people", people: {} },
		Created: { type: "created_time", created_time: {} },
		"Last Edited": { type: "last_edited_time", last_edited_time: {} },
		Recurring: { type: "formula", formula: {} },
		"Show Today": { type: "formula", formula: {} },
		"Setup Issue": { type: "formula", formula: {} },
	};
}

function todoPage(propertyOverrides: Record<string, unknown> = {}) {
	return {
		id: todoPageId,
		created_time: "2026-09-01T08:00:00.000Z",
		last_edited_time: "2026-09-01T09:00:00.000Z",
		parent: { data_source_id: "test-todos-data-source-id" },
		properties: {
			"To Do": { title: [{ plain_text: "Weekly report" }] },
			Status: { status: { name: "Not started" } },
			"Due Date": { date: null },
			Notes: { rich_text: [{ plain_text: "Prepare metrics" }] },
			Schedule: { select: { name: "Weekly" } },
			"Repeat On": { multi_select: [{ name: "Tuesday" }, { name: "Friday" }] },
			Interval: { number: 2 },
			"Repeat Day": { number: null },
			"Repeat Month": { select: null },
			"Month End": { select: null },
			"Repeat Start": { date: { start: "2026-09-14" } },
			"Workday Adjust": { checkbox: true },
			Recurring: { formula: { type: "boolean", boolean: true } },
			"Show Today": { formula: { type: "boolean", boolean: false } },
			"Setup Issue": { formula: { type: "string", string: "" } },
			...propertyOverrides,
		},
	};
}

function normalTodoPage() {
	return todoPage({
		"Due Date": { date: { start: "2026-09-20" } },
		Schedule: { select: null },
		"Repeat On": { multi_select: [] },
		Interval: { number: null },
		"Repeat Start": { date: null },
		"Workday Adjust": { checkbox: false },
		Recurring: { formula: { type: "boolean", boolean: false } },
	});
}

function notionMock(env: Env, existingPage = normalTodoPage()) {
	return vi.fn((url: string, init?: RequestInit) => {
		if (url.endsWith(`/data_sources/${env.TODOS_DATA_SOURCE_ID}`)) {
			return Promise.resolve(Response.json({ properties: todoSchema() }));
		}
		if (url.includes(`/data_sources/${env.TODOS_DATA_SOURCE_ID}/query`)) {
			return Promise.resolve(
				Response.json({ results: [todoPage()], has_more: true, next_cursor: "todo-next" }),
			);
		}
		if (url.endsWith(`/v1/pages/${todoPageId}`) && init?.method === "GET") {
			return Promise.resolve(Response.json(existingPage));
		}
		if (url.endsWith("/v1/pages") || (url.endsWith(`/v1/pages/${todoPageId}`) && init?.method === "PATCH")) {
			return Promise.resolve(Response.json(todoPage()));
		}
		return Promise.resolve(Response.json({}));
	});
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, method: string): Record<string, unknown> {
	const call = fetchMock.mock.calls.find(([, init]) => init?.method === method && init.body);
	if (!call) throw new Error(`No ${method} request found`);
	return JSON.parse(String(call[1]?.body)) as Record<string, unknown>;
}

describe("Todo recurrence API", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("maps the complete recurrence and formula response contract", async () => {
		const env = makeEnv();
		vi.stubGlobal("fetch", notionMock(env));

		const response = await fetchWorker(env, "/api/todos");
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			data: [{
				toDo: "Weekly report",
				schedule: "Weekly",
				repeatOn: ["Tuesday", "Friday"],
				interval: 2,
				repeatDay: null,
				repeatMonth: null,
				monthEnd: null,
				repeatStart: "2026-09-14",
				workdayAdjust: true,
				recurring: true,
				showToday: false,
				setupIssue: "",
			}],
		});
	});

	it("maps empty recurrence properties to stable null, array, boolean, and string values", async () => {
		const env = makeEnv();
		const mock = notionMock(env);
		mock.mockImplementationOnce(() =>
			Promise.resolve(Response.json({ results: [normalTodoPage()], has_more: false, next_cursor: null })),
		);
		vi.stubGlobal("fetch", mock);

		const response = await fetchWorker(env, "/api/todos");
		expect(await response.json()).toMatchObject({
			data: [{
				schedule: null,
				repeatOn: [],
				interval: null,
				repeatStart: null,
				workdayAdjust: false,
				recurring: false,
				setupIssue: "",
			}],
		});
	});

	it("exposes all writable and read-only Todo metadata fields with live options", async () => {
		const env = makeEnv();
		vi.stubGlobal("fetch", notionMock(env));

		const response = await fetchWorker(env, "/api/todos/meta");
		const body = await response.json() as { fields: Array<{ key: string; writable: boolean; options?: unknown[] }> };
		const fields = Object.fromEntries(body.fields.map((field) => [field.key, field]));

		expect(fields.scheduleOptionId).toMatchObject({ writable: true });
		expect(fields.scheduleOptionId.options).toHaveLength(5);
		expect(fields.repeatOnOptionIds.options).toHaveLength(4);
		expect(fields.repeatMonthOptionId.options).toHaveLength(4);
		expect(fields.monthEndOptionId.options).toHaveLength(3);
		expect(fields.workdayAdjust).toMatchObject({ writable: true });
		expect(fields.recurring).toMatchObject({ writable: false });
		expect(fields.showToday).toMatchObject({ writable: false });
		expect(fields.setupIssue).toMatchObject({ writable: false });
		expect(Object.keys(fields)).toEqual([
			"toDo",
			"statusOptionId",
			"dueDate",
			"assignee",
			"notes",
			"scheduleOptionId",
			"repeatOnOptionIds",
			"interval",
			"repeatDay",
			"repeatMonthOptionId",
			"monthEndOptionId",
			"repeatStart",
			"workdayAdjust",
			"created",
			"lastEdited",
			"recurring",
			"showToday",
			"setupIssue",
		]);
	});

	it("sends all new QUERY filter families to Notion with cursor pagination", async () => {
		const env = makeEnv();
		const mock = notionMock(env);
		vi.stubGlobal("fetch", mock);

		const response = await fetchWorker(env, "/api/todos", jsonRequest("QUERY", {
			pageSize: 12,
			cursor: "cursor-1",
			filters: {
				statuses: ["Not started"],
				dueFrom: "2026-09-15",
				q: "report",
				schedules: ["Daily", "Weekly"],
				recurring: false,
				showToday: true,
				workdayAdjust: true,
				hasSetupIssue: false,
			},
		}));
		const body = requestBody(mock, "POST");

		expect(response.status).toBe(200);
		expect(body).toEqual({
			page_size: 12,
			start_cursor: "cursor-1",
			filter: { and: [
				{ property: "Status", status: { equals: "Not started" } },
				{ property: "Due Date", date: { on_or_after: "2026-09-15" } },
				{ property: "To Do", title: { contains: "report" } },
				{ or: [
					{ property: "Schedule", select: { equals: "Daily" } },
					{ property: "Schedule", select: { equals: "Weekly" } },
				] },
				{ property: "Recurring", formula: { checkbox: { equals: false } } },
				{ property: "Show Today", formula: { checkbox: { equals: true } } },
				{ property: "Workday Adjust", checkbox: { equals: true } },
				{ property: "Setup Issue", formula: { string: { is_empty: true } } },
			] },
			sorts: [{ property: "Due Date", direction: "ascending" }],
		});
		expect(await response.json()).toMatchObject({ hasMore: true, nextCursor: "todo-next" });
	});

	it.each([
		["recurring", true, { property: "Recurring", formula: { checkbox: { equals: true } } }],
		["recurring", false, { property: "Recurring", formula: { checkbox: { equals: false } } }],
		["showToday", true, { property: "Show Today", formula: { checkbox: { equals: true } } }],
		["showToday", false, { property: "Show Today", formula: { checkbox: { equals: false } } }],
		["workdayAdjust", true, { property: "Workday Adjust", checkbox: { equals: true } }],
		["workdayAdjust", false, { property: "Workday Adjust", checkbox: { equals: false } }],
		["hasSetupIssue", true, { property: "Setup Issue", formula: { string: { is_not_empty: true } } }],
		["hasSetupIssue", false, { property: "Setup Issue", formula: { string: { is_empty: true } } }],
	])("queries %s=%s without adding implicit filters", async (field, value, expectedFilter) => {
		const env = makeEnv();
		const mock = notionMock(env);
		vi.stubGlobal("fetch", mock);

		const response = await fetchWorker(env, "/api/todos", jsonRequest("QUERY", {
			filters: { [field]: value },
		}));

		expect(response.status).toBe(200);
		expect(requestBody(mock, "POST")).toMatchObject({ filter: expectedFilter });
	});

	it.each([
		["normal", { dueDate: "2026-09-20" }],
		["daily", { scheduleOptionId: optionIds.daily }],
		["daily interval", { scheduleOptionId: optionIds.daily, interval: 3, repeatStart: "2026-09-14" }],
		["weekly Monday", { scheduleOptionId: optionIds.weekly, repeatOnOptionIds: [optionIds.monday] }],
		["weekly Tuesday and Friday", { scheduleOptionId: optionIds.weekly, repeatOnOptionIds: [optionIds.tuesday, optionIds.friday] }],
		["weekly interval", { scheduleOptionId: optionIds.weekly, repeatOnOptionIds: [optionIds.monday], interval: 2, repeatStart: "2026-09-14" }],
		["monthly day", { scheduleOptionId: optionIds.monthly, repeatDay: 15 }],
		["monthly last day", { scheduleOptionId: optionIds.monthly, monthEndOptionId: optionIds.lastDay }],
		["monthly day before last", { scheduleOptionId: optionIds.monthly, monthEndOptionId: optionIds.dayBeforeLast }],
		["yearly", { scheduleOptionId: optionIds.yearly, repeatMonthOptionId: optionIds.december, repeatDay: 25 }],
		["workday adjustment", { scheduleOptionId: optionIds.daily, workdayAdjust: true }],
	])("creates a valid %s Todo", async (_name, recurrence) => {
		const env = makeEnv();
		const mock = notionMock(env);
		vi.stubGlobal("fetch", mock);

		const response = await fetchWorker(env, "/api/todos", jsonRequest("POST", {
			toDo: "Todo",
			statusOptionId: optionIds.status,
			...recurrence,
		}));

		expect(response.status).toBe(201);
		expect(requestBody(mock, "POST")).toHaveProperty("properties.To Do");
	});

	it("clears all recurrence fields and Workday Adjust when Schedule is removed", async () => {
		const env = makeEnv();
		const mock = notionMock(env, todoPage());
		vi.stubGlobal("fetch", mock);

		const response = await fetchWorker(env, `/api/todos/${todoPageId}`, jsonRequest("PATCH", {
			scheduleOptionId: null,
		}));
		const properties = (requestBody(mock, "PATCH").properties ?? {}) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(properties).toMatchObject({
			Schedule: { select: null },
			"Repeat On": { multi_select: [] },
			Interval: { number: null },
			"Repeat Day": { number: null },
			"Repeat Month": { select: null },
			"Month End": { select: null },
			"Repeat Start": { date: null },
			"Workday Adjust": { checkbox: false },
		});
	});

	it("clears an old Due Date when a normal Todo becomes recurring", async () => {
		const env = makeEnv();
		const mock = notionMock(env, normalTodoPage());
		vi.stubGlobal("fetch", mock);

		const response = await fetchWorker(env, `/api/todos/${todoPageId}`, jsonRequest("PATCH", {
			scheduleOptionId: optionIds.weekly,
			repeatOnOptionIds: [optionIds.monday],
		}));

		expect(response.status).toBe(200);
		expect(requestBody(mock, "PATCH")).toHaveProperty("properties.Due Date", { date: null });
	});

	it("cleans incompatible fields when changing Weekly to Monthly", async () => {
		const env = makeEnv();
		const mock = notionMock(env, todoPage());
		vi.stubGlobal("fetch", mock);

		const response = await fetchWorker(env, `/api/todos/${todoPageId}`, jsonRequest("PATCH", {
			scheduleOptionId: optionIds.monthly,
			repeatDay: 10,
		}));
		const body = requestBody(mock, "PATCH");

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ properties: {
			"Repeat On": { multi_select: [] },
			Interval: { number: null },
			"Repeat Start": { date: null },
			"Repeat Month": { select: null },
			"Repeat Day": { number: 10 },
		} });
	});

	it("cleans Month End and requires month/day when changing Monthly to Yearly", async () => {
		const env = makeEnv();
		const monthly = todoPage({
			Schedule: { select: { name: "Monthly" } },
			"Repeat On": { multi_select: [] },
			Interval: { number: null },
			"Repeat Day": { number: null },
			"Month End": { select: { name: "Last day" } },
			"Repeat Start": { date: null },
		});
		const mock = notionMock(env, monthly);
		vi.stubGlobal("fetch", mock);

		const response = await fetchWorker(env, `/api/todos/${todoPageId}`, jsonRequest("PATCH", {
			scheduleOptionId: optionIds.yearly,
			repeatMonthOptionId: optionIds.december,
			repeatDay: 25,
		}));

		expect(response.status).toBe(200);
		expect(requestBody(mock, "PATCH")).toHaveProperty("properties.Month End", { select: null });
	});

	it.each([
		["recurring with Due Date", { scheduleOptionId: optionIds.daily, dueDate: "2026-09-20" }, "dueDate"],
		["Workday Adjust without Schedule", { workdayAdjust: true }, "workdayAdjust"],
		["Weekly without Repeat On", { scheduleOptionId: optionIds.weekly }, "repeatOnOptionIds"],
		["unsupported weekday", { scheduleOptionId: optionIds.weekly, repeatOnOptionIds: [optionIds.someday] }, "repeatOnOptionIds"],
		["zero Interval", { scheduleOptionId: optionIds.daily, interval: 0 }, "interval"],
		["negative Interval", { scheduleOptionId: optionIds.daily, interval: -1 }, "interval"],
		["fractional Interval", { scheduleOptionId: optionIds.daily, interval: 1.5 }, "interval"],
		["wrong Interval type", { scheduleOptionId: optionIds.daily, interval: "2" }, "interval"],
		["interval without start", { scheduleOptionId: optionIds.daily, interval: 2 }, "repeatStart"],
		["start without interval", { scheduleOptionId: optionIds.daily, repeatStart: "2026-09-14" }, "repeatStart"],
		["Monthly missing day and end", { scheduleOptionId: optionIds.monthly }, "repeatDay"],
		["Monthly with day and end", { scheduleOptionId: optionIds.monthly, repeatDay: 15, monthEndOptionId: optionIds.lastDay }, "repeatDay"],
		["Monthly day zero", { scheduleOptionId: optionIds.monthly, repeatDay: 0 }, "repeatDay"],
		["Monthly day 32", { scheduleOptionId: optionIds.monthly, repeatDay: 32 }, "repeatDay"],
		["Yearly missing month", { scheduleOptionId: optionIds.yearly, repeatDay: 1 }, "repeatMonthOptionId"],
		["Yearly missing day", { scheduleOptionId: optionIds.yearly, repeatMonthOptionId: optionIds.december }, "repeatDay"],
		["February 29", { scheduleOptionId: optionIds.yearly, repeatMonthOptionId: optionIds.february, repeatDay: 29 }, "repeatDay"],
		["April 31", { scheduleOptionId: optionIds.yearly, repeatMonthOptionId: optionIds.april, repeatDay: 31 }, "repeatDay"],
		["stale Schedule option", { scheduleOptionId: optionIds.custom }, "scheduleOptionId"],
		["stale Month End option", { scheduleOptionId: optionIds.monthly, monthEndOptionId: optionIds.middle }, "monthEndOptionId"],
		["stale Repeat Month option", { scheduleOptionId: optionIds.yearly, repeatMonthOptionId: optionIds.smarchar, repeatDay: 1 }, "repeatMonthOptionId"],
		["formula field", { recurring: true }, "recurring"],
	])("rejects invalid %s writes", async (_name, values, field) => {
		const env = makeEnv();
		const mock = notionMock(env);
		vi.stubGlobal("fetch", mock);

		const response = await fetchWorker(env, "/api/todos", jsonRequest("POST", {
			toDo: "Invalid Todo",
			...values,
		}));

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "Invalid request", field });
		expect(mock.mock.calls.some(([url]) => String(url).endsWith("/v1/pages"))).toBe(false);
	});

	it("rejects non-finite Interval values at the service boundary", async () => {
		const env = makeEnv();
		const mock = notionMock(env);
		vi.stubGlobal("fetch", mock);

		await expect(createTodo(env, {
			toDo: "Invalid Todo",
			scheduleOptionId: optionIds.daily,
			interval: Number.NaN,
		})).rejects.toMatchObject({ name: "TodoWriteValidationError" });
	});

	it("validates the complete existing state before PATCH", async () => {
		const env = makeEnv();
		const invalidWeekly = todoPage({ "Repeat On": { multi_select: [] } });
		const mock = notionMock(env, invalidWeekly);
		vi.stubGlobal("fetch", mock);

		const response = await fetchWorker(env, `/api/todos/${todoPageId}`, jsonRequest("PATCH", {
			notes: "Only notes changed",
		}));

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ field: "repeatOnOptionIds" });
	});
});

describe("Work calendar settings API", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("returns the Saturday/Sunday default with no stored row", async () => {
		const env = makeEnv();
		const response = await fetchWorker(env, "/api/settings/work-calendar");

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(await response.json()).toEqual({ data: { weekOffDays: ["Saturday", "Sunday"] } });
	});

	it("persists valid settings and returns canonical weekday order", async () => {
		const env = makeEnv();
		const patched = await fetchWorker(env, "/api/settings/work-calendar", jsonRequest("PATCH", {
			weekOffDays: ["Saturday", "Friday"],
		}));
		const fetched = await fetchWorker(env, "/api/settings/work-calendar");

		expect(patched.status).toBe(200);
		expect(patched.headers.get("Cache-Control")).toBe("no-store");
		expect(await patched.json()).toEqual({ data: { weekOffDays: ["Friday", "Saturday"] } });
		expect(await fetched.json()).toEqual({ data: { weekOffDays: ["Friday", "Saturday"] } });
	});

	it("accepts an empty week-off list", async () => {
		const env = makeEnv();
		const response = await fetchWorker(env, "/api/settings/work-calendar", jsonRequest("PATCH", {
			weekOffDays: [],
		}));
		expect(await response.json()).toEqual({ data: { weekOffDays: [] } });
	});

	it.each([
		["non-array", { weekOffDays: "Saturday" }, "weekOffDays"],
		["duplicate", { weekOffDays: ["Saturday", "Saturday"] }, "weekOffDays"],
		["unknown weekday", { weekOffDays: ["Funday"] }, "weekOffDays"],
		["all weekdays", { weekOffDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] }, "weekOffDays"],
		["unknown field", { weekOffDays: [], holidays: [] }, "holidays"],
	])("rejects %s settings", async (_name, body, field) => {
		const env = makeEnv();
		const response = await fetchWorker(env, "/api/settings/work-calendar", jsonRequest("PATCH", body));

		expect(response.status).toBe(400);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(await response.json()).toMatchObject({ error: "Invalid request", field });
	});

	it("remains authenticated and advertises the item methods", async () => {
		const env = makeEnv();
		const unauthorized = await fetchWorker(env, "/api/settings/work-calendar", {}, false);
		const optionsResponse = await fetchWorker(
			env,
			"/api/settings/work-calendar",
			{ method: "OPTIONS" },
			false,
		);

		expect(unauthorized.status).toBe(401);
		expect(unauthorized.headers.get("Cache-Control")).toBe("no-store");
		expect(optionsResponse.status).toBe(204);
		expect(optionsResponse.headers.get("Allow")).toBe("GET, PATCH, OPTIONS");
	});
});
