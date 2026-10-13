import { env as runtimeEnv } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/shared/env";
import { api, managementEnv, notionFixture, projectId, sprintId, jiraId, allocationId, releaseId, sprintInput } from "./helpers/management";
import { ALTER_CONTROL_TTL_SECONDS, updateAlterControls } from "../src/features/settings/alter-controls.service";

const now = Date.parse("2026-10-13T14:00:00Z");
let clock = now;

describe("backend Alter controls", () => {
	beforeEach(() => {
		clock = now;
		vi.spyOn(Date, "now").mockImplementation(() => clock);
	});
	afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

	it("returns OFF with no D1 row and the actual server time", async () => {
		const env = managementEnv();
		const response = await api(env, "/api/settings/alter-controls");
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(await response.json()).toEqual({ data: {
			alterSprint: { enabled: false, activeUntil: null, remainingSeconds: 0 },
			alterReleaseManagement: { enabled: false, activeUntil: null, remainingSeconds: 0 },
			ttlSeconds: ALTER_CONTROL_TTL_SECONDS, serverTime: "2026-10-13T14:00:00.000Z",
		} });
	});

	it.each(["sprint", "releaseManagement"] as const)("persists %s across repeated settings reads", async (control) => {
		const env = managementEnv();
		const enabled = await api(env, "/api/settings/alter-controls", "PATCH", { control, enabled: true });
		expect(enabled.status).toBe(200);
		expect(enabled.headers.get("Cache-Control")).toBe("no-store");
		clock += 60_000;
		const response = await api(env, "/api/settings/alter-controls");
		const body = await response.json() as any;
		const field = control === "sprint" ? "alterSprint" : "alterReleaseManagement";
		expect(body.data[field]).toEqual({ enabled: true, activeUntil: "2026-10-13T14:30:00.000Z", remainingSeconds: 1740 });
		expect(body.data.serverTime).toBe("2026-10-13T14:01:00.000Z");
	});

	it.each(["sprint", "releaseManagement"] as const)("disables %s independently and clears its timestamp", async (control) => {
		const env = managementEnv();
		await updateAlterControls(env, { control: "sprint", enabled: true });
		await updateAlterControls(env, { control: "releaseManagement", enabled: true });
		const response = await api(env, "/api/settings/alter-controls", "PATCH", { control, enabled: false });
		const body = await response.json() as any;
		const field = control === "sprint" ? "alterSprint" : "alterReleaseManagement";
		const other = control === "sprint" ? "alterReleaseManagement" : "alterSprint";
		expect(body.data[field]).toEqual({ enabled: false, activeUntil: null, remainingSeconds: 0 });
		expect(body.data[other].enabled).toBe(true);
		expect(env.AUTH_DB.alterControls.row?.[control === "sprint" ? "alter_sprint_enabled_until" : "alter_release_enabled_until"]).toBeNull();
	});

	it.each([false, true])("starts a fresh window on re-enable (disable first: %s)", async (disable) => {
		const env = managementEnv();
		await updateAlterControls(env, { control: "sprint", enabled: true });
		clock += 60_000;
		if (disable) await updateAlterControls(env, { control: "sprint", enabled: false });
		clock += 60_000;
		const response = await api(env, "/api/settings/alter-controls", "PATCH", { control: "sprint", enabled: true });
		expect((await response.json() as any).data.alterSprint).toEqual({ enabled: true, activeUntil: "2026-10-13T14:32:00.000Z", remainingSeconds: 1800 });
	});

	it.each([0, 1, 60])("treats a timestamp %s seconds after expiry as OFF without cleanup", async (seconds) => {
		const env = managementEnv();
		await updateAlterControls(env, { control: "sprint", enabled: true });
		clock += (ALTER_CONTROL_TTL_SECONDS + seconds) * 1000;
		const response = await api(env, "/api/settings/alter-controls");
		expect((await response.json() as any).data.alterSprint).toEqual({ enabled: false, activeUntil: null, remainingSeconds: 0 });
		expect(env.AUTH_DB.alterControls.row?.alter_sprint_enabled_until).not.toBeNull();
	});

	it.each([
		{}, { control: "other", enabled: true }, { control: "sprint", enabled: "yes" },
		{ control: "sprint", enabled: true, activeUntil: "2099-01-01" },
	])("rejects invalid control input without storing it", async (body) => {
		const env = managementEnv();
		const response = await api(env, "/api/settings/alter-controls", "PATCH", body);
		expect(response.status).toBe(400);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(env.AUTH_DB.alterControls.row).toBeNull();
	});

	const gated = [
		["sprint", "POST", "/api/sprints", sprintInput],
		["sprint", "PATCH", `/api/sprints/${sprintId}`, { holidayDays: 1 }],
		["sprint", "PATCH", "/api/jiras/CRI-123/current-sprint", {}],
		["sprint", "PATCH", `/api/sprint-allocations/${allocationId}`, { plannedDays: 1 }],
		["releaseManagement", "POST", "/api/releases", { jiraId, componentName: "frontend" }],
		["releaseManagement", "PATCH", `/api/releases/${releaseId}`, { notes: "Edit" }],
		["releaseManagement", "DELETE", `/api/releases/${releaseId}`, undefined],
		["releaseManagement", "PATCH", "/api/releases/bulk-date", { releaseItemIds: [releaseId], dateType: "release", date: "2026-10-15" }],
	] as const;
	it.each(gated)("checks disabled %s for %s %s", async (control, method, path, body) => {
		const env = managementEnv();
		const { fetchMock } = notionFixture(env);
		const response = await api(env, path, method, body);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual(control === "sprint"
			? { error: "Alter Sprint is disabled", code: "ALTER_SPRINT_DISABLED" }
			: { error: "Alter Release Management is disabled", code: "ALTER_RELEASE_MANAGEMENT_DISABLED" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});
	it.each(gated)("checks expired %s for %s %s", async (control, method, path, body) => {
		const env = managementEnv();
		await updateAlterControls(env, { control, enabled: true });
		clock += ALTER_CONTROL_TTL_SECONDS * 1000;
		const { fetchMock } = notionFixture(env);
		const response = await api(env, path, method, body);
		expect(response.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("allows a protected write one second before expiry", async () => {
		const env = managementEnv();
		await updateAlterControls(env, { control: "sprint", enabled: true });
		clock += (ALTER_CONTROL_TTL_SECONDS - 1) * 1000;
		notionFixture(env);
		expect((await api(env, "/api/sprints", "POST", sprintInput)).status).toBe(201);
	});

	it("rechecks expiry after preflight before any mutation", async () => {
		const env = managementEnv();
		await updateAlterControls(env, { control: "sprint", enabled: true });
		const fixture = notionFixture(env);
		fixture.failWhen((url) => {
			if (url.endsWith(`/data_sources/${env.SPRINTS_DATA_SOURCE_ID}`)) clock = now + ALTER_CONTROL_TTL_SECONDS * 1000;
			return false;
		});
		const response = await api(env, "/api/sprints", "POST", sprintInput);
		expect(response.status).toBe(403);
		expect(fixture.fetchMock.mock.calls.some(([url]) => url.endsWith("/v1/pages"))).toBe(false);
	});

	it("persists independent controls in the real D1 binding", async () => {
		const env = managementEnv();
		const db = (runtimeEnv as unknown as Env).AUTH_DB;
		await db.exec("CREATE TABLE IF NOT EXISTS alter_controls (id INTEGER PRIMARY KEY CHECK (id = 1), alter_sprint_enabled_until INTEGER, alter_release_enabled_until INTEGER, updated_at INTEGER NOT NULL)");
		await db.prepare("DELETE FROM alter_controls").run();
		const realEnv = { ...env, AUTH_DB: db };
		await updateAlterControls(realEnv, { control: "sprint", enabled: true });
		await updateAlterControls(realEnv, { control: "releaseManagement", enabled: true });
		await updateAlterControls(realEnv, { control: "sprint", enabled: false });
		const row = await db.prepare("SELECT * FROM alter_controls WHERE id = 1").first<any>();
		expect(row.alter_sprint_enabled_until).toBeNull();
		expect(row.alter_release_enabled_until).toBe(Math.floor(now / 1000) + ALTER_CONTROL_TTL_SECONDS);
	});
});
