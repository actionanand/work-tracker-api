import type { Env } from "../../shared/env";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import type { PaginationParams } from "../../shared/pagination/pagination";
import { mapCompany, type Company, type NotionCompanyPage } from "./company.mapper";

export interface CompanyListResponse {
	data: Company[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export async function listCompanies(
	env: Env,
	filter?: NotionQueryFilter,
	options: { pagination?: PaginationParams } = {},
): Promise<CompanyListResponse> {
	const notion = await queryNotionDataSource<NotionCompanyPage>({
		dataSourceId: env.COMPANIES_DATA_SOURCE_ID,
		env,
		filter,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapCompany);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
