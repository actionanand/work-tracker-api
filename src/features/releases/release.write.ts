import type { Env } from "../../shared/env";
import { checked, domainError, ManagedWriteError, ownedPage } from "../../shared/http/managed-write";
import { ensureAllowedFields, invalidOption, invalidRequest, parseDateValue, parseNotionIdValue, parseOptionIdValue, parseStringValue } from "../../shared/http/validation";
import { createNotionPage, trashNotionPage, updateNotionPage } from "../../shared/notion/notion-client";
import type { NotionPageWithParent } from "../../shared/notion/notion-page-ownership";
import { dateProperty, relationProperty, richTextProperty, selectByIdProperty, titleProperty, type NotionPageProperties } from "../../shared/notion/notion-properties";
import { getDataSourceProperties, validateOptionId } from "../../shared/notion/notion-schema";
import { mapJira, type NotionJiraPage } from "../jiras/jira.mapper";
import { requireAlterReleaseManagement } from "../settings/alter-controls.service";
import { mapReleaseItem, type NotionReleasePage, type ReleaseItem } from "./release.mapper";

export const releaseWritableFields = [
	{ key: "componentName", property: "Component Name", writable: true },
	{ key: "deploymentTypeOptionId", property: "Deployment Type", writable: true },
	{ key: "versionNumber", property: "Version Number", writable: true },
	{ key: "branch", property: "Branch", writable: true },
	{ key: "formalAnnouncedDate", property: "Formal Announced Date", writable: true },
	{ key: "confirmedReleaseDate", property: "Confirmed Release Date", writable: true },
	{ key: "notes", property: "Notes", writable: true },
];
const editFields = new Set(releaseWritableFields.map((field) => field.key));
const textFields = [["componentName", "Component Name"], ["versionNumber", "Version Number"], ["branch", "Branch"], ["notes", "Notes"]] as const;
const dateFields = [["formalAnnouncedDate", "Formal Announced Date"], ["confirmedReleaseDate", "Confirmed Release Date"]] as const;

export function requireUnconfirmed(item: ReleaseItem): void {
	if (item.confirmedReleaseDate !== null) {
		throw domainError(409, "Confirmed Release Items are read-only", "RELEASE_ITEM_CONFIRMED");
	}
}

async function releaseProperties(env: Env, body: Record<string, unknown>, create: boolean): Promise<NotionPageProperties> {
	const properties: NotionPageProperties = {};
	for (const [field, property] of textFields) {
		if (!create && body[field] === undefined) continue;
		const value = checked(parseStringValue(body[field], field));
		if (field === "componentName" && !value) throw new ManagedWriteError(invalidRequest("Expected a non-empty string", field));
		if (body[field] === null) throw new ManagedWriteError(invalidRequest("Expected a string", field));
		properties[property] = richTextProperty(value ?? "");
	}
	for (const [field, property] of dateFields) {
		if (create || body[field] !== undefined) properties[property] = dateProperty(checked(parseDateValue(body[field], field)) ?? null);
	}
	if (create || body.deploymentTypeOptionId !== undefined) {
		const id = checked(parseOptionIdValue(body.deploymentTypeOptionId, "deploymentTypeOptionId")) ?? null;
		if (id) {
			const schema = await getDataSourceProperties(env, env.RELEASE_ITEMS_DATA_SOURCE_ID);
			if (!validateOptionId(schema, "Deployment Type", id)) throw new ManagedWriteError(invalidOption("deploymentTypeOptionId"));
		}
		properties["Deployment Type"] = selectByIdProperty(id);
	}
	return properties;
}

function isReleasePatchNoOp(page: NotionReleasePage, current: ReleaseItem, properties: NotionPageProperties): boolean {
	for (const [field, property] of textFields) {
		if (!(property in properties)) continue;
		const value = properties[property] as { rich_text: Array<{ text: { content: string } }> };
		if (value.rich_text.map((fragment) => fragment.text.content).join("") !== current[field]) return false;
	}
	for (const [field, property] of dateFields) {
		if (!(property in properties)) continue;
		const value = properties[property] as { date: { start: string } | null };
		if ((value.date?.start ?? null) !== current[field]) return false;
	}
	if ("Deployment Type" in properties) {
		const value = properties["Deployment Type"] as { select: { id: string } | null };
		const stored = page.properties["Deployment Type"]?.select;
		const storedId = stored == null ? null : stored.id;
		if ((value.select?.id ?? null) !== storedId) return false;
	}
	return true;
}

export async function createRelease(env: Env, body: Record<string, unknown>): Promise<ReleaseItem> {
	await requireAlterReleaseManagement(env);
	checked(ensureAllowedFields(body, new Set([...editFields, "jiraId"])));
	const jiraId = checked(parseNotionIdValue(body.jiraId, "jiraId"));
	if (!jiraId) throw new ManagedWriteError(invalidRequest("Expected a valid Notion page ID", "jiraId"));
	const jiraPage = await ownedPage<NotionJiraPage & NotionPageWithParent>(env, jiraId, env.JIRAS_DATA_SOURCE_ID, "JIRA");
	const jira = mapJira(jiraPage);
	const properties = await releaseProperties(env, body, true);
	await requireAlterReleaseManagement(env);
	return mapReleaseItem(await createNotionPage<NotionReleasePage>({
		env, dataSourceId: env.RELEASE_ITEMS_DATA_SOURCE_ID,
		properties: { "Release Items": titleProperty(jira.jiraKey), JIRAs: relationProperty([jiraId]), ...properties },
	}));
}

export async function updateRelease(env: Env, releaseItemId: string, body: Record<string, unknown>): Promise<ReleaseItem> {
	await requireAlterReleaseManagement(env);
	checked(ensureAllowedFields(body, editFields));
	if (!Object.keys(body).length) throw new ManagedWriteError(invalidRequest("Expected at least one editable field"));
	const page = await ownedPage<NotionReleasePage & NotionPageWithParent>(env, releaseItemId, env.RELEASE_ITEMS_DATA_SOURCE_ID, "Release Item");
	const current = mapReleaseItem(page);
	const properties = await releaseProperties(env, body, false);
	await requireAlterReleaseManagement(env);
	if (current.confirmedReleaseDate !== null) {
		if (isReleasePatchNoOp(page, current, properties)) return current;
		requireUnconfirmed(current);
	}
	return mapReleaseItem(await updateNotionPage<NotionReleasePage>({ env, pageId: releaseItemId, properties }));
}

export async function deleteRelease(env: Env, releaseItemId: string): Promise<void> {
	await requireAlterReleaseManagement(env);
	const page = await ownedPage<NotionReleasePage & NotionPageWithParent>(env, releaseItemId, env.RELEASE_ITEMS_DATA_SOURCE_ID, "Release Item");
	requireUnconfirmed(mapReleaseItem(page));
	await requireAlterReleaseManagement(env);
	await trashNotionPage({ env, pageId: releaseItemId });
}
