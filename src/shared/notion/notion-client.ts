import type { Env } from "../env";

export const NOTION_VERSION = "2026-03-11";

export interface NotionQueryFilter {
	[key: string]: unknown;
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
}

export async function queryNotionDataSource<TPage = unknown>({
	dataSourceId,
	env,
	filter,
}: QueryDataSourceOptions): Promise<NotionDataSourceQueryResponse<TPage>> {
	const body: Record<string, unknown> = {
		page_size: 100,
	};

	if (filter) {
		body.filter = filter;
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
