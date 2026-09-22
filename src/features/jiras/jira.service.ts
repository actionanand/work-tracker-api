import type { Env } from "../../shared/env";
import {
	ensureAllowedFields,
	invalidOption,
	invalidRequest,
	parseBooleanValue,
	parseDateValue,
	parseNotionIdValue,
	parseOptionIdValue,
	parseStringArrayValue,
	parseStringValue,
} from "../../shared/http/validation";
import { NotionQueryError, type NotionQueryFilter } from "../../shared/notion/notion-client";
import {
	createNotionPage,
	getNotionPage,
	queryAllNotionDataSourcePages,
	queryNotionDataSource,
	updateNotionPage,
} from "../../shared/notion/notion-client";
import {
	checkboxProperty,
	multiSelectByIdProperty,
	relationProperty,
	richTextProperty,
	selectByIdProperty,
	statusByIdProperty,
	titleProperty,
	type NotionPageProperties,
} from "../../shared/notion/notion-properties";
import {
	pageBelongsToDataSource,
	type NotionPageWithParent,
} from "../../shared/notion/notion-page-ownership";
import {
	getDataSourceProperties,
	validateOptionId,
} from "../../shared/notion/notion-schema";
import {
	enrichJira,
	enrichJiras,
	type EnrichedJira,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import type { PaginationParams } from "../../shared/pagination/pagination";
import { sprintAllocationFilters } from "../sprint-allocations/sprint-allocation.filters";
import { listAllSprintAllocations } from "../sprint-allocations/sprint-allocation.service";
import { listAllWorkLogs } from "../work-logs/work-log.service";
import { workLogFilters } from "../work-logs/work-log.filters";
import { listAllReleaseItems } from "../releases/release.service";
import { releaseFilters } from "../releases/release.filters";
import { sprintFilters } from "../sprints/sprint.filters";
import {
	buildSprintHistory,
	deriveSpillEvents,
	type JiraDetail,
} from "./jira.history";
import { jiraFilters } from "./jira.filters";
import { mapJira, type Jira, type NotionJiraPage } from "./jira.mapper";
import { mapJiraOption, type JiraOption } from "./jira-option.mapper";
import { normalizeJiraKey } from "./jira.validation";
import { buildJiraRelationships, type JiraRelationship } from "./jira.relationships";
import { htmlToMarkdown } from "./jira.markdown";

export interface JiraListResponse<TJira = Jira> {
	data: TJira[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export class JiraNotFoundError extends Error {
	constructor(jiraKey: string) {
		super(`JIRA not found: ${jiraKey}`);
		this.name = "JiraNotFoundError";
	}
}

export class DuplicateJiraKeyError extends Error {
	constructor(jiraKey: string, count: number) {
		super(`Expected one JIRA for key ${jiraKey}, found ${count}`);
		this.name = "DuplicateJiraKeyError";
	}
}

export class JiraWriteValidationError extends Error {
	constructor(readonly response: Response) {
		super("Invalid JIRA write request");
		this.name = "JiraWriteValidationError";
	}
}

export class JiraAlreadyExistsError extends Error {
	constructor() {
		super("JIRA already exists");
		this.name = "JiraAlreadyExistsError";
	}
}

export class ActiveSprintConfigurationError extends Error {
	constructor(readonly reason: "none" | "multiple") {
		super(
			reason === "none"
				? "No active Sprint is configured"
				: "Multiple active Sprints are configured",
		);
		this.name = "ActiveSprintConfigurationError";
	}
}

const JIRA_WRITE_FIELDS = new Set([
	"jiraKey",
	"summary",
	"projectId",
	"statusOptionId",
	"inActiveSprint",
	"tagOptionIds",
	"demoRequired",
	"appraisal",
]);

const JIRA_UPDATE_FIELDS = new Set([
	"summary", "descriptionMarkdown", "descriptionRichTextHtml", "projectId",
	"statusOptionId", "tagOptionIds", "appraisal", "demoRequired", "demoedDate",
	"demoNotes", "linkedJiraId", "linkTypeOptionId", "linkReason", "linkedOn", "resolvedOn",
]);

interface JiraCreateInput {
	jiraKey: string;
	summary: string;
	projectId: string | null;
	statusOptionId: string | null;
	inActiveSprint: boolean;
	tagOptionIds: string[];
	demoRequired: boolean;
	appraisal: boolean;
}

export async function listJiras(
	env: Env,
	filter?: NotionQueryFilter,
	options: IncludeRelationsOption & { pagination?: PaginationParams } = {},
): Promise<JiraListResponse<Jira | EnrichedJira>> {
	const notion = await queryNotionDataSource<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
		filter,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapJira);
	const responseData = options.includeRelations ? await enrichJiras(env, data) : data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

export async function createJira(
	env: Env,
	body: Record<string, unknown>,
): Promise<Jira> {
	const input = parseJiraCreateInput(body);
	const duplicate = await queryNotionDataSource<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
		filter: jiraFilters.byKey(input.jiraKey),
		pageSize: 1,
	});

	if (duplicate.results.length > 0) {
		throw new JiraAlreadyExistsError();
	}

	const schema = await getDataSourceProperties(env, env.JIRAS_DATA_SOURCE_ID);

	if (
		input.statusOptionId &&
		!validateOptionId(schema, "Status", input.statusOptionId)
	) {
		throw new JiraWriteValidationError(invalidOption("statusOptionId"));
	}

	for (const tagOptionId of input.tagOptionIds) {
		if (!validateOptionId(schema, "Tags", tagOptionId)) {
			throw new JiraWriteValidationError(invalidOption("tagOptionIds"));
		}
	}

	if (input.projectId) {
		let project: NotionPageWithParent;

		try {
			project = await getNotionPage<NotionPageWithParent>({
				env,
				pageId: input.projectId,
			});
		} catch (error) {
			if (error instanceof NotionQueryError && error.status === 404) {
				throw new JiraWriteValidationError(
					invalidRequest("Expected a Project page", "projectId"),
				);
			}

			throw error;
		}

		if (!pageBelongsToDataSource(project, env.PROJECTS_DATA_SOURCE_ID)) {
			throw new JiraWriteValidationError(
				invalidRequest("Expected a Project page", "projectId"),
			);
		}
	}

	const activeSprintId = input.inActiveSprint
		? await getSingleActiveSprintId(env)
		: null;
	const properties: NotionPageProperties = {
		"JIRA Key": titleProperty(input.jiraKey),
		Summary: richTextProperty(input.summary),
		Project: relationProperty(input.projectId ? [input.projectId] : []),
		Status: statusByIdProperty(input.statusOptionId),
		Sprints: relationProperty(activeSprintId ? [activeSprintId] : []),
		Tags: multiSelectByIdProperty(input.tagOptionIds),
		"Demo Required": checkboxProperty(input.demoRequired),
		Appraisal: checkboxProperty(input.appraisal),
	};
	const page = await createNotionPage<NotionJiraPage>({
		env,
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		properties,
	});

	return mapJira(page);
}

function parseJiraCreateInput(body: Record<string, unknown>): JiraCreateInput {
	const disallowed = ensureAllowedFields(body, JIRA_WRITE_FIELDS);
	if (disallowed) throw new JiraWriteValidationError(disallowed);

	const rawJiraKey = parseStringValue(body.jiraKey, "jiraKey");
	if (rawJiraKey instanceof Response) throw new JiraWriteValidationError(rawJiraKey);
	const jiraKey = rawJiraKey ? normalizeJiraKey(rawJiraKey) : null;
	if (!jiraKey) {
		throw new JiraWriteValidationError(
			invalidRequest("Expected a valid JIRA key", "jiraKey"),
		);
	}

	const summary = parseStringValue(body.summary, "summary");
	if (summary instanceof Response) throw new JiraWriteValidationError(summary);
	if (!summary) {
		throw new JiraWriteValidationError(
			invalidRequest("Expected a non-empty string", "summary"),
		);
	}

	const projectId = parseNotionIdValue(body.projectId, "projectId");
	if (projectId instanceof Response) throw new JiraWriteValidationError(projectId);

	const statusOptionId = parseOptionIdValue(
		body.statusOptionId,
		"statusOptionId",
	);
	if (statusOptionId instanceof Response) {
		throw new JiraWriteValidationError(statusOptionId);
	}

	const tagOptionIds = parseStringArrayValue(body.tagOptionIds, "tagOptionIds");
	if (tagOptionIds instanceof Response) throw new JiraWriteValidationError(tagOptionIds);

	const inActiveSprint = parseBooleanValue(body.inActiveSprint, "inActiveSprint");
	if (inActiveSprint instanceof Response) {
		throw new JiraWriteValidationError(inActiveSprint);
	}

	const demoRequired = parseBooleanValue(body.demoRequired, "demoRequired");
	if (demoRequired instanceof Response) {
		throw new JiraWriteValidationError(demoRequired);
	}

	const appraisal = parseBooleanValue(body.appraisal, "appraisal");
	if (appraisal instanceof Response) throw new JiraWriteValidationError(appraisal);

	return {
		jiraKey,
		summary,
		projectId: projectId ?? null,
		statusOptionId: statusOptionId ?? null,
		inActiveSprint: inActiveSprint ?? false,
		tagOptionIds: [...new Set(tagOptionIds ?? [])],
		demoRequired: demoRequired ?? false,
		appraisal: appraisal ?? false,
	};
}

async function getSingleActiveSprintId(env: Env): Promise<string> {
	const activeSprints = await queryNotionDataSource<{ id: string }>({
		dataSourceId: env.SPRINTS_DATA_SOURCE_ID,
		env,
		filter: sprintFilters.active,
		pageSize: 2,
	});

	if (activeSprints.results.length === 0) {
		throw new ActiveSprintConfigurationError("none");
	}

	if (activeSprints.results.length > 1 || activeSprints.has_more) {
		throw new ActiveSprintConfigurationError("multiple");
	}

	return activeSprints.results[0].id;
}

const jiraOptionSorts = [
	{
		property: "JIRA Key",
		direction: "ascending",
	},
] satisfies Array<{ property: string; direction: "ascending" | "descending" }>;

export async function listJiraOptions(
	env: Env,
	filter: NotionQueryFilter,
	pagination: PaginationParams,
): Promise<JiraListResponse<JiraOption>> {
	const notion = await queryNotionDataSource<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
		filter,
		sorts: jiraOptionSorts,
		pageSize: pagination.pageSize,
		startCursor: pagination.cursor,
	});
	const data = notion.results.map(mapJira).map(mapJiraOption);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

