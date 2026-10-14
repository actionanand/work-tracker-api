import { afterEach, describe, expect, it, vi } from "vitest";
import { api, managementEnv, notionFixture, enableSprint, sprintId, jiraId, allocationId, createdId, projectId, sprintPage, jiraPage, allocationPage, mutations, sprintInput } from "./helpers/management";
import { ALTER_CONTROL_TTL_SECONDS } from "../src/features/settings/alter-controls.service";

const syncPath = "/api/sprints/active/allocations/sync";
const planPath = "/api/sprints/active/allocations/plan";
const newJiraInput = { jiraKey: "CRI-456", summary: "New JIRA", inActiveSprint: true };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function planningFixture(env: ReturnType<typeof managementEnv>, staleSprintRollups = false) {
	const fixture = notionFixture(env, { staleSprintRollups });
	fixture.pages.set(jiraId, jiraPage(env, [sprintId]));
	fixture.pages.set(allocationId, allocationPage(env));
	fixture.pages.set(createdId, allocationPage(env, [sprintId], createdId));
	return fixture;
}

describe("JIRA create ensures Sprint planning", () => {
	it("preserves an initial duplicate-allocation conflict after creating the JIRA", async () => {
		const env = managementEnv(); const fixture = notionFixture(env);
		fixture.failWhen((url) => {
			if (url.endsWith(`/data_sources/${env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID}/query`)) {
				for (const id of [allocationId, projectId]) {
					const allocation = allocationPage(env, [sprintId], id);
					allocation.properties.JIRA = { relation: [{ id: createdId }] };
					fixture.pages.set(id, allocation);
				}
			}
			return false;
		});
		const response = await api(env, "/api/jiras", "POST", newJiraInput);
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ code: "SPRINT_ALLOCATION_CONFLICT", allocationCount: 2 });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(mutations(fixture.fetchMock)).toHaveLength(1);
		expect(fixture.pages.get(createdId)!.parent.data_source_id).toBe(env.JIRAS_DATA_SOURCE_ID);
	});

	it("preserves an allocation already created for the new JIRA by an external writer", async () => {
		const env = managementEnv(); const fixture = notionFixture(env);
		fixture.failWhen((url) => {
			if (url.endsWith(`/data_sources/${env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID}/query`)) {
				const allocation = allocationPage(env);
				allocation.properties.JIRA = { relation: [{ id: createdId }] };
				allocation.properties["Planned Days"] = { number: 2.5 };
				fixture.pages.set(allocationId, allocation);
			}
			return false;
		});
		expect((await api(env, "/api/jiras", "POST", newJiraInput)).status).toBe(201);
		expect(mutations(fixture.fetchMock)).toHaveLength(1);
		expect(fixture.pages.get(allocationId)!.properties["Planned Days"].number).toBe(2.5);
	});
	it.each([false, true])("creates a compatible JIRA without Alter Sprint (active: %s)", async (inActiveSprint) => {
		const env = managementEnv();
		const { pages, fetchMock } = notionFixture(env);
		const response = await api(env, "/api/jiras", "POST", { ...newJiraInput, inActiveSprint });
		expect(response.status).toBe(201);
		const body = await response.json() as any;
		expect(body.data).toMatchObject({ id: createdId, jiraKey: "CRI-456", summary: "New JIRA", inActiveSprint, sprintIds: inActiveSprint ? [sprintId] : [] });
		expect(env.AUTH_DB.alterControls.row).toBeNull();
		const allocations = [...pages.values()].filter((page) => page.parent.data_source_id === env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID);
		expect(allocations).toHaveLength(inActiveSprint ? 1 : 0);
		if (inActiveSprint) {
			const create = mutations(fetchMock).find(([, init]) => JSON.parse(String(init.body)).parent?.data_source_id === env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)!;
			expect(JSON.parse(String(create[1].body)).properties).toEqual({
				Allocation: { title: [{ text: { content: "CRI-456" } }] }, Sprint: { relation: [{ id: sprintId }] },
				JIRA: { relation: [{ id: createdId }] }, "Planned Days": { number: 0 },
			});
		}
	});

	it("recovers an uncertain allocation create by re-querying the exact pair", async () => {
		const env = managementEnv();
		const fixture = notionFixture(env);
		fixture.failWhen((url, init) => {
			if (!url.endsWith("/v1/pages") || init.method !== "POST" || JSON.parse(String(init.body)).parent.data_source_id !== env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID) return false;
			const allocation = allocationPage(env);
			allocation.properties.JIRA = { relation: [{ id: createdId }] };
			fixture.pages.set(allocationId, allocation);
			return true;
		});
		const response = await api(env, "/api/jiras", "POST", newJiraInput);
		expect(response.status).toBe(201);
		const queries = fixture.fetchMock.mock.calls.filter(([url]) => url.endsWith(`/data_sources/${env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID}/query`));
		expect(queries).toHaveLength(2);
		for (const [, init] of queries) expect(JSON.parse(String(init?.body)).filter).toEqual({ and: [
			{ property: "Sprint", relation: { contains: sprintId } }, { property: "JIRA", relation: { contains: createdId } },
		] });
		expect(mutations(fixture.fetchMock)).toHaveLength(2);
		expect([...fixture.pages.values()].filter((page) => page.parent.data_source_id === env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)).toHaveLength(1);
	});

	it("returns a structured partial failure without creating another JIRA", async () => {
		const env = managementEnv();
		const fixture = notionFixture(env);
		fixture.failWhen((url, init) => url.endsWith("/v1/pages") && init.method === "POST" && JSON.parse(String(init.body)).parent.data_source_id === env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID);
		const response = await api(env, "/api/jiras", "POST", newJiraInput);
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ error: "JIRA was created but its Sprint Allocation could not be completed", code: "JIRA_SPRINT_ALLOCATION_PARTIAL", jiraKey: "CRI-456" });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		const retry = await api(env, "/api/jiras", "POST", newJiraInput);
		expect(retry.status).toBe(409);
		expect([...fixture.pages.values()].filter((page) => page.parent.data_source_id === env.JIRAS_DATA_SOURCE_ID && page.id === createdId)).toHaveLength(1);
	});

	it("reports duplicates discovered during uncertain-create recovery", async () => {
		const env = managementEnv();
		const fixture = notionFixture(env);
		fixture.failWhen((url, init) => {
			if (!url.endsWith("/v1/pages") || init.method !== "POST" || JSON.parse(String(init.body)).parent.data_source_id !== env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID) return false;
			for (const id of [allocationId, projectId]) {
				const allocation = allocationPage(env, [sprintId], id);
				allocation.properties.JIRA = { relation: [{ id: createdId }] };
				fixture.pages.set(id, allocation);
			}
			return true;
		});
		const response = await api(env, "/api/jiras", "POST", newJiraInput);
		expect(response.status).toBe(409);
		expect((await response.json() as any)).toMatchObject({ code: "SPRINT_ALLOCATION_CONFLICT", allocationCount: 2 });
		expect(mutations(fixture.fetchMock)).toHaveLength(2);
	});
});

