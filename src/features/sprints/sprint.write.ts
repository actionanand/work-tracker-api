import type { Env } from "../../shared/env";
import { checked, domainError, ManagedWriteError, ownedPage } from "../../shared/http/managed-write";
import { ensureAllowedFields, invalidRequest, parseBooleanValue, parseDateValue, parseNotionIdValue, parseNumberValue, parseStringValue } from "../../shared/http/validation";
import { createNotionPage, queryAllNotionDataSourcePages, updateNotionPage } from "../../shared/notion/notion-client";
import { checkboxProperty, dateProperty, numberProperty, relationProperty, selectByIdProperty, titleProperty, type NotionPageProperties } from "../../shared/notion/notion-properties";
import type { NotionPageWithParent } from "../../shared/notion/notion-page-ownership";
import { getDataSourceProperties, getOptionIdByName } from "../../shared/notion/notion-schema";
import { requireAlterSprint } from "../settings/alter-controls.service";
import { getWorkCalendarSettings } from "../settings/work-calendar.service";
import { sprintFilters } from "./sprint.filters";
import { mapSprint, type NotionSprintPage, type Sprint } from "./sprint.mapper";

const editFields = new Set(["sprint", "projectId", "startDate", "endDate", "plannedLeaveDays", "holidayDays"]);

export async function resolveActiveSprint(env: Env): Promise<Sprint> {
	const pages = await queryAllNotionDataSourcePages<NotionSprintPage>({
		env, dataSourceId: env.SPRINTS_DATA_SOURCE_ID, filter: sprintFilters.active,
	});
	if (!pages.length) throw domainError(409, "No active Sprint is configured", "ACTIVE_SPRINT_NOT_FOUND");
	if (pages.length !== 1) throw domainError(409, "Multiple active Sprints are configured", "ACTIVE_SPRINT_CONFLICT");
	return mapSprint(pages[0]);
}

export function nonNegativeNumber(value: unknown, field: string): number {
	const number = checked(parseNumberValue(value, field));
	if (typeof number !== "number" || number < 0) {
		throw new ManagedWriteError(invalidRequest("Expected a finite non-negative number", field));
	}
	return number;
}

async function weekOffProperties(env: Env): Promise<NotionPageProperties> {
	const { weekOffDays } = await getWorkCalendarSettings(env);
	if (weekOffDays.length > 2) {
		throw domainError(409, "Sprint supports at most two configured week-off days", "SPRINT_WEEK_OFF_CONFIGURATION_UNSUPPORTED");
	}
	const schema = await getDataSourceProperties(env, env.SPRINTS_DATA_SOURCE_ID);
	const properties: NotionPageProperties = {};
	for (let index = 0; index < 2; index++) {
		const property = `Week Off ${index + 1}`;
		const day = weekOffDays[index];
		const optionId = day ? getOptionIdByName(schema, property, day) : null;
		if (day && !optionId) {
			throw domainError(409, "Configured week-off day is not available in Sprint options", "SPRINT_WEEK_OFF_OPTION_MISSING");
		}
		properties[property] = selectByIdProperty(optionId);
	}
	return properties;
}

