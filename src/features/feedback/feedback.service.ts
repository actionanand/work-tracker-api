import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { queryNotionDataSource } from "../../shared/notion/notion-client";
import {
	mapFeedback,
	type Feedback,
	type NotionFeedbackPage,
} from "./feedback.mapper";

export interface FeedbackListResponse {
	data: Feedback[];
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
): Promise<FeedbackListResponse> {
	const notion = await queryNotionDataSource<NotionFeedbackPage>({
		dataSourceId: env.FEEDBACK_DATA_SOURCE_ID,
		env,
		filter,
		sorts: feedbackDateSorts,
	});

	const data = notion.results.map(mapFeedback);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
