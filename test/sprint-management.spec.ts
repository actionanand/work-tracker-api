import { afterEach, describe, expect, it, vi } from "vitest";
import { api, managementEnv, notionFixture, enableSprint, sprintInput, sprintId, projectId, jiraId, allocationId, createdId, sprintPage, jiraPage, allocationPage, mutations } from "./helpers/management";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Sprint creation", () => {
	it("writes only writable properties with default work-calendar weekdays", async () => {
		const env = managementEnv();
		await enableSprint(env);
		const { fetchMock } = notionFixture(env);
		const response = await api(env, "/api/sprints", "POST", { ...sprintInput, plannedLeaveDays: 0.5, holidayDays: 1 });
		expect(response.status).toBe(201);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		const [url, init] = mutations(fetchMock)[0];
		expect(url).toBe("https://api.notion.com/v1/pages");
		expect(JSON.parse(String(init.body))).toEqual({
			parent: { data_source_id: env.SPRINTS_DATA_SOURCE_ID },
			properties: {
				Sprint: { title: [{ text: { content: "CRI - 26.4 - Sprint 3" } }] },
				Project: { relation: [{ id: projectId }] },
				"Start Date": { date: { start: "2026-10-28" } }, "End Date": { date: { start: "2026-11-10" } },
				"Week Off 1": { select: { id: "weekday-Saturday" } }, "Week Off 2": { select: { id: "weekday-Sunday" } },
				"Planned Leave Days": { number: 0.5 }, "Holiday Days": { number: 1 }, Active: { checkbox: false },
			},
		});
		expect((await response.json() as any).data.plannedLeaveDays).toBe(0.5);
	});

	it.each([
		[["Friday", "Saturday"], "weekday-Friday", "weekday-Saturday"],
		[["Friday"], "weekday-Friday", null], [[], null, null],
	])("uses saved work-calendar days %j", async (days, first, second) => {
		const env = managementEnv();
		env.AUTH_DB.workCalendar.weekOffDaysJson = JSON.stringify(days);
		await enableSprint(env);
		const { fetchMock } = notionFixture(env);
		expect((await api(env, "/api/sprints", "POST", sprintInput)).status).toBe(201);
		const properties = JSON.parse(String(mutations(fetchMock)[0][1].body)).properties;
		expect(properties["Week Off 1"]).toEqual({ select: first ? { id: first } : null });
		expect(properties["Week Off 2"]).toEqual({ select: second ? { id: second } : null });
	});

	it.each([0, 0.5, 2.5])("accepts non-negative leave/holiday decimals %s", async (value) => {
		const env = managementEnv(); await enableSprint(env); notionFixture(env);
		const response = await api(env, "/api/sprints", "POST", { ...sprintInput, plannedLeaveDays: value, holidayDays: value });
		expect(response.status).toBe(201);
		expect((await response.json() as any).data).toMatchObject({ plannedLeaveDays: value, holidayDays: value });
	});

	it.each([
		{ sprint: " " }, { sprint: 12 }, { projectId: "invalid" }, { projectId: null },
		{ startDate: "2026-02-30" }, { startDate: null }, { endDate: "bad" }, { endDate: "2026-10-01" },
		{ plannedLeaveDays: -1 }, { plannedLeaveDays: "1" }, { holidayDays: -0.5 }, { holidayDays: null },
		{ makeActive: "true" }, { weekOff1: "Monday" }, { weekOff2: "Tuesday" }, { capacityDays: 10 }, { allocations: [] },
	])("rejects invalid/read-only create fields %j before mutation", async (override) => {
		const env = managementEnv(); await enableSprint(env);
		const { fetchMock } = notionFixture(env);
		expect((await api(env, "/api/sprints", "POST", { ...sprintInput, ...override })).status).toBe(400);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("validates Project datasource ownership", async () => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.get(projectId)!.parent.data_source_id = env.JIRAS_DATA_SOURCE_ID;
		expect((await api(env, "/api/sprints", "POST", sprintInput)).status).toBe(400);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it.each(["too-many-days", "missing-option"])("rejects unsupported week-off settings: %s", async (scenario) => {
		const env = managementEnv(); await enableSprint(env);
		const { schema, fetchMock } = notionFixture(env);
		if (scenario === "too-many-days") env.AUTH_DB.workCalendar.weekOffDaysJson = '["Friday","Saturday","Sunday"]';
		else schema["Week Off 2"].select.options = [];
		const response = await api(env, "/api/sprints", "POST", sprintInput);
		expect(response.status).toBe(409);
		expect((await response.json() as any).code).toBe(scenario === "too-many-days" ? "SPRINT_WEEK_OFF_CONFIGURATION_UNSUPPORTED" : "SPRINT_WEEK_OFF_OPTION_MISSING");
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("accepts a manually adjusted duration and leaves active Sprints unchanged", async () => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		const response = await api(env, "/api/sprints", "POST", { ...sprintInput, endDate: "2026-12-01", makeActive: false });
		expect(response.status).toBe(201);
		expect(pages.get(sprintId)!.properties.Active.checkbox).toBe(true);
		expect(mutations(fetchMock)).toHaveLength(1);
		expect((await response.json() as any).data.active).toBe(false);
	});

	it.each([0, 1, 2])("activates a new Sprint and deactivates all %s previously active Sprints", async (count) => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		if (!count) pages.get(sprintId)!.properties.Active.checkbox = false;
		if (count === 2) pages.set(allocationId, sprintPage(env, true, allocationId));
		const response = await api(env, "/api/sprints", "POST", { ...sprintInput, makeActive: true });
		expect(response.status).toBe(201);
		const active = [...pages.values()].filter((item) => item.parent.data_source_id === env.SPRINTS_DATA_SOURCE_ID && item.properties.Active.checkbox);
		expect(active.map((item) => item.id)).toEqual([createdId]);
		expect((await response.json() as any).data.active).toBe(true);
		const firstWrite = fetchMock.mock.calls.findIndex(([url]) => url.endsWith("/v1/pages"));
		const activeQuery = fetchMock.mock.calls.findIndex(([url, init]) => url.includes(`/data_sources/${env.SPRINTS_DATA_SOURCE_ID}/query`) && JSON.parse(String(init?.body)).filter?.property === "Active");
		expect(activeQuery).toBeLessThan(firstWrite);
	});

	it.each(["deactivation", "activation"])("compensates a failed %s and never returns normal success", async (failure) => {
		const env = managementEnv(); await enableSprint(env);
		const fixture = notionFixture(env);
		let failed = false;
		fixture.failWhen((url, init) => {
			if (failed || init.method !== "PATCH") return false;
			const shouldFail = failure === "deactivation" ? url.endsWith(sprintId) : url.endsWith(createdId);
			if (shouldFail) failed = true;
			return shouldFail;
		});
		const response = await api(env, "/api/sprints", "POST", { ...sprintInput, makeActive: true });
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ error: "Sprint activation could not be completed safely", code: "SPRINT_ACTIVATION_PARTIAL" });
		expect(fixture.pages.get(sprintId)!.properties.Active.checkbox).toBe(true);
		expect(fixture.pages.get(createdId)!.properties.Active.checkbox).toBe(false);
	});
});