describe("current Sprint assignment allocation recovery", () => {
	it("preserves a duplicate conflict discovered after an uncertain allocation create", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = notionFixture(env);
		fixture.failWhen((url, init) => {
			if (!url.endsWith("/v1/pages") || init.method !== "POST" || JSON.parse(String(init.body)).parent.data_source_id !== env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID) return false;
			for (const id of [allocationId, createdId]) fixture.pages.set(id, allocationPage(env, [sprintId], id));
			return true;
		});
		const response = await api(env, "/api/jiras/CRI-123/current-sprint", "PATCH", {});
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ code: "SPRINT_ALLOCATION_CONFLICT", allocationCount: 2 });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(mutations(fixture.fetchMock)).toHaveLength(1);
		expect(mutations(fixture.fetchMock)[0][1].method).toBe("POST");
		expect(fixture.pages.get(jiraId)!.properties.Sprints.relation).toEqual([]);
		const retry = await api(env, "/api/jiras/CRI-123/current-sprint", "PATCH", {});
		expect(retry.status).toBe(409);
		expect((await retry.json() as any).code).toBe("SPRINT_ALLOCATION_CONFLICT");
		expect(mutations(fixture.fetchMock)).toHaveLength(1);
	});
});

describe("active Sprint allocation sync", () => {
	it("rejects a non-empty sync body before querying Notion", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = notionFixture(env);
		const response = await api(env, syncPath, "PATCH", { sprintId });
		expect(response.status).toBe(400);
		expect(fixture.fetchMock).not.toHaveBeenCalled();
	});

	it("follows every JIRA and allocation cursor before deciding what is missing", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		const second = jiraPage(env, [sprintId]); second.id = projectId;
		fixture.pages.set(projectId, second);
		fixture.pages.get(createdId)!.properties.JIRA = { relation: [{ id: projectId }] };
		const original = fixture.fetchMock.getMockImplementation()!;
		fixture.fetchMock.mockImplementation(async (url, init) => {
			const body = init?.body ? JSON.parse(String(init.body)) : {};
			const source = url.includes(env.JIRAS_DATA_SOURCE_ID) ? "jira" : url.includes(env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID) ? "allocation" : null;
			if (url.endsWith("/query") && source) {
				const id = source === "jira" ? (body.start_cursor ? projectId : jiraId) : (body.start_cursor ? createdId : allocationId);
				return Response.json({ results: [fixture.pages.get(id)], has_more: !body.start_cursor, next_cursor: body.start_cursor ? null : "next" });
			}
			return original(url, init);
		});
		const response = await api(env, syncPath, "PATCH", {});
		expect(response.status).toBe(200);
		expect((await response.json() as any).data).toMatchObject({ created: 0, existing: 2, conflicts: [] });
		expect(mutations(fixture.fetchMock)).toHaveLength(0);
	});

	it("recovers a failed sync on retry without duplicating completed allocations", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = notionFixture(env);
		fixture.pages.set(jiraId, jiraPage(env, [sprintId]));
		fixture.failWhen((url, init) => url.endsWith("/v1/pages") && init.method === "POST");
		const first = await api(env, syncPath, "PATCH", {});
		expect(first.status).toBe(502);
		expect((await first.json() as any).code).toBe("SPRINT_ALLOCATION_SYNC_PARTIAL");
		fixture.failWhen(undefined);
		expect((await api(env, syncPath, "PATCH", {})).status).toBe(200);
		const writes = mutations(fixture.fetchMock).length;
		const retry = await api(env, syncPath, "PATCH", {});
		expect((await retry.json() as any).data).toMatchObject({ created: 0, existing: 1 });
		expect(mutations(fixture.fetchMock)).toHaveLength(writes);
	});
	it("creates missing allocations once and preserves existing Planned Days and history", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = notionFixture(env);
		fixture.pages.set(jiraId, jiraPage(env, [sprintId]));
		const second = jiraPage(env, [sprintId]); second.id = projectId;
		second.properties["JIRA Key"] = { title: [{ plain_text: "CRI-789" }] };
		fixture.pages.set(projectId, second);
		const existing = allocationPage(env); existing.properties.JIRA = { relation: [{ id: projectId }] }; existing.properties["Planned Days"] = { number: 3.5 };
		fixture.pages.set(allocationId, existing);
		const historical = allocationPage(env, [projectId], "99999999-9999-9999-9999-999999999999");
		fixture.pages.set(historical.id, historical);
		const historyBefore = structuredClone(historical);
		const first = await api(env, syncPath, "PATCH", {});
		expect(first.status).toBe(200);
		expect((await first.json() as any).data).toMatchObject({ created: 1, existing: 1, conflicts: [], sprintDetail: { count: 2 } });
		expect(fixture.pages.get(allocationId)!.properties["Planned Days"].number).toBe(3.5);
		const retry = await api(env, syncPath, "PATCH", {});
		expect((await retry.json() as any).data).toMatchObject({ created: 0, existing: 2, conflicts: [] });
		expect(mutations(fixture.fetchMock)).toHaveLength(1);
		expect(fixture.pages.get(historical.id)).toEqual(historyBefore);
	});

	it("reports duplicate pairs while repairing another JIRA", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		const second = jiraPage(env, [sprintId]); second.id = projectId;
		fixture.pages.set(projectId, second);
		const response = await api(env, syncPath, "PATCH", {});
		expect(response.status).toBe(200);
		expect((await response.json() as any).data).toMatchObject({ created: 1, existing: 0, conflicts: [{ jiraId, jiraKey: "CRI-123", allocationCount: 2 }] });
		expect(mutations(fixture.fetchMock)).toHaveLength(1);
	});

	it("does not implicitly carry JIRAs over when activating a new Sprint", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		fixture.pages.delete(createdId);
		const previousJira = structuredClone(fixture.pages.get(jiraId));
		const previousAllocation = structuredClone(fixture.pages.get(allocationId));
		expect((await api(env, "/api/sprints", "POST", { ...sprintInput, makeActive: true })).status).toBe(201);
		expect(fixture.pages.get(jiraId)).toEqual(previousJira);
		expect(fixture.pages.get(allocationId)).toEqual(previousAllocation);
		expect(mutations(fixture.fetchMock).filter(([, init]) => JSON.parse(String(init.body)).parent?.data_source_id === env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID)).toHaveLength(0);
	});
});

