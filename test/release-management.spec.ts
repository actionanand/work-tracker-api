import { afterEach, describe, expect, it, vi } from "vitest";
import { api, managementEnv, notionFixture, enableRelease, jiraId, releaseId, projectId, createdId, releasePage, mutations } from "./helpers/management";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Release management metadata", () => {
	it("returns writable fields and live Deployment Type IDs without enabling mutations", async () => {
		const env = managementEnv(); notionFixture(env);
		const response = await api(env, "/api/releases/meta");
		expect(response.status).toBe(200);
		expect(response.headers.get("Accept-Query")).toBeNull();
		const metadata = await response.json() as any;
		expect(metadata.resource).toBe("releases");
		expect(metadata.fields.map((field: { key: string }) => field.key)).toEqual([
			"componentName", "deploymentTypeOptionId", "versionNumber", "branch", "formalAnnouncedDate", "confirmedReleaseDate", "notes",
		]);
		expect(metadata.fields.every((field: { writable: boolean }) => field.writable)).toBe(true);
		expect(metadata.fields[1].options).toEqual([{ id: "deploy-id", name: "Backstage", color: "blue" }]);
	});
});

describe("Release creation", () => {
	it("derives the title from the JIRA and writes only supported Notion properties", async () => {
		const env = managementEnv(); await enableRelease(env);
		const { fetchMock } = notionFixture(env);
		const response = await api(env, "/api/releases", "POST", {
			jiraId, componentName: " frontend ", deploymentTypeOptionId: "deploy-id", versionNumber: "2a19386-115",
			branch: "master", formalAnnouncedDate: "2026-10-13", confirmedReleaseDate: null, notes: "Notes",
		});
		expect(response.status).toBe(201);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(JSON.parse(String(mutations(fetchMock)[0][1].body))).toEqual({
			parent: { data_source_id: env.RELEASE_ITEMS_DATA_SOURCE_ID }, properties: {
				"Release Items": { title: [{ text: { content: "CRI-123" } }] }, JIRAs: { relation: [{ id: jiraId }] },
				"Component Name": { rich_text: [{ text: { content: "frontend" } }] }, "Deployment Type": { select: { id: "deploy-id" } },
				"Version Number": { rich_text: [{ text: { content: "2a19386-115" } }] }, Branch: { rich_text: [{ text: { content: "master" } }] },
				"Formal Announced Date": { date: { start: "2026-10-13" } }, "Confirmed Release Date": { date: null }, Notes: { rich_text: [{ text: { content: "Notes" } }] },
			},
		});
		expect((await response.json() as any).data).toMatchObject({ releaseItem: "CRI-123", componentName: "frontend", jiraIds: [jiraId], deploymentType: "Backstage" });
	});

	it("defaults optional fields and allows repeated JIRA/component creation", async () => {
		const env = managementEnv(); await enableRelease(env);
		const { fetchMock } = notionFixture(env);
		const input = { jiraId, componentName: "frontend" };
		const first = await api(env, "/api/releases", "POST", input);
		const second = await api(env, "/api/releases", "POST", input);
		expect(first.status).toBe(201); expect(second.status).toBe(201);
		expect((await first.json() as any).data).toMatchObject({ versionNumber: "", branch: "", notes: "", deploymentType: null, formalAnnouncedDate: null, confirmedReleaseDate: null });
		expect(mutations(fetchMock)).toHaveLength(2);
	});

	it.each([
		{ jiraId: "invalid" }, { jiraId: null }, { componentName: " " }, { componentName: 5 },
		{ deploymentTypeOptionId: "unknown-option" }, { formalAnnouncedDate: "2026-02-30" }, { confirmedReleaseDate: "bad" },
		{ versionNumber: 1 }, { branch: 1 }, { notes: 5 }, { releaseItem: "Other" }, { jiraStatuses: [] }, { sprints: [] }, { spilloverCount: 1 },
	])("rejects invalid/read-only create input %j", async (override) => {
		const env = managementEnv(); await enableRelease(env);
		const { fetchMock } = notionFixture(env);
		expect((await api(env, "/api/releases", "POST", { jiraId, componentName: "frontend", ...override })).status).toBe(400);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it.each(["missing", "wrong-source"])("rejects a %s JIRA before release creation", async (scenario) => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		if (scenario === "missing") pages.delete(jiraId);
		else pages.get(jiraId)!.parent.data_source_id = env.PROJECTS_DATA_SOURCE_ID;
		expect((await api(env, "/api/releases", "POST", { jiraId, componentName: "frontend" })).status).toBe(scenario === "missing" ? 404 : 400);
		expect(mutations(fetchMock)).toHaveLength(0);
	});
});

describe("Release editing and deletion", () => {
	it.each([
		["componentName", "backend", "Component Name", { rich_text: [{ text: { content: "backend" } }] }],
		["deploymentTypeOptionId", "deploy-id", "Deployment Type", { select: { id: "deploy-id" } }],
		["versionNumber", "1.2.3", "Version Number", { rich_text: [{ text: { content: "1.2.3" } }] }],
		["branch", "feature", "Branch", { rich_text: [{ text: { content: "feature" } }] }],
		["formalAnnouncedDate", "2026-10-13", "Formal Announced Date", { date: { start: "2026-10-13" } }],
		["notes", "Updated", "Notes", { rich_text: [{ text: { content: "Updated" } }] }],
	])("updates only %s on an unconfirmed release", async (field, value, property, expected) => {
		const env = managementEnv(); await enableRelease(env);
		const { fetchMock } = notionFixture(env);
		const response = await api(env, `/api/releases/${releaseId}`, "PATCH", { [field as string]: value });
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(JSON.parse(String(mutations(fetchMock)[0][1].body))).toEqual({ properties: { [property as string]: expected } });
	});

	it("allows initial confirmation, then rejects editing, clearing and deletion", async () => {
		const env = managementEnv(); await enableRelease(env);
		const { fetchMock } = notionFixture(env);
		expect((await api(env, `/api/releases/${releaseId}`, "PATCH", { confirmedReleaseDate: "2026-10-13" })).status).toBe(200);
		for (const [method, body] of [["PATCH", { notes: "edit" }], ["PATCH", { confirmedReleaseDate: null }], ["DELETE", undefined]] as const) {
			const response = await api(env, `/api/releases/${releaseId}`, method, body);
			expect(response.status).toBe(409);
			expect(await response.json()).toEqual({ error: "Confirmed Release Items are read-only", code: "RELEASE_ITEM_CONFIRMED" });
			expect(response.headers.get("Cache-Control")).toBe("no-store");
		}
		expect(mutations(fetchMock)).toHaveLength(1);
	});

	it("creates a confirmed Release Item which is immediately read-only", async () => {
		const env = managementEnv(); await enableRelease(env);
		const { fetchMock } = notionFixture(env);
		const created = await api(env, "/api/releases", "POST", { jiraId, componentName: "frontend", confirmedReleaseDate: "2026-10-13" });
		expect(created.status).toBe(201);
		expect((await api(env, `/api/releases/${createdId}`, "DELETE")).status).toBe(409);
		expect(mutations(fetchMock)).toHaveLength(1);
	});

	it.each([{}, { componentName: "" }, { releaseItem: "Other" }, { jiraIds: [] }, { jiraId }, { jiraStatuses: [] }, { sprintIds: [] }, { spilloverCount: 9 }, { formalAnnouncedDate: "bad" }, { deploymentTypeOptionId: "missing" }])("rejects invalid/read-only edit fields %j", async (body) => {
		const env = managementEnv(); await enableRelease(env);
		const { fetchMock } = notionFixture(env);
		expect((await api(env, `/api/releases/${releaseId}`, "PATCH", body)).status).toBe(400);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("trashes one unconfirmed Release Item with an exact mutation", async () => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		const response = await api(env, `/api/releases/${releaseId}`, "DELETE");
		expect(response.status).toBe(204); expect(await response.text()).toBe("");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(JSON.parse(String(mutations(fetchMock)[0][1].body))).toEqual({ in_trash: true });
		expect(pages.has(releaseId)).toBe(false);
	});

	it.each(["PATCH", "DELETE"])("checks missing and foreign Release pages for %s", async (method) => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.get(releaseId)!.parent.data_source_id = env.JIRAS_DATA_SOURCE_ID;
		expect((await api(env, `/api/releases/${releaseId}`, method, method === "PATCH" ? { notes: "x" } : undefined)).status).toBe(400);
		pages.delete(releaseId);
		expect((await api(env, `/api/releases/${releaseId}`, method, method === "PATCH" ? { notes: "x" } : undefined)).status).toBe(404);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("does not implement bulk Release deletion", async () => {
		const env = managementEnv(); await enableRelease(env);
		const { fetchMock } = notionFixture(env);
		expect((await api(env, "/api/releases/bulk-delete", "POST", { releaseItemIds: [releaseId] })).status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns a safe no-store failure without exposing Notion content", async () => {
		const env = managementEnv(); await enableRelease(env);
		const fixture = notionFixture(env);
		fixture.failWhen((_url, init) => init.method === "PATCH");
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const response = await api(env, `/api/releases/${releaseId}`, "PATCH", { notes: "x" });
		expect(response.status).toBe(500); expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(await response.json()).toEqual({ error: "Failed to modify Release Item" });
	});
});

describe("bulk-date confirmed-item protection", () => {
	it.each(["announcement", "release"])("rejects any confirmed selection for %s before all mutations", async (dateType) => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(projectId, releasePage(env, "2026-10-01", projectId));
		const response = await api(env, "/api/releases/bulk-date", "PATCH", { releaseItemIds: [releaseId, projectId], dateType, date: "2026-10-13" });
		expect(response.status).toBe(409);
		expect((await response.json() as any)).toMatchObject({ code: "RELEASE_ITEM_CONFIRMED", conflicts: [{ id: projectId, currentDate: "2026-10-01" }] });
		expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "GET")).toHaveLength(2);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("confirms unconfirmed rows and locks subsequent announcement updates", async () => {
		const env = managementEnv(); await enableRelease(env);
		const { fetchMock } = notionFixture(env);
		const body = { releaseItemIds: [releaseId], dateType: "release", date: "2026-10-13" };
		expect((await api(env, "/api/releases/bulk-date", "PATCH", body)).status).toBe(200);
		const response = await api(env, "/api/releases/bulk-date", "PATCH", { ...body, dateType: "announcement" });
		expect(response.status).toBe(409); expect((await response.json() as any).code).toBe("RELEASE_ITEM_CONFIRMED");
		expect(mutations(fetchMock)).toHaveLength(1);
	});
});

describe("management preflight contracts", () => {
	it.each([
		["/api/settings/alter-controls", "GET, PATCH, OPTIONS"], ["/api/sprints", "GET, POST, OPTIONS"],
		["/api/sprints/active", "GET, OPTIONS"], ["/api/sprints/history", "GET, OPTIONS"],
		[`/api/sprints/${releaseId}`, "GET, PATCH, OPTIONS"], [`/api/sprint-allocations/${releaseId}`, "PATCH, OPTIONS"],
		["/api/jiras/CRI-123/current-sprint", "PATCH, OPTIONS"], ["/api/releases", "GET, POST, OPTIONS"],
		["/api/releases/meta", "GET, OPTIONS"], ["/api/releases/bulk-date", "PATCH, OPTIONS"],
		["/api/releases/calendar", "GET, OPTIONS"], ["/api/releases/by-date", "GET, OPTIONS"],
		[`/api/releases/${releaseId}`, "PATCH, DELETE, OPTIONS"],
		["/api/jiras/options", "QUERY, OPTIONS"], ["/api/jiras/meta", "GET, OPTIONS"], ["/api/jiras/CRI-123", "GET, PATCH, OPTIONS"],
	])("advertises correct methods for %s", async (path, allow) => {
		const env = managementEnv();
		const response = await api(env, path, "OPTIONS");
		expect(response.status).toBe(204); expect(response.headers.get("Allow")).toBe(allow);
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, QUERY, POST, PATCH, DELETE, OPTIONS");
		expect(response.headers.get("Accept-Query")).toBe(path === "/api/jiras/options" ? "application/json" : null);
	});
});
