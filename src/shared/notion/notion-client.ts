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

interface QueryDataSourceOptions {
	dataSourceId: string;
	env: Env;
	filter?: NotionQueryFilter;
	sorts?: NotionQuerySort[];
	startCursor?: string;
	pageSize?: number;
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
			headers: {
				Authorization: `Bearer ${env.NOTION_TOKEN}`,
				"Notion-Version": NOTION_VERSION,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		},
	);

	if (!response.ok) {
		const error = await response.text();

		throw new Error(`Notion API ${response.status}: ${error}`);
	}

	return response.json();
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
