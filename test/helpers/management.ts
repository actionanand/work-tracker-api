import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { vi } from "vitest";
import worker from "../../src/index";
import type { Env } from "../../src/shared/env";
import { createAuthHeaders, createTestAuthDb, createTestRateLimiter, TEST_AUTH_JWT_SECRET, TEST_AUTH_MAX_SESSION_SECONDS, TEST_AUTH_PASSWORD_HASH, TEST_AUTH_PASSWORD_ITERATIONS, TEST_AUTH_PASSWORD_SALT, TEST_AUTH_RENEW_WINDOW_SECONDS, TEST_AUTH_TOKEN_TTL_SECONDS } from "./auth";
import { updateAlterControls } from "../../src/features/settings/alter-controls.service";

export const projectId = "33333333-3333-3333-3333-333333333333";
export const sprintId = "44444444-4444-4444-4444-444444444444";
export const jiraId = "55555555-5555-5555-5555-555555555555";
export const allocationId = "66666666-6666-6666-6666-666666666666";
export const releaseId = "77777777-7777-7777-7777-777777777777";
export const createdId = "88888888-8888-8888-8888-888888888888";

export function managementEnv() {
	return {
		NOTION_TOKEN: "test-notion-token",
		AUTH_PASSWORD_HASH: TEST_AUTH_PASSWORD_HASH, AUTH_PASSWORD_SALT: TEST_AUTH_PASSWORD_SALT,
		AUTH_PASSWORD_ITERATIONS: TEST_AUTH_PASSWORD_ITERATIONS, AUTH_JWT_SECRET: TEST_AUTH_JWT_SECRET,
		AUTH_TOKEN_TTL_SECONDS: TEST_AUTH_TOKEN_TTL_SECONDS, AUTH_RENEW_WINDOW_SECONDS: TEST_AUTH_RENEW_WINDOW_SECONDS,
		AUTH_MAX_SESSION_SECONDS: TEST_AUTH_MAX_SESSION_SECONDS, AUTH_RATE_LIMITER: createTestRateLimiter(), AUTH_DB: createTestAuthDb(),
		JIRAS_DATA_SOURCE_ID: "test-jiras-data-source-id", SPRINTS_DATA_SOURCE_ID: "test-sprints-data-source-id",
		SPRINT_ALLOCATIONS_DATA_SOURCE_ID: "test-sprint-allocations-data-source-id", PROJECTS_DATA_SOURCE_ID: "test-projects-data-source-id",
		COMPANIES_DATA_SOURCE_ID: "test-companies-data-source-id", TEAMS_DATA_SOURCE_ID: "test-teams-data-source-id",
		WORK_LOGS_DATA_SOURCE_ID: "test-work-logs-data-source-id", RELEASE_ITEMS_DATA_SOURCE_ID: "test-release-items-data-source-id",
		FEEDBACK_DATA_SOURCE_ID: "test-feedback-data-source-id", WORK_LINKS_DATA_SOURCE_ID: "test-work-links-data-source-id",
		TODOS_DATA_SOURCE_ID: "test-todos-data-source-id", TASKS_DATA_SOURCE_ID: "test-tasks-data-source-id",
		MEMOS_DATA_SOURCE_ID: "test-memos-data-source-id", REFERENCE_LIBRARY_DATA_SOURCE_ID: "test-reference-library-data-source-id",
	} satisfies Env;
}