describe("active Sprint editing", () => {
	it("updates allowed fields and refreshes current calendar weekdays", async () => {
		const env = managementEnv(); await enableSprint(env);
		const { fetchMock } = notionFixture(env);
		env.AUTH_DB.workCalendar.weekOffDaysJson = '["Friday","Saturday"]';
		const response = await api(env, `/api/sprints/${sprintId}`, "PATCH", { sprint: " Updated ", projectId, startDate: "2026-10-15", endDate: "2026-11-01", plannedLeaveDays: 0.5, holidayDays: 2 });
		expect(response.status).toBe(200);
		const properties = JSON.parse(String(mutations(fetchMock)[0][1].body)).properties;
		expect(properties).toEqual({
			Sprint: { title: [{ text: { content: "Updated" } }] }, Project: { relation: [{ id: projectId }] },
			"Start Date": { date: { start: "2026-10-15" } }, "End Date": { date: { start: "2026-11-01" } },
			"Planned Leave Days": { number: 0.5 }, "Holiday Days": { number: 2 },
			"Week Off 1": { select: { id: "weekday-Friday" } }, "Week Off 2": { select: { id: "weekday-Saturday" } },
		});
	});

	it("rejects an inactive Sprint", async () => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.get(sprintId)!.properties.Active.checkbox = false;
		const response = await api(env, `/api/sprints/${sprintId}`, "PATCH", { holidayDays: 1 });
		expect(response.status).toBe(409);
		expect((await response.json() as any).code).toBe("SPRINT_NOT_ACTIVE");
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it.each([
		{}, { active: false }, { active: true }, { makeActive: true }, { weekOff1: "Friday" }, { weekOff2: "Sunday" },
		{ capacityDays: 1 }, { availableDays: 1 }, { allocatedDays: 1 }, { remainingDays: 1 }, { allocationIds: [] },
		{ startDate: "2026-11-01" }, { endDate: "2026-10-01" }, { plannedLeaveDays: -1 }, { holidayDays: "two" },
	])("rejects unsupported/invalid Sprint PATCH %j", async (body) => {
		const env = managementEnv(); await enableSprint(env);
		const { fetchMock } = notionFixture(env);
		expect((await api(env, `/api/sprints/${sprintId}`, "PATCH", body)).status).toBe(400);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("rejects wrong Sprint or Project ownership", async () => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.get(projectId)!.parent.data_source_id = env.JIRAS_DATA_SOURCE_ID;
		expect((await api(env, `/api/sprints/${sprintId}`, "PATCH", { projectId })).status).toBe(400);
		pages.get(sprintId)!.parent.data_source_id = env.JIRAS_DATA_SOURCE_ID;
		expect((await api(env, `/api/sprints/${sprintId}`, "PATCH", { holidayDays: 1 })).status).toBe(400);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("does not implement Sprint DELETE", async () => {
		const env = managementEnv(); await enableSprint(env);
		const { fetchMock } = notionFixture(env);
		expect((await api(env, `/api/sprints/${sprintId}`, "DELETE")).status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("existing JIRA current-Sprint assignment", () => {
	it("reads every paginated Sprint relation before appending, preserving truncated history", async () => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, propertyPages, fetchMock } = notionFixture(env);
		pages.get(jiraId)!.properties.Sprints = { id: "sprints-property", type: "relation", has_more: true, relation: [{ id: projectId }] };
		propertyPages.set(`/v1/pages/${jiraId}/properties/sprints-property`, [[projectId], [allocationId]]);
		const response = await api(env, "/api/jiras/CRI-123/current-sprint", "PATCH", {});
		expect(response.status).toBe(200);
		expect(pages.get(jiraId)!.properties.Sprints.relation).toEqual([{ id: projectId }, { id: allocationId }, { id: sprintId }]);
		expect(fetchMock.mock.calls.filter(([url]) => url.includes("/properties/"))).toHaveLength(2);
	});

	it("preserves historical Sprint relations, creates a zero-day allocation and returns refreshed detail", async () => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(jiraId, jiraPage(env, [projectId]));
		const response = await api(env, "/api/jiras/CRI-123/current-sprint", "PATCH", {});
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.alreadyAssigned).toBe(false);
		expect(body.data.sprintIds).toEqual([projectId, sprintId]);
		expect(body.data.sprintHistory).toBeDefined();
		expect(body.currentSprint.id).toBe(sprintId);
		expect(body.allocation).toMatchObject({ allocation: "CRI-123", plannedDays: 0, sprintIds: [sprintId], jiraIds: [jiraId] });
		const create = mutations(fetchMock).find(([, init]) => init.method === "POST")!;
		expect(JSON.parse(String(create[1].body))).toEqual({ parent: { data_source_id: env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID }, properties: {
			Allocation: { title: [{ text: { content: "CRI-123" } }] }, Sprint: { relation: [{ id: sprintId }] },
			JIRA: { relation: [{ id: jiraId }] }, "Planned Days": { number: 0 },
		} });
		const query = fetchMock.mock.calls.find(([url, init]) => url.includes(env.SPRINT_ALLOCATIONS_DATA_SOURCE_ID) && init?.method === "POST")!;
		expect(JSON.parse(String(query[1]?.body)).filter).toEqual({ and: [
			{ property: "Sprint", relation: { contains: sprintId } }, { property: "JIRA", relation: { contains: jiraId } },
		] });
	});

	it("repeats idempotently without duplicating relation or allocation", async () => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		await api(env, "/api/jiras/CRI-123/current-sprint", "PATCH", {});
		const previousWrites = mutations(fetchMock).length;
		const response = await api(env, "/api/jiras/CRI-123/current-sprint", "PATCH", {});
		expect((await response.json() as any).alreadyAssigned).toBe(true);
		expect(mutations(fetchMock)).toHaveLength(previousWrites);
		expect(pages.get(jiraId)!.properties.Sprints.relation).toEqual([{ id: sprintId }]);
	});

	it.each(["relation", "allocation"])("repairs the missing side when only %s exists", async (exists) => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		if (exists === "relation") pages.set(jiraId, jiraPage(env, [sprintId]));
		else pages.set(allocationId, allocationPage(env));
		const response = await api(env, "/api/jiras/CRI-123/current-sprint", "PATCH", {});
		expect(response.status).toBe(200);
		expect((await response.json() as any).alreadyAssigned).toBe(false);
		expect(mutations(fetchMock)).toHaveLength(1);
		expect(mutations(fetchMock)[0][1].method).toBe(exists === "relation" ? "POST" : "PATCH");
	});

	it.each([0, 2])("rejects %s active Sprints before mutation", async (count) => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		if (!count) pages.get(sprintId)!.properties.Active.checkbox = false;
		else pages.set(projectId, sprintPage(env, true, projectId));
		const response = await api(env, "/api/jiras/CRI-123/current-sprint", "PATCH", {});
		expect(response.status).toBe(409);
		expect((await response.json() as any).code).toBe(count ? "ACTIVE_SPRINT_CONFLICT" : "ACTIVE_SPRINT_NOT_FOUND");
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("refuses duplicate allocations before changing JIRA relations", async () => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(allocationId, allocationPage(env)); pages.set(createdId, allocationPage(env, [sprintId], createdId));
		const response = await api(env, "/api/jiras/CRI-123/current-sprint", "PATCH", {});
		expect(response.status).toBe(409);
		expect((await response.json() as any)).toMatchObject({ code: "SPRINT_ALLOCATION_CONFLICT", allocationCount: 2 });
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it("rejects arbitrary client Sprint selection", async () => {
		const env = managementEnv(); await enableSprint(env);
		const { fetchMock } = notionFixture(env);
		expect((await api(env, "/api/jiras/CRI-123/current-sprint", "PATCH", { sprintId })).status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("current Sprint Planned Days", () => {
	it.each([0, 0.5, 3.5])("writes only Planned Days %s and returns refreshed Sprint detail", async (plannedDays) => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(jiraId, jiraPage(env, [sprintId])); pages.set(allocationId, allocationPage(env));
		const response = await api(env, `/api/sprint-allocations/${allocationId}`, "PATCH", { plannedDays });
		expect(response.status).toBe(200);
		expect(mutations(fetchMock)).toHaveLength(1);
		expect(JSON.parse(String(mutations(fetchMock)[0][1].body))).toEqual({ properties: { "Planned Days": { number: plannedDays } } });
		const body = await response.json() as any;
		expect(body.data.allocation.plannedDays).toBe(plannedDays);
		expect(body.data.allocation.spillReason).toBe("Existing spill reason");
		expect(body.data.sprintDetail.sprint).toMatchObject({ capacityDays: 10, availableDays: 9.5, allocatedDays: plannedDays, remainingDays: 9.5 - plannedDays });
		expect(body.data.sprintDetail.jiras[0]).toMatchObject({ plannedDays, spilloverCount: 2 });
	});

	it.each([{}, { plannedDays: -1 }, { plannedDays: "3" }, { plannedDays: null }, { plannedDays: 1, spillReason: "x" }, { plannedDays: 1, sprintIds: [] }, { plannedDays: 1, allocation: "Other" }])("rejects invalid Planned Days request %j", async (body) => {
		const env = managementEnv(); await enableSprint(env);
		const { fetchMock } = notionFixture(env);
		expect((await api(env, `/api/sprint-allocations/${allocationId}`, "PATCH", body)).status).toBe(400);
		expect(mutations(fetchMock)).toHaveLength(0);
	});

	it.each(["inactive", "no-sprint", "multiple-sprints", "wrong-allocation-source", "wrong-sprint-source"])("checks allocation/Sprint state: %s", async (scenario) => {
		const env = managementEnv(); await enableSprint(env);
		const { pages, fetchMock } = notionFixture(env);
		pages.set(allocationId, allocationPage(env, scenario === "no-sprint" ? [] : scenario === "multiple-sprints" ? [sprintId, projectId] : [sprintId]));
		if (scenario === "inactive") pages.get(sprintId)!.properties.Active.checkbox = false;
		if (scenario === "wrong-allocation-source") pages.get(allocationId)!.parent.data_source_id = env.JIRAS_DATA_SOURCE_ID;
		if (scenario === "wrong-sprint-source") pages.get(sprintId)!.parent.data_source_id = env.JIRAS_DATA_SOURCE_ID;
		const response = await api(env, `/api/sprint-allocations/${allocationId}`, "PATCH", { plannedDays: 1 });
		expect(response.status).toBe(scenario.startsWith("wrong") ? 400 : 409);
		expect(mutations(fetchMock)).toHaveLength(0);
	});
});
