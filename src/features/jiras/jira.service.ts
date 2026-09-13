import type { Env } from "../../shared/env";
import {
	ensureAllowedFields,
	invalidOption,
	invalidRequest,
	parseBooleanValue,
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
} from "../../shared/notion/notion-client";
import {
	checkboxProperty,
	multiSelectByIdProperty,
	relationProperty,
	richTextProperty,
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
	const [enriched, allocations] = await Promise.all([
		enrichJira(env, jira),
		listAllSprintAllocations(env, sprintAllocationFilters.jira(jira.id)),
	]);
	const sprintHistory = buildSprintHistory(enriched.sprints, allocations);
	const spillEvents = deriveSpillEvents(
		sprintHistory,
		jira.spilloverCount,
		jira.spilloverReason,
	);

	return {
		...enriched,
		sprintHistory,
		spillEvents,
		latestSpill:
			spillEvents.find((event) => event.number === jira.spilloverCount) ?? null,
	};
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