export async function api(env: Env, path: string, method = "GET", body?: unknown) {
	const request = new Request(`http://example.com${path}`, {
		method,
		headers: { ...await createAuthHeaders(env), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

export const enableSprint = (env: Env) => updateAlterControls(env, { control: "sprint", enabled: true });
export const enableRelease = (env: Env) => updateAlterControls(env, { control: "releaseManagement", enabled: true });

export interface MockPage {
	id: string;
	parent: { data_source_id: string };
	created_time: string;
	last_edited_time: string;
	properties: Record<string, any>;
}

export function page(id: string, source: string, properties: Record<string, unknown>): MockPage {
	return { id, parent: { data_source_id: source }, created_time: "2026-10-13T00:00:00Z", last_edited_time: "2026-10-13T00:00:00Z", properties };
}

export function sprintPage(env: Env, active = true, id = sprintId) {
	return page(id, env.SPRINTS_DATA_SOURCE_ID, {
		Sprint: { title: [{ plain_text: "CRI - 26.4 - Sprint 2" }] }, Active: { checkbox: active },
		"Start Date": { date: { start: "2026-10-14" } }, "End Date": { date: { start: "2026-10-27" } },
		"Capacity Days": { formula: { number: 10 } }, "Available Days": { formula: { number: 9.5 } },
		"Allocated Days": { rollup: { number: 0 } }, "Remaining Days": { formula: { number: 9.5 } },
		Project: { relation: [{ id: projectId }] },
	});
}

export function jiraPage(env: Env, sprints: string[] = []) {
	return page(jiraId, env.JIRAS_DATA_SOURCE_ID, {
		"JIRA Key": { title: [{ plain_text: "CRI-123" }] }, Summary: { rich_text: [{ plain_text: "A JIRA" }] },
		Sprints: { relation: sprints.map((id) => ({ id })) },
		"Spillover Count": { formula: { number: 2 } }, Spillover: { formula: { boolean: true } },
	});
}

export function allocationPage(env: Env, sprints = [sprintId], id = allocationId) {
	return page(id, env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID, {
		Allocation: { title: [{ plain_text: "CRI-123" }] }, Sprint: { relation: sprints.map((id) => ({ id })) },
		JIRA: { relation: [{ id: jiraId }] }, "Planned Days": { number: 0 },
		"Spill Reason": { rich_text: [{ plain_text: "Existing spill reason" }] },
	});
}

export function releasePage(env: Env, confirmed: string | null = null, id = releaseId) {
	return page(id, env.RELEASE_ITEMS_DATA_SOURCE_ID, {
		"Release Items": { title: [{ plain_text: "CRI-123" }] }, "Component Name": { rich_text: [{ plain_text: "frontend" }] },
		"Formal Announced Date": { date: null }, "Confirmed Release Date": { date: confirmed ? { start: confirmed } : null },
		JIRAs: { relation: [{ id: jiraId }] },
	});
}

function matches(page: MockPage, filter: any): boolean {
	if (!filter) return true;
	if (filter.and) return filter.and.every((item: any) => matches(page, item));
	if (filter.or) return filter.or.some((item: any) => matches(page, item));
	const property = page.properties[filter.property];
	if (filter.relation?.contains) return property?.relation?.some((item: { id: string }) => item.id === filter.relation.contains) ?? false;
	if (filter.checkbox) return property?.checkbox === filter.checkbox.equals;
	if (filter.title?.equals) return property?.title?.map((item: { plain_text: string }) => item.plain_text).join("") === filter.title.equals;
	return true;
}

export function notionFixture(env: Env, fixtureOptions: { staleSprintRollups?: boolean } = {}) {
	const pages = new Map<string, MockPage>([
		[projectId, page(projectId, env.PROJECTS_DATA_SOURCE_ID, { Project: { title: [{ plain_text: "Work Tracker" }] } })],
		[sprintId, sprintPage(env)], [jiraId, jiraPage(env)], [releaseId, releasePage(env)],
	]);
	const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
	const options = weekdays.map((name) => ({ id: `weekday-${name}`, name, color: "default" }));
	const schema: Record<string, any> = {
		"Week Off 1": { type: "select", select: { options } }, "Week Off 2": { type: "select", select: { options } },
		"Deployment Type": { type: "select", select: { options: [{ id: "deploy-id", name: "Backstage", color: "blue" }] } },
		"Component Name": { type: "rich_text" }, "Version Number": { type: "rich_text" }, Branch: { type: "rich_text" },
		"Formal Announced Date": { type: "date" }, "Confirmed Release Date": { type: "date" }, Notes: { type: "rich_text" },
	};
	let creates = 0;
	const propertyPages = new Map<string, string[][]>();
	let failure: ((url: string, init: RequestInit) => boolean) | undefined;
	const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
		if (failure?.(url, init)) return Response.json({ secret: "raw upstream body" }, { status: 503 });
		const parsed = init.body ? JSON.parse(String(init.body)) : {};
		if (url.includes("/properties/")) {
			const propertyUrl = new URL(url);
			const key = propertyUrl.pathname;
			const parts = propertyPages.get(key) ?? [];
			const index = Number(propertyUrl.searchParams.get("start_cursor") ?? "0");
			const values = parts[index] ?? [];
			const more = index + 1 < parts.length;
			return Response.json({ results: values.map((id) => ({ object: "property_item", type: "relation", relation: { id } })), has_more: more, next_cursor: more ? String(index + 1) : null });
		}
		if (url.includes("/data_sources/")) {
			const source = url.split("/data_sources/")[1].split("/")[0];
			if (!url.endsWith("/query")) return Response.json({ properties: schema });
			const results = [...pages.values()].filter((item) => item.parent.data_source_id === source && matches(item, parsed.filter));
			return Response.json({ results, has_more: false, next_cursor: null });
		}
		if (url.endsWith("/v1/pages") && init.method === "POST") {
			let id: string;
			do {
				id = creates++ === 0 ? createdId : `88888888-8888-8888-8888-${String(creates).padStart(12, "0")}`;
			} while (pages.has(id));
			const created = page(id, parsed.parent.data_source_id, {});
			applyProperties(created, parsed.properties);
			if (created.parent.data_source_id === env.JIRAS_DATA_SOURCE_ID) {
				created.properties["In Active Sprint"] = { formula: { boolean: (created.properties.Sprints?.relation ?? []).some((ref: { id: string }) => pages.get(ref.id)?.properties.Active?.checkbox) } };
			}
			pages.set(id, created);
			return Response.json(created);
		}
		const id = url.split("/pages/")[1];
		const item = pages.get(id);
		if (!item) return Response.json({ error: "not found" }, { status: 404 });
		if (init.method === "PATCH") {
			if (parsed.properties) applyProperties(item, parsed.properties);
			if (parsed.in_trash) pages.delete(id);
		}
		if (item.parent.data_source_id === env.SPRINTS_DATA_SOURCE_ID && !fixtureOptions.staleSprintRollups) {
			const allocated = [...pages.values()].filter((value) => value.parent.data_source_id === env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID && value.properties.Sprint?.relation?.some((ref: { id: string }) => ref.id === id)).reduce((sum, value) => sum + (value.properties["Planned Days"]?.number ?? 0), 0);
			item.properties["Allocated Days"] = { rollup: { number: allocated } };
			item.properties["Remaining Days"] = { formula: { number: 9.5 - allocated } };
		}
		return Response.json(item);
	});

	function applyProperties(item: MockPage, properties: Record<string, any>) {
		for (const [name, value] of Object.entries(properties)) {
			const mapped = structuredClone(value);
			for (const textType of ["title", "rich_text"]) {
				if (mapped[textType]) mapped[textType] = mapped[textType].map((text: any) => ({ ...text, plain_text: text.text.content }));
			}
			if (mapped.select?.id) {
				const option = schema[name]?.select?.options.find((option: { id: string }) => option.id === mapped.select.id);
				mapped.select.name = option?.name;
			}
			item.properties[name] = mapped;
		}
	}
	vi.stubGlobal("fetch", fetchMock);
	return { pages, schema, fetchMock, propertyPages, failWhen: (predicate: typeof failure) => { failure = predicate; } };
}

export function mutations(fetchMock: ReturnType<typeof vi.fn>) {
	return fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/v1/pages") && ["POST", "PATCH"].includes(init?.method ?? ""));
}

export const sprintInput = { sprint: " CRI - 26.4 - Sprint 3 ", projectId, startDate: "2026-10-28", endDate: "2026-11-10" };
