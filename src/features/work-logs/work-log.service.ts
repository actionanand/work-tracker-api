import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import {
	createNotionPage,
	getNotionPage,
	queryNotionDataSource,
	updateNotionPage,
} from "../../shared/notion/notion-client";
import {
	checkboxProperty,
	dateProperty,
	relationProperty,
	richTextProperty,
	selectByIdProperty,
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
	enrichWorkLogs,
	type EnrichedWorkLog,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import type { PaginationParams } from "../../shared/pagination/pagination";
import {
	ensureAllowedFields,
	invalidOption,
	parseBooleanValue,
	parseDateValue,
	parseNotionIdArrayValue,
	parseNotionIdValue,
	parseOptionIdValue,
	parseStringValue,
} from "../../shared/http/validation";
import { mapWorkLog, type NotionWorkLogPage, type WorkLog } from "./work-log.mapper";

export interface WorkLogListResponse<TWorkLog = WorkLog> {
	data: TWorkLog[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export class WorkLogWriteValidationError extends Error {
	constructor(readonly response: Response) {
		super("Invalid Work Log write request");
		this.name = "WorkLogWriteValidationError";
	}
}

export class WorkLogNotWritableError extends Error {
	constructor() {
		super("Work Log page is not writable through this endpoint");
		this.name = "WorkLogNotWritableError";
	}
}

export const workLogDefaultSorts: NotionQuerySort[] = [
	{
		property: "Date",
		direction: "descending",
	},
];

export async function listWorkLogs(
	env: Env,
	filter?: NotionQueryFilter,
	options: IncludeRelationsOption & { pagination?: PaginationParams } = {},
): Promise<WorkLogListResponse<WorkLog | EnrichedWorkLog>> {
	const notion = await queryNotionDataSource<NotionWorkLogPage>({
		dataSourceId: env.WORK_LOGS_DATA_SOURCE_ID,
		env,
		filter,
		sorts: workLogDefaultSorts,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapWorkLog);
	const responseData = options.includeRelations
		? await enrichWorkLogs(env, data)
		: data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

const WORK_LOG_WRITE_FIELDS = new Set([
	"update",
	"date",
	"categoryOptionId",
	"typeOptionId",
	"workModeOptionId",
	"projectId",
	"jiraIds",
	"comment",
	"wentWrong",
	"appraisal",
]);

export async function createWorkLog(
	env: Env,
	body: Record<string, unknown>,
): Promise<WorkLog> {
	const properties = await buildWorkLogProperties(env, body);
	const page = await createNotionPage<NotionWorkLogPage>({
		env,
		dataSourceId: env.WORK_LOGS_DATA_SOURCE_ID,
		properties,
	});

	return mapWorkLog(page);
}

export async function updateWorkLog(
	env: Env,
	pageId: string,
	body: Record<string, unknown>,
): Promise<WorkLog> {
	const page = await getNotionPage<NotionWorkLogPage & NotionPageWithParent>({
		env,
		pageId,
	});

	if (!pageBelongsToDataSource(page, env.WORK_LOGS_DATA_SOURCE_ID)) {
		throw new WorkLogNotWritableError();
	}

	const properties = await buildWorkLogProperties(env, body);
	const updated = await updateNotionPage<NotionWorkLogPage>({
		env,
		pageId,
		properties,
	});

	return mapWorkLog(updated);
}

async function buildWorkLogProperties(
	env: Env,
	body: Record<string, unknown>,
): Promise<NotionPageProperties> {
	const disallowed = ensureAllowedFields(body, WORK_LOG_WRITE_FIELDS);

	if (disallowed) {
		throw new WorkLogWriteValidationError(disallowed);
	}

	const schema = await getDataSourceProperties(env, env.WORK_LOGS_DATA_SOURCE_ID);
	const properties: NotionPageProperties = {};

	const update = parseStringValue(body.update, "update");
	if (update instanceof Response) throw new WorkLogWriteValidationError(update);
	if (update !== undefined && update !== null) properties.Update = titleProperty(update);

	const date = parseDateValue(body.date, "date");
	if (date instanceof Response) throw new WorkLogWriteValidationError(date);
	if (date !== undefined) properties.Date = dateProperty(date);

	const category = parseOptionIdValue(body.categoryOptionId, "categoryOptionId");
	if (category instanceof Response) throw new WorkLogWriteValidationError(category);
	if (category !== undefined) {
		if (category && !validateOptionId(schema, "Category", category)) {
			throw new WorkLogWriteValidationError(invalidOption("categoryOptionId"));
		}
		properties.Category = selectByIdProperty(category);
	}

	const type = parseOptionIdValue(body.typeOptionId, "typeOptionId");
	if (type instanceof Response) throw new WorkLogWriteValidationError(type);
	if (type !== undefined) {
		if (type && !validateOptionId(schema, "Type", type)) {
			throw new WorkLogWriteValidationError(invalidOption("typeOptionId"));
		}
		properties.Type = selectByIdProperty(type);
	}

	const workMode = parseOptionIdValue(body.workModeOptionId, "workModeOptionId");
	if (workMode instanceof Response) throw new WorkLogWriteValidationError(workMode);
	if (workMode !== undefined) {
		if (workMode && !validateOptionId(schema, "Work Mode", workMode)) {
			throw new WorkLogWriteValidationError(invalidOption("workModeOptionId"));
		}
		properties["Work Mode"] = selectByIdProperty(workMode);
	}

	const projectId = parseNotionIdValue(body.projectId, "projectId");
	if (projectId instanceof Response) throw new WorkLogWriteValidationError(projectId);
	if (projectId !== undefined) properties.Project = relationProperty(projectId ? [projectId] : []);

	const jiraIds = parseNotionIdArrayValue(body.jiraIds, "jiraIds");
	if (jiraIds instanceof Response) throw new WorkLogWriteValidationError(jiraIds);
	if (jiraIds !== undefined) properties.JIRAs = relationProperty(jiraIds);

	const comment = parseStringValue(body.comment, "comment");
	if (comment instanceof Response) throw new WorkLogWriteValidationError(comment);
	if (comment !== undefined && comment !== null) properties.Comment = richTextProperty(comment);

	const wentWrong = parseStringValue(body.wentWrong, "wentWrong");
	if (wentWrong instanceof Response) throw new WorkLogWriteValidationError(wentWrong);
	if (wentWrong !== undefined && wentWrong !== null) properties["Went Wrong"] = richTextProperty(wentWrong);

	const appraisal = parseBooleanValue(body.appraisal, "appraisal");
	if (appraisal instanceof Response) throw new WorkLogWriteValidationError(appraisal);
	if (appraisal !== undefined) properties.Appraisal = checkboxProperty(appraisal);

	return properties;
}
