import type { Env } from "../env";

export const NOTION_VERSION = "2026-03-11";

export interface NotionQueryFilter {
	[key: string]: unknown;
}

export interface NotionQuerySort {
	property: string;
	direction: "ascending" | "descending";
}

export interface NotionDataSourceQueryResponse<TPage = unknown> {
	results: TPage[];
	has_more: boolean;
	next_cursor: string | null;
}

export interface QueryDataSourceOptions {
	dataSourceId: string;
	env: Env;
	filter?: NotionQueryFilter;
	sorts?: NotionQuerySort[];
	startCursor?: string;
	pageSize?: number;
}

export interface GetNotionPageOptions {
	pageId: string;
	env: Env;
}

export interface GetNotionDataSourceOptions {
	dataSourceId: string;
	env: Env;
}

export interface NotionMutationOptions {
	env: Env;
	properties: Record<string, unknown>;
}

export interface CreateNotionPageOptions extends NotionMutationOptions {
	dataSourceId?: string;
	parentPageId?: string;
	markdown?: string;
	allowAsync?: boolean;
}

export interface UpdateNotionPageOptions extends NotionMutationOptions {
	pageId: string;
}

export interface TrashNotionPageOptions {
	pageId: string;
	env: Env;
}

export interface RetrieveNotionMarkdownOptions {
	pageId: string;
	env: Env;
}

export interface UpdateNotionMarkdownOptions extends RetrieveNotionMarkdownOptions {
	markdown: string;
	allowAsync?: boolean;
}

export interface ListNotionBlockChildrenOptions {
	blockId: string;
	env: Env;
	startCursor?: string;
	pageSize?: number;
}

export interface RetrieveNotionAsyncTaskOptions {
	taskId: string;
	env: Env;
}

export class NotionQueryError extends Error {
	constructor(
		readonly status: number,
		readonly responseText: string,
	) {
		super(`Notion API ${status}`);
		this.name = "NotionQueryError";
	}
}

function notionJsonHeaders(env: Env): HeadersInit {
	return {
		Authorization: `Bearer ${env.NOTION_TOKEN}`,
		"Notion-Version": NOTION_VERSION,
		"Content-Type": "application/json",
	};
}

async function parseNotionResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const error = await response.text();

		throw new NotionQueryError(response.status, error);
	}

	return response.json();
}

export async function queryNotionDataSource<TPage = unknown>({
	dataSourceId,
	env,
	filter,
	sorts,
	startCursor,
	pageSize = 100,
}: QueryDataSourceOptions): Promise<NotionDataSourceQueryResponse<TPage>> {
	const body: Record<string, unknown> = {
		page_size: pageSize,
	};

	if (filter) {
		body.filter = filter;
	}

	if (sorts?.length) {
		body.sorts = sorts;
	}

	if (startCursor) {
		body.start_cursor = startCursor;
	}

	const response = await fetch(
		`https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
		{
			method: "POST",
			headers: notionJsonHeaders(env),
			body: JSON.stringify(body),
		},
	);

	return parseNotionResponse(response);
}

export async function getNotionPage<TPage = unknown>({
	pageId,
	env,
}: GetNotionPageOptions): Promise<TPage> {
	const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
		method: "GET",
		headers: notionJsonHeaders(env),
	});

	return parseNotionResponse(response);
}

export async function getNotionDataSource<TDataSource = unknown>({
	dataSourceId,
	env,
}: GetNotionDataSourceOptions): Promise<TDataSource> {
	const response = await fetch(
		`https://api.notion.com/v1/data_sources/${dataSourceId}`,
		{
			method: "GET",
			headers: notionJsonHeaders(env),
		},
	);

	return parseNotionResponse(response);
}

export async function createNotionPage<TPage = unknown>({
	dataSourceId,
	parentPageId,
	env,
	properties,
	markdown,
	allowAsync,
}: CreateNotionPageOptions): Promise<TPage> {
	if (!dataSourceId && !parentPageId) {
		throw new Error("Notion page creation requires a parent");
	}

	const response = await fetch("https://api.notion.com/v1/pages", {
		method: "POST",
		headers: notionJsonHeaders(env),
		body: JSON.stringify({
			parent: dataSourceId
				? {
						data_source_id: dataSourceId,
					}
				: {
						page_id: parentPageId,
					},
			properties,
			...(markdown !== undefined ? { markdown } : {}),
			...(allowAsync ? { allow_async: true } : {}),
		}),
	});

	return parseNotionResponse(response);
}

export async function updateNotionPage<TPage = unknown>({
	pageId,
	env,
	properties,
}: UpdateNotionPageOptions): Promise<TPage> {
	const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
		method: "PATCH",
		headers: notionJsonHeaders(env),
		body: JSON.stringify({
			properties,
		}),
	});

	return parseNotionResponse(response);
}

export async function trashNotionPage<TPage = unknown>({
	pageId,
	env,
}: TrashNotionPageOptions): Promise<TPage> {
	const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
		method: "PATCH",
		headers: notionJsonHeaders(env),
		body: JSON.stringify({
			in_trash: true,
		}),
	});

	return parseNotionResponse(response);
}

export async function retrieveNotionMarkdown<TMarkdown = unknown>({
	pageId,
	env,
}: RetrieveNotionMarkdownOptions): Promise<TMarkdown> {
	const response = await fetch(
		`https://api.notion.com/v1/pages/${pageId}/markdown`,
		{
			method: "GET",
			headers: notionJsonHeaders(env),
		},
	);

	return parseNotionResponse(response);
}

export async function updateNotionMarkdown<TMarkdown = unknown>({
	pageId,
	env,
	markdown,
	allowAsync,
}: UpdateNotionMarkdownOptions): Promise<TMarkdown> {
	const response = await fetch(
		`https://api.notion.com/v1/pages/${pageId}/markdown`,
		{
			method: "PATCH",
			headers: notionJsonHeaders(env),
			body: JSON.stringify({
				type: "replace_content",
				replace_content: {
					new_str: markdown,
				},
				...(allowAsync ? { allow_async: true } : {}),
			}),
		},
	);

	return parseNotionResponse(response);
}

export async function listNotionBlockChildren<TResponse = unknown>({
	blockId,
	env,
	startCursor,
	pageSize = 100,
}: ListNotionBlockChildrenOptions): Promise<TResponse> {
	const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
	url.searchParams.set("page_size", String(pageSize));

	if (startCursor) {
		url.searchParams.set("start_cursor", startCursor);
	}

	const response = await fetch(url.toString(), {
		method: "GET",
		headers: notionJsonHeaders(env),
	});

	return parseNotionResponse(response);
}

export async function retrieveNotionAsyncTask<TTask = unknown>({
	taskId,
	env,
}: RetrieveNotionAsyncTaskOptions): Promise<TTask> {
	const response = await fetch(`https://api.notion.com/v1/async_tasks/${taskId}`, {
		method: "GET",
		headers: notionJsonHeaders(env),
	});

	return parseNotionResponse(response);
}

export async function queryAllNotionDataSourcePages<TPage = unknown>(
	options: Omit<QueryDataSourceOptions, "startCursor">,
): Promise<TPage[]> {
	const results: TPage[] = [];
	let startCursor: string | undefined;

	do {
		const response = await queryNotionDataSource<TPage>({
			...options,
			startCursor,
		});

		results.push(...response.results);
		startCursor = response.next_cursor ?? undefined;

		if (!response.has_more) {
			break;
		}
	} while (startCursor);

	return results;
}