async function writeProperties(env: Env, body: Record<string, unknown>, current?: Sprint): Promise<NotionPageProperties> {
	const properties: NotionPageProperties = {};
	if (!current || body.sprint !== undefined) {
		const name = checked(parseStringValue(body.sprint, "sprint"));
		if (!name) throw new ManagedWriteError(invalidRequest("Expected a non-empty string", "sprint"));
		properties.Sprint = titleProperty(name);
	}
	if (!current || body.projectId !== undefined) {
		const projectId = checked(parseNotionIdValue(body.projectId, "projectId"));
		if (!projectId) throw new ManagedWriteError(invalidRequest("Expected a valid Notion page ID", "projectId"));
		await ownedPage(env, projectId, env.PROJECTS_DATA_SOURCE_ID, "Project");
		properties.Project = relationProperty([projectId]);
	}
	const startDate = body.startDate === undefined && current
		? current.startDate : checked(parseDateValue(body.startDate, "startDate"));
	const endDate = body.endDate === undefined && current
		? current.endDate : checked(parseDateValue(body.endDate, "endDate"));
	if (!startDate) throw new ManagedWriteError(invalidRequest("Start Date is required", "startDate"));
	if (!endDate) throw new ManagedWriteError(invalidRequest("End Date is required", "endDate"));
	if (endDate < startDate) throw new ManagedWriteError(invalidRequest("End Date must be on or after Start Date", "endDate"));
	if (!current || body.startDate !== undefined) properties["Start Date"] = dateProperty(startDate);
	if (!current || body.endDate !== undefined) properties["End Date"] = dateProperty(endDate);
	for (const [field, property] of [["plannedLeaveDays", "Planned Leave Days"], ["holidayDays", "Holiday Days"]]) {
		if (!current || body[field] !== undefined) {
			properties[property] = numberProperty(nonNegativeNumber(body[field] === undefined ? 0 : body[field], field));
		}
	}
	return { ...properties, ...await weekOffProperties(env) };
}

export async function createSprint(env: Env, body: Record<string, unknown>): Promise<Sprint> {
	await requireAlterSprint(env);
	checked(ensureAllowedFields(body, new Set([...editFields, "makeActive"])));
	const makeActive = checked(parseBooleanValue(body.makeActive, "makeActive")) ?? false;
	const properties = await writeProperties(env, body);
	const previous = makeActive
		? await queryAllNotionDataSourcePages<NotionSprintPage>({ env, dataSourceId: env.SPRINTS_DATA_SOURCE_ID, filter: sprintFilters.active })
		: [];
	await requireAlterSprint(env);
	const created = await createNotionPage<NotionSprintPage>({
		env, dataSourceId: env.SPRINTS_DATA_SOURCE_ID,
		properties: { ...properties, Active: checkboxProperty(false) },
	});
	if (!makeActive) return mapSprint(created);
	try {
		for (const page of previous) {
			await requireAlterSprint(env);
			await updateNotionPage({ env, pageId: page.id, properties: { Active: checkboxProperty(false) } });
		}
		await requireAlterSprint(env);
		const active = await updateNotionPage<NotionSprintPage>({ env, pageId: created.id, properties: { Active: checkboxProperty(true) } });
		return mapSprint(active);
	} catch {
		// A failed request may have reached Notion. Compensate every affected page.
		try {
			await updateNotionPage({ env, pageId: created.id, properties: { Active: checkboxProperty(false) } });
		} catch { console.error("SPRINT_ACTIVATION_COMPENSATION_FAILED"); }
		for (const page of previous) {
			try {
				await updateNotionPage({ env, pageId: page.id, properties: { Active: checkboxProperty(true) } });
			} catch { console.error("SPRINT_ACTIVATION_COMPENSATION_FAILED"); }
		}
		throw domainError(502, "Sprint activation could not be completed safely", "SPRINT_ACTIVATION_PARTIAL");
	}
}

export async function updateSprint(env: Env, sprintId: string, body: Record<string, unknown>): Promise<Sprint> {
	await requireAlterSprint(env);
	checked(ensureAllowedFields(body, editFields));
	if (!Object.keys(body).length) throw new ManagedWriteError(invalidRequest("Expected at least one editable field"));
	const page = await ownedPage<NotionSprintPage & NotionPageWithParent>(env, sprintId, env.SPRINTS_DATA_SOURCE_ID, "Sprint");
	const current = mapSprint(page);
	if (!current.active) throw domainError(409, "Only the active Sprint can be edited", "SPRINT_NOT_ACTIVE");
	const properties = await writeProperties(env, body, current);
	await requireAlterSprint(env);
	return mapSprint(await updateNotionPage<NotionSprintPage>({ env, pageId: sprintId, properties }));
}
