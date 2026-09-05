import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import {
	enrichFeedback,
	type EnrichedFeedback,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import type { PaginationParams } from "../../shared/pagination/pagination";
import {
	mapFeedback,
	type Feedback,
	type NotionFeedbackPage,
} from "./feedback.mapper";

export interface FeedbackListResponse<TFeedback = Feedback> {
	data: TFeedback[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export const feedbackDateSorts: NotionQuerySort[] = [
	{
		property: "Date",
		direction: "descending",
	},
];

export async function listFeedback(
	env: Env,
	filter?: NotionQueryFilter,
	options: IncludeRelationsOption & { pagination?: PaginationParams } = {},
): Promise<FeedbackListResponse<Feedback | EnrichedFeedback>> {
	const notion = await queryNotionDataSource<NotionFeedbackPage>({
		dataSourceId: env.FEEDBACK_DATA_SOURCE_ID,
		env,
		filter,
		sorts: feedbackDateSorts,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapFeedback);
	const responseData = options.includeRelations
		? await enrichFeedback(env, data)
		: data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