describe("active Sprint bandwidth planning", () => {
	it("includes allocations on later Notion pages in capacity validation", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		fixture.pages.get(createdId)!.properties["Planned Days"] = { number: 5 };
		const original = fixture.fetchMock.getMockImplementation()!;
		fixture.fetchMock.mockImplementation(async (url, init) => {
			if (url.endsWith(`/data_sources/${env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID}/query`)) {
				const next = Boolean(JSON.parse(String(init?.body)).start_cursor);
				return Response.json({ results: [fixture.pages.get(next ? createdId : allocationId)], has_more: !next, next_cursor: next ? null : "next" });
			}
			return original(url, init);
		});
		const response = await api(env, planPath, "PATCH", { allocations: [{ allocationId, plannedDays: 6 }] });
		expect(response.status).toBe(409);
		expect((await response.json() as any)).toMatchObject({ code: "SPRINT_CAPACITY_EXCEEDED", requestedAllocatedDays: 11 });
		expect(mutations(fixture.fetchMock)).toHaveLength(0);
	});

	it("accepts the 50-allocation boundary without writing unchanged rows", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		const allocations = Array.from({ length: 50 }, (_, index) => {
			const id = `10000000-0000-0000-0000-${String(index).padStart(12, "0")}`;
			const allocation = allocationPage(env, [sprintId], id);
			allocation.properties.JIRA = { relation: [{ id: `20000000-0000-0000-0000-${String(index).padStart(12, "0")}` }] };
			fixture.pages.set(id, allocation);
			return { allocationId: id, plannedDays: 0 };
		});
		const response = await api(env, planPath, "PATCH", { allocations });
		expect(response.status).toBe(200);
		expect((await response.json() as any).data.alreadySatisfiedAllocationIds).toHaveLength(50);
		expect(mutations(fixture.fetchMock)).toHaveLength(0);
	});

	it("treats a write whose response was lost as satisfied on retry", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		fixture.failWhen((url, init) => {
			if (!url.endsWith(allocationId) || init.method !== "PATCH") return false;
			fixture.pages.get(allocationId)!.properties["Planned Days"] = { number: 2 };
			return true;
		});
		const body = { allocations: [{ allocationId, plannedDays: 2 }] };
		expect((await api(env, planPath, "PATCH", body)).status).toBe(502);
		fixture.failWhen(undefined);
		const writes = mutations(fixture.fetchMock).length;
		const response = await api(env, planPath, "PATCH", body);
		expect(response.status).toBe(200);
		expect((await response.json() as any).data).toMatchObject({ updatedAllocationIds: [], alreadySatisfiedAllocationIds: [allocationId], summary: { allocatedDays: 2 } });
		expect(mutations(fixture.fetchMock)).toHaveLength(writes);
	});
	it.each([0, 0.25, 0.5, 3.5])("supports Planned Days %s and skips unchanged rows on identical retry", async (plannedDays) => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		const body = { allocations: [{ allocationId, plannedDays }] };
		const first = await api(env, planPath, "PATCH", body);
		expect(first.status).toBe(200);
		expect(first.headers.get("Cache-Control")).toBe("no-store");
		const result = (await first.json() as any).data;
		expect(result.summary).toMatchObject({ availableDays: 9.5, allocatedDays: plannedDays, remainingDays: 9.5 - plannedDays });
		expect(result.updatedAllocationIds).toEqual(plannedDays === 0 ? [] : [allocationId]);
		expect(result.alreadySatisfiedAllocationIds).toEqual(plannedDays === 0 ? [allocationId] : []);
		const count = mutations(fixture.fetchMock).length;
		const retry = await api(env, planPath, "PATCH", body);
		expect(retry.status).toBe(200);
		expect((await retry.json() as any).data).toMatchObject({ updatedAllocationIds: [], alreadySatisfiedAllocationIds: [allocationId] });
		expect(mutations(fixture.fetchMock)).toHaveLength(count);
	});

	it("updates multiple allocations and calculates the plan independently of stale rollups", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env, true);
		const response = await api(env, planPath, "PATCH", { allocations: [{ allocationId, plannedDays: 3 }, { allocationId: createdId, plannedDays: 4.6 }] });
		expect(response.status).toBe(200);
		const result = (await response.json() as any).data;
		expect(result.summary.allocatedDays).toBe(7.6);
		expect(result.summary.remainingDays).toBeCloseTo(1.9);
		expect(result.summary.utilizationPercent).toBeCloseTo(80);
		expect(result.sprintDetail.sprint.allocatedDays).toBe(0);
		for (const [, init] of mutations(fixture.fetchMock)) expect(Object.keys(JSON.parse(String(init.body)).properties)).toEqual(["Planned Days"]);
		expect(mutations(fixture.fetchMock)).toHaveLength(2);
		const calls = fixture.fetchMock.mock.calls;
		const firstWrite = calls.findIndex(([, init]) => init?.method === "PATCH");
		expect(calls.slice(0, firstWrite).filter(([url, init]) => init?.method === "GET" && (url.endsWith(allocationId) || url.endsWith(createdId)))).toHaveLength(2);
	});

	it.each([9.5, 9.75])("compares resulting total %s with Available Days rather than Capacity Days", async (total) => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		fixture.pages.get(createdId)!.properties["Planned Days"] = { number: 2 };
		const response = await api(env, planPath, "PATCH", { allocations: [{ allocationId, plannedDays: total - 2 }] });
		expect(response.status).toBe(total === 9.5 ? 200 : 409);
		if (total > 9.5) {
			expect(await response.json()).toEqual({ error: "Sprint plan exceeds available capacity", code: "SPRINT_CAPACITY_EXCEEDED", availableDays: 9.5, requestedAllocatedDays: 9.75, overBy: 0.25 });
			expect(mutations(fixture.fetchMock)).toHaveLength(0);
		}
	});

	it("allows decimal equality despite floating-point representation", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		fixture.pages.get(sprintId)!.properties["Available Days"] = { formula: { number: 0.3 } };
		const response = await api(env, planPath, "PATCH", { allocations: [{ allocationId, plannedDays: 0.1 }, { allocationId: createdId, plannedDays: 0.2 }] });
		expect(response.status).toBe(200);
		expect((await response.json() as any).data.summary).toEqual({ availableDays: 0.3, allocatedDays: 0.3, remainingDays: 0, utilizationPercent: 100 });
	});

	it("reports zero utilization for an empty zero-capacity plan", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		fixture.pages.get(sprintId)!.properties["Available Days"] = { formula: { number: 0 } };
		const response = await api(env, planPath, "PATCH", { allocations: [{ allocationId, plannedDays: 0 }] });
		expect(response.status).toBe(200);
		expect((await response.json() as any).data.summary.utilizationPercent).toBe(0);
	});

	it("rejects even a tiny positive allocation when availability is zero", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		fixture.pages.get(sprintId)!.properties["Available Days"] = { formula: { number: 0 } };
		const response = await api(env, planPath, "PATCH", { allocations: [{ allocationId, plannedDays: 1e-17 }] });
		expect(response.status).toBe(409);
		expect((await response.json() as any).code).toBe("SPRINT_CAPACITY_EXCEEDED");
		expect(mutations(fixture.fetchMock)).toHaveLength(0);
	});

	it.each([
		{}, { allocations: [] }, { allocations: "bad" }, { allocations: [null] },
		{ allocations: [{ allocationId: "invalid", plannedDays: 1 }] },
		{ allocations: [{ allocationId, plannedDays: -1 }] }, { allocations: [{ allocationId, plannedDays: "1" }] },
		{ allocations: [{ allocationId, plannedDays: null }] }, { allocations: [{ allocationId }] },
		{ allocations: [{ allocationId, plannedDays: 1, notes: "No" }] },
		{ allocations: [{ allocationId, plannedDays: 1 }], sprintId },
		{ allocations: [{ allocationId, plannedDays: 1 }, { allocationId: allocationId.replaceAll("-", ""), plannedDays: 2 }] },
		{ allocations: Array.from({ length: 51 }, () => ({ allocationId, plannedDays: 1 })) },
	])("rejects invalid or duplicate plan input %j", async (body) => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		const response = await api(env, planPath, "PATCH", body);
		expect(response.status).toBe(400);
		expect(fixture.fetchMock).not.toHaveBeenCalled();
	});

	it.each(["inactive", "none", "multiple", "foreign", "missing"])("rejects %s allocation state before any writes", async (scenario) => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		const target = fixture.pages.get(createdId)!;
		if (scenario === "inactive") { fixture.pages.set(projectId, sprintPage(env, false, projectId)); target.properties.Sprint = { relation: [{ id: projectId }] }; }
		if (scenario === "none") target.properties.Sprint = { relation: [] };
		if (scenario === "multiple") target.properties.Sprint = { relation: [{ id: sprintId }, { id: projectId }] };
		if (scenario === "foreign") target.parent.data_source_id = env.JIRAS_DATA_SOURCE_ID;
		if (scenario === "missing") fixture.pages.delete(createdId);
		const response = await api(env, planPath, "PATCH", { allocations: [{ allocationId, plannedDays: 1 }, { allocationId: createdId, plannedDays: 1 }] });
		expect(response.status).toBe(scenario === "missing" ? 404 : scenario === "foreign" ? 400 : 409);
		expect(mutations(fixture.fetchMock)).toHaveLength(0);
	});

	it("retries partial success by skipping completed values", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		fixture.failWhen((url, init) => url.endsWith(createdId) && init.method === "PATCH");
		const body = { allocations: [{ allocationId, plannedDays: 2 }, { allocationId: createdId, plannedDays: 3 }] };
		const first = await api(env, planPath, "PATCH", body);
		expect(first.status).toBe(502);
		expect((await first.json() as any)).toMatchObject({ code: "SPRINT_PLAN_PARTIAL", updatedAllocationIds: [allocationId], failedAllocationId: createdId });
		fixture.failWhen(undefined);
		const beforeRetry = mutations(fixture.fetchMock).length;
		const retry = await api(env, planPath, "PATCH", body);
		expect(retry.status).toBe(200);
		expect((await retry.json() as any).data).toMatchObject({ updatedAllocationIds: [createdId], alreadySatisfiedAllocationIds: [allocationId], summary: { allocatedDays: 5, remainingDays: 4.5 } });
		expect(mutations(fixture.fetchMock).slice(beforeRetry).map(([url]) => url)).toEqual([`https://api.notion.com/v1/pages/${createdId}`]);
	});

	it("applies reductions before increases to avoid over-allocation after a partial failure", async () => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		fixture.pages.get(allocationId)!.properties["Planned Days"] = { number: 1 };
		fixture.pages.get(createdId)!.properties["Planned Days"] = { number: 8 };
		const response = await api(env, planPath, "PATCH", { allocations: [{ allocationId, plannedDays: 8 }, { allocationId: createdId, plannedDays: 1 }] });
		expect(response.status).toBe(200);
		expect(mutations(fixture.fetchMock).map(([url]) => url)).toEqual([`https://api.notion.com/v1/pages/${createdId}`, `https://api.notion.com/v1/pages/${allocationId}`]);
	});
});