async function enrichJiraDetail(env: Env, jira: Jira): Promise<JiraDetail> {
	const [enriched, allocations, relationships, workLogs, releaseItems] = await Promise.all([
		enrichJira(env, jira),
		listAllSprintAllocations(env, sprintAllocationFilters.jira(jira.id)),
		buildJiraRelationships(env, jira),
		listAllWorkLogs(env, workLogFilters.jira(jira.id)),
		listAllReleaseItems(env, releaseFilters.jira(jira.id)),
	]);
	const sprintHistory = buildSprintHistory(enriched.sprints, allocations);
	const spillEvents = deriveSpillEvents(sprintHistory);
	const timeline = enriched.sprints.reduce(
		(result, sprint) => ({
			startedDate: sprint.startDate && (!result.startedDate || sprint.startDate < result.startedDate) ? sprint.startDate : result.startedDate,
			endedDate: sprint.endDate && (!result.endedDate || sprint.endDate > result.endedDate) ? sprint.endDate : result.endedDate,
		}),
		{ startedDate: null as string | null, endedDate: null as string | null },
	);
	workLogs.sort((a, b) => (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31") || a.createdTime.localeCompare(b.createdTime) || a.id.localeCompare(b.id));
	releaseItems.sort((a, b) => (a.confirmedReleaseDate ?? a.formalAnnouncedDate ?? a.createdTime).localeCompare(b.confirmedReleaseDate ?? b.formalAnnouncedDate ?? b.createdTime) || a.id.localeCompare(b.id));

	return {
		...enriched,
		relationships,
		sprintHistory,
		spillEvents,
		latestSpill: spillEvents[spillEvents.length - 1] ?? null,
		spillHistoryConsistent: spillEvents.length === jira.spilloverCount,
		timeline,
		workLogs,
		workLogCount: workLogs.length,
		releaseItems,
		releaseItemCount: releaseItems.length,
	};
}

async function validateRelatedPage(env: Env, pageId: string, dataSourceId: string, field: string): Promise<void> {
	try {
		const page = await getNotionPage<NotionPageWithParent>({ env, pageId });
		if (!pageBelongsToDataSource(page, dataSourceId)) throw new Error("wrong source");
	} catch (error) {
		if (error instanceof JiraWriteValidationError) throw error;
		throw new JiraWriteValidationError(invalidRequest(`Expected a ${field === "projectId" ? "Project" : "JIRA"} page`, field));
	}
}

export async function updateJira(env: Env, jiraKey: string, body: Record<string, unknown>): Promise<JiraDetail> {
	const disallowed = ensureAllowedFields(body, JIRA_UPDATE_FIELDS);
	if (disallowed) throw new JiraWriteValidationError(disallowed);
	if (body.descriptionMarkdown !== undefined && body.descriptionRichTextHtml !== undefined) throw new JiraWriteValidationError(invalidRequest("Provide only one description representation", "descriptionMarkdown"));
	const current = await getJiraByKey(env, jiraKey);
	if (!("id" in current)) throw new Error("Unexpected JIRA response");
	const properties: NotionPageProperties = {};
	const schema = await getDataSourceProperties(env, env.JIRAS_DATA_SOURCE_ID);
	const summary = parseStringValue(body.summary, "summary"); if (summary instanceof Response) throw new JiraWriteValidationError(summary); if (summary !== undefined) { if (!summary) throw new JiraWriteValidationError(invalidRequest("Expected a non-empty string", "summary")); properties.Summary = richTextProperty(summary); }
	const markdown = body.descriptionMarkdown !== undefined ? parseStringValue(body.descriptionMarkdown, "descriptionMarkdown") : body.descriptionRichTextHtml !== undefined ? parseStringValue(body.descriptionRichTextHtml, "descriptionRichTextHtml") : undefined;
	if (markdown instanceof Response) throw new JiraWriteValidationError(markdown);
	if (markdown !== undefined) properties.Description = richTextProperty(body.descriptionRichTextHtml !== undefined && markdown !== null ? htmlToMarkdown(markdown) : markdown ?? "");
	const projectId = parseNotionIdValue(body.projectId, "projectId"); if (projectId instanceof Response) throw new JiraWriteValidationError(projectId); if (projectId !== undefined) { if (projectId) await validateRelatedPage(env, projectId, env.PROJECTS_DATA_SOURCE_ID, "projectId"); properties.Project = relationProperty(projectId ? [projectId] : []); }
	const linkedJiraId = parseNotionIdValue(body.linkedJiraId, "linkedJiraId"); if (linkedJiraId instanceof Response) throw new JiraWriteValidationError(linkedJiraId); if (linkedJiraId !== undefined) { if (linkedJiraId === current.id) throw new JiraWriteValidationError(invalidRequest("A JIRA cannot link to itself", "linkedJiraId")); if (linkedJiraId) await validateRelatedPage(env, linkedJiraId, env.JIRAS_DATA_SOURCE_ID, "linkedJiraId"); properties["Linked JIRA"] = relationProperty(linkedJiraId ? [linkedJiraId] : []); }
	for (const [field, property, writer] of [["statusOptionId", "Status", statusByIdProperty], ["linkTypeOptionId", "Link Type", selectByIdProperty]] as const) { const value = parseOptionIdValue(body[field], field); if (value instanceof Response) throw new JiraWriteValidationError(value); if (value !== undefined) { if (value && !validateOptionId(schema, property, value)) throw new JiraWriteValidationError(invalidOption(field)); properties[property] = writer(value); } }
	const tags = parseStringArrayValue(body.tagOptionIds, "tagOptionIds"); if (tags instanceof Response) throw new JiraWriteValidationError(tags); if (tags !== undefined) { const ids = [...new Set(tags)]; if (ids.some((id) => !validateOptionId(schema, "Tags", id))) throw new JiraWriteValidationError(invalidOption("tagOptionIds")); properties.Tags = multiSelectByIdProperty(ids); }
	for (const [field, property] of [["appraisal", "Appraisal"], ["demoRequired", "Demo Required"]] as const) { const value = parseBooleanValue(body[field], field); if (value instanceof Response) throw new JiraWriteValidationError(value); if (value !== undefined) properties[property] = checkboxProperty(value); }
	for (const [field, property] of [["demoedDate", "Demoed Date"], ["linkedOn", "Linked On"], ["resolvedOn", "Resolved On"]] as const) { const value = parseDateValue(body[field], field); if (value instanceof Response) throw new JiraWriteValidationError(value); if (value !== undefined) properties[property] = { date: value ? { start: value } : null }; }
	for (const [field, property] of [["demoNotes", "Demo Notes"], ["linkReason", "Link Reason"]] as const) { const value = parseStringValue(body[field], field); if (value instanceof Response) throw new JiraWriteValidationError(value); if (value !== undefined) properties[property] = richTextProperty(value ?? ""); }
	await updateNotionPage({ env, pageId: current.id, properties });
	return getJiraByKey(env, jiraKey, { includeRelations: true }) as Promise<JiraDetail>;
}

export async function getJiraByKey(
	env: Env,
	jiraKey: string,
	options: IncludeRelationsOption = {},
): Promise<Jira | EnrichedJira | JiraDetail> {
	const result = await listJiras(env, jiraFilters.byKey(jiraKey));

	if (result.data.length === 0) {
		throw new JiraNotFoundError(jiraKey);
	}

	if (result.data.length > 1) {
		throw new DuplicateJiraKeyError(jiraKey, result.data.length);
	}

	return options.includeRelations
		? enrichJiraDetail(env, result.data[0] as Jira)
		: result.data[0];
}

export async function listAllJiras(
	env: Env,
	filter?: NotionQueryFilter,
): Promise<Jira[]> {
	const pages = await queryAllNotionDataSourcePages<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
		filter,
	});

	return pages.map(mapJira);
}

export async function listJiraIdsByProjects(
	env: Env,
	projectIds: string[],
): Promise<string[]> {
	const filter = jiraFilters.projects(projectIds);

	if (!filter) {
		return [];
	}

	const pages = await queryAllNotionDataSourcePages<NotionJiraPage>({
		dataSourceId: env.JIRAS_DATA_SOURCE_ID,
		env,
		filter,
	});

	return pages.map((page) => page.id);
}
