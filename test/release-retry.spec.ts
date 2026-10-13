import { afterEach, describe, expect, it, vi } from "vitest";
import { ALTER_CONTROL_TTL_SECONDS, updateAlterControls } from "../src/features/settings/alter-controls.service";
import { api, enableRelease, managementEnv, mutations, notionFixture, projectId, releaseId, releasePage } from "./helpers/management";

const date = "2026-10-13";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("bulk Release date retries", () => {
	it.each(["announcement", "release"])("replays an identical %s batch successfully without additional writes", async (dateType) => {
		const env = managementEnv(); await enableRelease(env);
		const { fetchMock } = notionFixture(env);
		const body = { releaseItemIds: [releaseId], dateType, date };
		const first = await api(env, "/api/releases/bulk-date", "PATCH", body);
		expect(first.status).toBe(200);
		const firstBody = await first.json();
		expect(mutations(fetchMock)).toHaveLength(1);
		const writesBeforeRetry = mutations(fetchMock).length;
		const replay = await api(env, "/api/releases/bulk-date", "PATCH", body);
		expect(replay.status).toBe(200);
		expect(replay.headers.get("Cache-Control")).toBe("no-store");
		expect(await replay.json()).toEqual(firstBody);
		expect(mutations(fetchMock)).toHaveLength(writesBeforeRetry);
	});

	it.each(["announcement", "release"])("updates only the unsatisfied row in a mixed %s batch", async (dateType) => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		const property = dateType === "release" ? "Confirmed Release Date" : "Formal Announced Date";
		pages.get(releaseId)!.properties[property] = { date: { start: date } };
		pages.set(projectId, releasePage(env, null, projectId));
		const response = await api(env, "/api/releases/bulk-date", "PATCH", { releaseItemIds: [releaseId, projectId], dateType, date });
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body).toMatchObject({ requested: 2, updated: 2, allSucceeded: true });
		expect(body.data.map((item: { id: string }) => item.id)).toEqual([releaseId, projectId]);
		expect(mutations(fetchMock)).toHaveLength(1);
		expect(mutations(fetchMock)[0][0]).toBe(`https://api.notion.com/v1/pages/${projectId}`);
		expect(JSON.parse(String(mutations(fetchMock)[0][1].body))).toEqual({ properties: { [property]: { date: { start: date } } } });
		expect(fetchMock.mock.calls.slice(0, 2).map(([, init]) => init?.method)).toEqual(["GET", "GET"]);
	});

	it("permits an announcement no-op even when the item is confirmed", async () => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(releaseId, releasePage(env, "2026-10-14"));
		pages.get(releaseId)!.properties["Formal Announced Date"] = { date: { start: date } };
		const response = await api(env, "/api/releases/bulk-date", "PATCH", { releaseItemIds: [releaseId], dateType: "announcement", date });
		expect(response.status).toBe(200);
		expect((await response.json() as any).allSucceeded).toBe(true);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it.each([
		["release", "2026-10-14", "RELEASE_ITEM_CONFIRMED"],
		["announcement", null, "RELEASE_DATE_CONFLICT"],
		["announcement", "2026-10-14", "RELEASE_ITEM_CONFIRMED"],
	])("blocks a genuinely different %s date with %s confirmation state", async (dateType, confirmed, code) => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(releaseId, releasePage(env, confirmed));
		pages.get(releaseId)!.properties["Formal Announced Date"] = { date: { start: "2026-10-01" } };
		const response = await api(env, "/api/releases/bulk-date", "PATCH", { releaseItemIds: [releaseId], dateType, date });
		expect(response.status).toBe(409);
		expect((await response.json() as any).code).toBe(code);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("rejects the whole preflight when satisfied and conflicting rows are mixed", async () => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(releaseId, releasePage(env, date));
		pages.set(projectId, releasePage(env, "2026-10-14", projectId));
		const response = await api(env, "/api/releases/bulk-date", "PATCH", { releaseItemIds: [releaseId, projectId], dateType: "release", date });
		expect(response.status).toBe(409);
		expect((await response.json() as any).conflicts.map((item: { id: string }) => item.id)).toEqual([projectId]);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("retries a partial batch without rewriting the already completed row", async () => {
		const env = managementEnv(); await enableRelease(env);
		const fixture = notionFixture(env);
		fixture.pages.set(projectId, releasePage(env, null, projectId));
		fixture.failWhen((url, init) => url.endsWith(projectId) && init.method === "PATCH");
		const body = { releaseItemIds: [releaseId, projectId], dateType: "release", date };
		const first = await api(env, "/api/releases/bulk-date", "PATCH", body);
		expect(first.status).toBe(502);
		expect(await first.json()).toMatchObject({ requested: 2, updated: 1, updatedIds: [releaseId], allSucceeded: false, failed: [{ id: projectId, error: "update-failed" }] });
		fixture.failWhen(undefined);
		const attempts = mutations(fixture.fetchMock).length;
		const replay = await api(env, "/api/releases/bulk-date", "PATCH", body);
		expect(replay.status).toBe(200);
		expect((await replay.json() as any)).toMatchObject({ requested: 2, updated: 2, allSucceeded: true });
		expect(mutations(fixture.fetchMock).slice(attempts).map(([url]) => url)).toEqual([`https://api.notion.com/v1/pages/${projectId}`]);
	});

	it("includes satisfied rows in a safe partial result when another row fails", async () => {
		const env = managementEnv(); await enableRelease(env);
		const fixture = notionFixture(env);
		fixture.pages.set(releaseId, releasePage(env, date));
		fixture.pages.set(projectId, releasePage(env, null, projectId));
		fixture.failWhen((_url, init) => init.method === "PATCH");
		const response = await api(env, "/api/releases/bulk-date", "PATCH", { releaseItemIds: [releaseId, projectId], dateType: "release", date });
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ error: "Release batch update partially failed", requested: 2, updated: 1, allSucceeded: false, updatedIds: [releaseId], failed: [{ id: projectId, error: "update-failed" }] });
		expect(mutations(fixture.fetchMock)).toHaveLength(1);
	});
});