describe("planning routes and protection", () => {
	it.each([syncPath, planPath])("rejects an expired control for %s", async (path) => {
		const env = managementEnv();
		let clock = Date.parse("2026-10-14T00:00:00Z");
		vi.spyOn(Date, "now").mockImplementation(() => clock);
		await enableSprint(env);
		clock += ALTER_CONTROL_TTL_SECONDS * 1000;
		const fixture = planningFixture(env);
		const response = await api(env, path, "PATCH", path === syncPath ? {} : { allocations: [{ allocationId, plannedDays: 1 }] });
		expect(response.status).toBe(403);
		expect(fixture.fetchMock).not.toHaveBeenCalled();
	});

	it.each([0, 2])("rejects %s active Sprints for both planning routes", async (count) => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = planningFixture(env);
		if (count === 0) fixture.pages.get(sprintId)!.properties.Active.checkbox = false;
		else fixture.pages.set(projectId, sprintPage(env, true, projectId));
		for (const path of [syncPath, planPath]) {
			const response = await api(env, path, "PATCH", path === syncPath ? {} : { allocations: [{ allocationId, plannedDays: 1 }] });
			expect(response.status).toBe(409);
			expect((await response.json() as any).code).toBe(count ? "ACTIVE_SPRINT_CONFLICT" : "ACTIVE_SPRINT_NOT_FOUND");
		}
		expect(mutations(fixture.fetchMock)).toHaveLength(0);
	});
	it.each([syncPath, planPath])("advertises PATCH and OPTIONS for %s", async (path) => {
		const response = await api(managementEnv(), path, "OPTIONS");
		expect(response.status).toBe(204);
		expect(response.headers.get("Allow")).toBe("PATCH, OPTIONS");
		expect(response.headers.get("Accept-Query")).toBeNull();
	});

	it.each([syncPath, planPath])("requires Alter Sprint for %s", async (path) => {
		const env = managementEnv(); const fixture = planningFixture(env);
		const response = await api(env, path, "PATCH", path === syncPath ? {} : { allocations: [{ allocationId, plannedDays: 1 }] });
		expect(response.status).toBe(403);
		expect((await response.json() as any).code).toBe("ALTER_SPRINT_DISABLED");
		expect(fixture.fetchMock).not.toHaveBeenCalled();
	});

	it("prevents planning writes if Alter Sprint expires during preflight", async () => {
		const env = managementEnv();
		let clock = Date.parse("2026-10-14T00:00:00Z");
		vi.spyOn(Date, "now").mockImplementation(() => clock);
		await enableSprint(env);
		const fixture = planningFixture(env);
		fixture.failWhen((url, init) => { if (url.endsWith(allocationId) && init.method === "GET") clock += ALTER_CONTROL_TTL_SECONDS * 1000; return false; });
		const response = await api(env, planPath, "PATCH", { allocations: [{ allocationId, plannedDays: 1 }] });
		expect(response.status).toBe(403);
		expect(mutations(fixture.fetchMock)).toHaveLength(0);
	});
});
