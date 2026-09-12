import type { Env } from "../../shared/env";
import type { BulkDeleteResponse } from "../../shared/http/bulk-delete";
import {
	ensureAllowedFields,
	invalidOption,
	invalidRequest,
	parseDateValue,
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
	richTextProperty,
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
import { mapTodo, type NotionTodoPage, type Todo } from "./todo.mapper";

export interface TodoListResponse {
	data: Todo[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export class TodoWriteValidationError extends Error {
	constructor(readonly response: Response) {
		super("Invalid Todo write request");
		this.name = "TodoWriteValidationError";
	}
}

export class TodoNotWritableError extends Error {
	constructor() {
		super("Todo page is not writable through this endpoint");
		this.name = "TodoNotWritableError";
	}
}

const TODO_WRITE_FIELDS = new Set([
	"toDo",
	"statusOptionId",
	"dueDate",
	"notes",
]);

const todoDefaultSorts: NotionQuerySort[] = [
	{ property: "Due Date", direction: "ascending" },
];

export async function listTodos(
	env: Env,
	filter?: NotionQueryFilter,
	pagination?: PaginationParams,
): Promise<TodoListResponse> {
	const notion = await queryNotionDataSource<NotionTodoPage>({
		dataSourceId: env.TODOS_DATA_SOURCE_ID,
		env,
		filter,
		sorts: todoDefaultSorts,
		pageSize: pagination?.pageSize,
		startCursor: pagination?.cursor,
	});
	const data = notion.results.map(mapTodo);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

export async function createTodo(env: Env, body: Record<string, unknown>): Promise<Todo> {
	const properties = await buildTodoProperties(env, body, true);
	const page = await createNotionPage<NotionTodoPage>({
		env,
		dataSourceId: env.TODOS_DATA_SOURCE_ID,
		properties,
	});

	return mapTodo(page);
}

export async function updateTodo(
	env: Env,
	pageId: string,
	body: Record<string, unknown>,
): Promise<Todo> {
	const page = await getNotionPage<NotionTodoPage & NotionPageWithParent>({ env, pageId });

	if (!pageBelongsToDataSource(page, env.TODOS_DATA_SOURCE_ID)) {
		throw new TodoNotWritableError();
	}

	const properties = await buildTodoProperties(env, body, false);
	const updated = await updateNotionPage<NotionTodoPage>({ env, pageId, properties });

	return mapTodo(updated);
}

export async function deleteTodo(env: Env, pageId: string): Promise<{ id: string; deleted: true }> {
	const page = await getNotionPage<NotionTodoPage & NotionPageWithParent>({ env, pageId });

	if (!pageBelongsToDataSource(page, env.TODOS_DATA_SOURCE_ID)) {
		throw new TodoNotWritableError();
	}

	await trashNotionPage({ env, pageId });

	return { id: pageId, deleted: true };
}

export async function bulkDeleteTodos(
	env: Env,
	pageIds: string[],
): Promise<BulkDeleteResponse> {
	for (const pageId of pageIds) {
		const page = await getNotionPage<NotionTodoPage & NotionPageWithParent>({ env, pageId });

		if (!pageBelongsToDataSource(page, env.TODOS_DATA_SOURCE_ID)) {
			throw new TodoNotWritableError();
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

	return {
		requested: pageIds.length,
		deleted,
		failed,
		allSucceeded: failed.length === 0,
	};
}

async function buildTodoProperties(
	env: Env,
	body: Record<string, unknown>,
	requireTitle: boolean,
): Promise<NotionPageProperties> {
	const disallowed = ensureAllowedFields(body, TODO_WRITE_FIELDS);
	if (disallowed) throw new TodoWriteValidationError(disallowed);

	const schema = await getDataSourceProperties(env, env.TODOS_DATA_SOURCE_ID);
	const properties: NotionPageProperties = {};

	const toDo = parseStringValue(body.toDo, "toDo");
	if (toDo instanceof Response) throw new TodoWriteValidationError(toDo);
	if (requireTitle && !toDo) {
		throw new TodoWriteValidationError(invalidRequest("Expected a non-empty string", "toDo"));
	}
	if (toDo !== undefined && toDo !== null) properties["To Do"] = titleProperty(toDo);

	const status = parseOptionIdValue(body.statusOptionId, "statusOptionId");
	if (status instanceof Response) throw new TodoWriteValidationError(status);
	if (status !== undefined) {
		if (status && !validateOptionId(schema, "Status", status)) {
			throw new TodoWriteValidationError(invalidOption("statusOptionId"));
		}
		properties.Status = statusByIdProperty(status);
	}

	const dueDate = parseDateValue(body.dueDate, "dueDate");
	if (dueDate instanceof Response) throw new TodoWriteValidationError(dueDate);
	if (dueDate !== undefined) properties["Due Date"] = dateProperty(dueDate);

	const notes = parseStringValue(body.notes, "notes");
	if (notes instanceof Response) throw new TodoWriteValidationError(notes);
	if (notes !== undefined && notes !== null) properties.Notes = richTextProperty(notes);

	return properties;
}