describe("confirmed Release PATCH retries", () => {
	it.each([
		{ confirmedReleaseDate: date },
		{ componentName: "frontend", confirmedReleaseDate: date },
		{ componentName: "frontend", deploymentTypeOptionId: "deploy-id", versionNumber: "1.2.3", branch: "master", formalAnnouncedDate: date, confirmedReleaseDate: date, notes: "## Notes\n\n- Release" },
	])("replays the successful confirmation PATCH %j without another Notion write", async (body) => {
		const env = managementEnv(); await enableRelease(env);
		const { fetchMock } = notionFixture(env);
		const first = await api(env, `/api/releases/${releaseId}`, "PATCH", body);
		expect(first.status).toBe(200);
		const firstBody = await first.json();
		expect(mutations(fetchMock)).toHaveLength(1);
		const replay = await api(env, `/api/releases/${releaseId}`, "PATCH", body);
		expect(replay.status).toBe(200);
		expect(await replay.json()).toEqual(firstBody);
		expect(replay.headers.get("Cache-Control")).toBe("no-store");
		expect(mutations(fetchMock)).toHaveLength(1);
	});

	it.each([
		{ componentName: "frontend" }, { versionNumber: "" }, { branch: "" }, { notes: "" },
		{ formalAnnouncedDate: null }, { confirmedReleaseDate: date }, { deploymentTypeOptionId: null },
	])("accepts a no-op against a confirmed row's stored writable values %j", async (body) => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(releaseId, releasePage(env, date));
		const response = await api(env, `/api/releases/${releaseId}`, "PATCH", body);
		expect(response.status).toBe(200);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it.each([
		{ componentName: "different" }, { versionNumber: "2" }, { branch: "feature" }, { notes: "different" },
		{ formalAnnouncedDate: "2026-10-14" }, { confirmedReleaseDate: "2026-10-14" }, { confirmedReleaseDate: null },
		{ deploymentTypeOptionId: "deploy-id" }, { componentName: "frontend", notes: "different" },
	])("blocks any actual writable-value change on a confirmed row %j", async (body) => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(releaseId, releasePage(env, date));
		const response = await api(env, `/api/releases/${releaseId}`, "PATCH", body);
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "Confirmed Release Items are read-only", code: "RELEASE_ITEM_CONFIRMED" });
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("compares Deployment Type by raw ID even when different IDs have the same name", async () => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, schema, fetchMock } = notionFixture(env);
		pages.set(releaseId, releasePage(env, date));
		pages.get(releaseId)!.properties["Deployment Type"] = { select: { id: "deploy-id", name: "Backstage" } };
		schema["Deployment Type"].select.options.push({ id: "deploy-other", name: "Backstage", color: "blue" });
		const sameId = await api(env, `/api/releases/${releaseId}`, "PATCH", { deploymentTypeOptionId: "deploy-id" });
		expect(sameId.status).toBe(200);
		const differentId = await api(env, `/api/releases/${releaseId}`, "PATCH", { deploymentTypeOptionId: "deploy-other" });
		expect(differentId.status).toBe(409);
		expect((await differentId.json() as any).code).toBe("RELEASE_ITEM_CONFIRMED");
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("does not mistake an unavailable Deployment Type ID for a cleared select", async () => {
		const env = managementEnv(); await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(releaseId, releasePage(env, date));
		pages.get(releaseId)!.properties["Deployment Type"] = { select: { name: "Backstage" } };
		const response = await api(env, `/api/releases/${releaseId}`, "PATCH", { deploymentTypeOptionId: null });
		expect(response.status).toBe(409);
		expect(mutations(fetchMock)).toHaveLength(0);
	});
});

describe("replay Alter Release guard", () => {
	it.each(["disabled", "expired"])("requires an enabled control for both satisfied endpoints (%s)", async (state) => {
		const env = managementEnv();
		const now = Date.parse("2026-10-13T14:00:00Z");
		let clock = now;
		vi.spyOn(Date, "now").mockImplementation(() => clock);
		await enableRelease(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(releaseId, releasePage(env, date));
		if (state === "disabled") await updateAlterControls(env, { control: "releaseManagement", enabled: false });
		else clock += ALTER_CONTROL_TTL_SECONDS * 1000;
		for (const [path, body] of [
			["/api/releases/bulk-date", { releaseItemIds: [releaseId], dateType: "release", date }],
			[`/api/releases/${releaseId}`, { confirmedReleaseDate: date }],
		] as const) {
			const response = await api(env, path, "PATCH", body);
			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({ error: "Alter Release Management is disabled", code: "ALTER_RELEASE_MANAGEMENT_DISABLED" });
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not start a Notion write when the control expires during preflight", async () => {
		const env = managementEnv();
		const now = Date.parse("2026-10-13T14:00:00Z");
		let clock = now;
		vi.spyOn(Date, "now").mockImplementation(() => clock);
		await enableRelease(env);
		const fixture = notionFixture(env);
		fixture.failWhen((url, init) => {
			if (url.endsWith(releaseId) && init.method === "GET") clock += ALTER_CONTROL_TTL_SECONDS * 1000;
			return false;
		});
		const response = await api(env, "/api/releases/bulk-date", "PATCH", { releaseItemIds: [releaseId], dateType: "release", date });
		expect(response.status).toBe(403);
		expect(mutations(fixture.fetchMock)).toHaveLength(0);
	});
});
