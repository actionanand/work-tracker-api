import type { Env } from "../../shared/env";
import type { BulkDeleteResponse } from "../../shared/http/bulk-delete";
import {
	ensureAllowedFields,
	invalidOption,
	invalidRequest,
	parseDateValue,
	parseNotionIdArrayValue,
	parseNotionIdValue,
	parseOptionIdValue,
	parseStringValue,
} from "../../shared/http/validation";
import type { NotionQueryFilter, NotionQuerySort } from "../../shared/notion/notion-client";
import {
	createNotionPage,
	getNotionPage,
	queryNotionDataSource,
	trashNotionPage,
	updateNotionPage,
} from "../../shared/notion/notion-client";
import {
	dateProperty,
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
import { getDataSourceProperties, validateOptionId } from "../../shared/notion/notion-schema";
import type { PaginationParams } from "../../shared/pagination/pagination";
import {
	enrichTasks,
	type EnrichedTask,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import { mapTask, type NotionTaskPage, type Task } from "./task.mapper";

export interface TaskListResponse<TTask = Task> {
	data: TTask[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export class TaskWriteValidationError extends Error {
	constructor(readonly response: Response) {
		super("Invalid Task write request");
		this.name = "TaskWriteValidationError";
	}
}

export class TaskNotWritableError extends Error {
	constructor() {
		super("Task page is not writable through this endpoint");
		this.name = "TaskNotWritableError";
	}
}

const TASK_WRITE_FIELDS = new Set([
	"task",
	"statusOptionId",
	"priorityOptionId",
	"responsibilityOptionId",
	"requestedBy",
	"requestedByTypeOptionId",
	"assignedTo",
	"assignedToTypeOptionId",
	"dueDate",
	"followUpDate",
	"completedDate",
	"companyId",
	"jiraIds",
	"notes",
	"outcomeUpdate",
]);

const taskDefaultSorts: NotionQuerySort[] = [
	{ property: "Due Date", direction: "ascending" },
];

export async function listTasks(
	env: Env,
	filter?: NotionQueryFilter,
	options: IncludeRelationsOption & { pagination?: PaginationParams } = {},
): Promise<TaskListResponse<Task | EnrichedTask>> {
	const notion = await queryNotionDataSource<NotionTaskPage>({
		dataSourceId: env.TASKS_DATA_SOURCE_ID,
		env,
		filter,
		sorts: taskDefaultSorts,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});
	const data = notion.results.map(mapTask);
	const responseData = options.includeRelations ? await enrichTasks(env, data) : data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

export async function createTask(env: Env, body: Record<string, unknown>): Promise<Task> {
	const properties = await buildTaskProperties(env, body, true);
	const page = await createNotionPage<NotionTaskPage>({
		env,
		dataSourceId: env.TASKS_DATA_SOURCE_ID,
		properties,
	});

	return mapTask(page);
}

export async function updateTask(
	env: Env,
	pageId: string,
	body: Record<string, unknown>,
): Promise<Task> {
	const page = await getNotionPage<NotionTaskPage & NotionPageWithParent>({ env, pageId });

	if (!pageBelongsToDataSource(page, env.TASKS_DATA_SOURCE_ID)) {
		throw new TaskNotWritableError();
	}

	const properties = await buildTaskProperties(env, body, false);
	const updated = await updateNotionPage<NotionTaskPage>({ env, pageId, properties });

	return mapTask(updated);
}

export async function deleteTask(env: Env, pageId: string): Promise<{ id: string; deleted: true }> {
	const page = await getNotionPage<NotionTaskPage & NotionPageWithParent>({ env, pageId });

	if (!pageBelongsToDataSource(page, env.TASKS_DATA_SOURCE_ID)) {
		throw new TaskNotWritableError();
	}

	await trashNotionPage({ env, pageId });

	return { id: pageId, deleted: true };
}

export async function bulkDeleteTasks(
	env: Env,
	pageIds: string[],
): Promise<BulkDeleteResponse> {
	for (const pageId of pageIds) {
		const page = await getNotionPage<NotionTaskPage & NotionPageWithParent>({ env, pageId });

		if (!pageBelongsToDataSource(page, env.TASKS_DATA_SOURCE_ID)) {
			throw new TaskNotWritableError();
		}
	}

	const failed: BulkDeleteResponse["failed"] = [];

	for (const pageId of pageIds) {
		try {
			await trashNotionPage({ env, pageId });
		} catch {
			failed.push({ id: pageId, deleted: false, error: "Failed to delete page" });
		}
	}

	const deleted = pageIds.length - failed.length;

	return { requested: pageIds.length, deleted, failed, allSucceeded: failed.length === 0 };
}

async function buildTaskProperties(
	env: Env,
	body: Record<string, unknown>,
	requireTitle: boolean,
): Promise<NotionPageProperties> {
	const disallowed = ensureAllowedFields(body, TASK_WRITE_FIELDS);
	if (disallowed) throw new TaskWriteValidationError(disallowed);

	const schema = await getDataSourceProperties(env, env.TASKS_DATA_SOURCE_ID);
	const properties: NotionPageProperties = {};

	const task = parseStringValue(body.task, "task");
	if (task instanceof Response) throw new TaskWriteValidationError(task);
	if (requireTitle && !task) {
		throw new TaskWriteValidationError(invalidRequest("Expected a non-empty string", "task"));
	}
	if (task !== undefined && task !== null) properties.Task = titleProperty(task);

	const optionFields: Array<[unknown, string, string, (id: string | null) => unknown]> = [
		[body.statusOptionId, "statusOptionId", "Status", statusByIdProperty],
		[body.priorityOptionId, "priorityOptionId", "Priority", selectByIdProperty],
		[body.responsibilityOptionId, "responsibilityOptionId", "Responsibility", selectByIdProperty],
		[body.requestedByTypeOptionId, "requestedByTypeOptionId", "Requested By Type", selectByIdProperty],
		[body.assignedToTypeOptionId, "assignedToTypeOptionId", "Assigned To Type", selectByIdProperty],
	];

	for (const [value, field, property, builder] of optionFields) {
		const optionId = parseOptionIdValue(value, field);
		if (optionId instanceof Response) throw new TaskWriteValidationError(optionId);
		if (optionId !== undefined) {
			if (optionId && !validateOptionId(schema, property, optionId)) {
				throw new TaskWriteValidationError(invalidOption(field));
			}
			properties[property] = builder(optionId);
		}
	}

	const textFields: Array<[unknown, string, string]> = [
		[body.requestedBy, "requestedBy", "Requested By"],
		[body.assignedTo, "assignedTo", "Assigned To"],
		[body.notes, "notes", "Notes"],
		[body.outcomeUpdate, "outcomeUpdate", "Outcome / Update"],
	];

	for (const [value, field, property] of textFields) {
		const parsed = parseStringValue(value, field);
		if (parsed instanceof Response) throw new TaskWriteValidationError(parsed);
		if (parsed !== undefined && parsed !== null) properties[property] = richTextProperty(parsed);
	}

	const dateFields: Array<[unknown, string, string]> = [
		[body.dueDate, "dueDate", "Due Date"],
		[body.followUpDate, "followUpDate", "Follow-up Date"],
		[body.completedDate, "completedDate", "Completed Date"],
	];

	for (const [value, field, property] of dateFields) {
		const parsed = parseDateValue(value, field);
		if (parsed instanceof Response) throw new TaskWriteValidationError(parsed);
		if (parsed !== undefined) properties[property] = dateProperty(parsed);
	}

	const companyId = parseNotionIdValue(body.companyId, "companyId");
	if (companyId instanceof Response) throw new TaskWriteValidationError(companyId);
	if (companyId !== undefined) properties.Company = relationProperty(companyId ? [companyId] : []);

	const jiraIds = parseNotionIdArrayValue(body.jiraIds, "jiraIds");
	if (jiraIds instanceof Response) throw new TaskWriteValidationError(jiraIds);
	if (jiraIds !== undefined) properties.JIRAs = relationProperty(jiraIds);

	return properties;
}
