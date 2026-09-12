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
	ensureAllowedFields,
	invalidOption,
	parseDateValue,
	parseNotionIdValue,
	parseOptionIdValue,
	parseStringValue,
} from "../../shared/http/validation";
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

export class FeedbackWriteValidationError extends Error {
	constructor(readonly response: Response) {
		super("Invalid Feedback write request");
		this.name = "FeedbackWriteValidationError";
	}
}

export class FeedbackNotWritableError extends Error {
	constructor() {
		super("Feedback page is not writable through this endpoint");
		this.name = "FeedbackNotWritableError";
	}
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

const FEEDBACK_WRITE_FIELDS = new Set([
	"feedback",
	"date",
	"feedbackFrom",
	"personTypeOptionId",
	"contextOptionId",
	"feedbackTypeOptionId",
	"companyId",
	"teamId",
	"details",
	"actionFollowUp",
]);

export async function createFeedback(
	env: Env,
	body: Record<string, unknown>,
): Promise<Feedback> {
	const properties = await buildFeedbackProperties(env, body);
	const page = await createNotionPage<NotionFeedbackPage>({
		env,
		dataSourceId: env.FEEDBACK_DATA_SOURCE_ID,
		properties,
	});

	return mapFeedback(page);
}

export async function updateFeedback(
	env: Env,
	pageId: string,
	body: Record<string, unknown>,
): Promise<Feedback> {
	const page = await getNotionPage<NotionFeedbackPage & NotionPageWithParent>({
		env,
		pageId,
	});

	if (!pageBelongsToDataSource(page, env.FEEDBACK_DATA_SOURCE_ID)) {
		throw new FeedbackNotWritableError();
	}

	const properties = await buildFeedbackProperties(env, body);
	const updated = await updateNotionPage<NotionFeedbackPage>({
		env,
		pageId,
		properties,
	});

	return mapFeedback(updated);
}

async function buildFeedbackProperties(
	env: Env,
	body: Record<string, unknown>,
): Promise<NotionPageProperties> {
	const disallowed = ensureAllowedFields(body, FEEDBACK_WRITE_FIELDS);

	if (disallowed) {
		throw new FeedbackWriteValidationError(disallowed);
	}

	const schema = await getDataSourceProperties(env, env.FEEDBACK_DATA_SOURCE_ID);
	const properties: NotionPageProperties = {};

	const feedback = parseStringValue(body.feedback, "feedback");
	if (feedback instanceof Response) throw new FeedbackWriteValidationError(feedback);
	if (feedback !== undefined && feedback !== null) properties.Feedback = titleProperty(feedback);

	const date = parseDateValue(body.date, "date");
	if (date instanceof Response) throw new FeedbackWriteValidationError(date);
	if (date !== undefined) properties.Date = dateProperty(date);

	const feedbackFrom = parseStringValue(body.feedbackFrom, "feedbackFrom");
	if (feedbackFrom instanceof Response) throw new FeedbackWriteValidationError(feedbackFrom);
	if (feedbackFrom !== undefined && feedbackFrom !== null) properties["Feedback From"] = richTextProperty(feedbackFrom);

	const personType = parseOptionIdValue(body.personTypeOptionId, "personTypeOptionId");
	if (personType instanceof Response) throw new FeedbackWriteValidationError(personType);
	if (personType !== undefined) {
		if (personType && !validateOptionId(schema, "Person Type", personType)) {
			throw new FeedbackWriteValidationError(invalidOption("personTypeOptionId"));
		}
		properties["Person Type"] = selectByIdProperty(personType);
	}

	const context = parseOptionIdValue(body.contextOptionId, "contextOptionId");
	if (context instanceof Response) throw new FeedbackWriteValidationError(context);
	if (context !== undefined) {
		if (context && !validateOptionId(schema, "Context", context)) {
			throw new FeedbackWriteValidationError(invalidOption("contextOptionId"));
		}
		properties.Context = selectByIdProperty(context);
	}

	const feedbackType = parseOptionIdValue(body.feedbackTypeOptionId, "feedbackTypeOptionId");
	if (feedbackType instanceof Response) throw new FeedbackWriteValidationError(feedbackType);
	if (feedbackType !== undefined) {
		if (feedbackType && !validateOptionId(schema, "Feedback Type", feedbackType)) {
			throw new FeedbackWriteValidationError(invalidOption("feedbackTypeOptionId"));
		}
		properties["Feedback Type"] = selectByIdProperty(feedbackType);
	}

	const companyId = parseNotionIdValue(body.companyId, "companyId");
	if (companyId instanceof Response) throw new FeedbackWriteValidationError(companyId);
	if (companyId !== undefined) properties.Company = relationProperty(companyId ? [companyId] : []);

	const teamId = parseNotionIdValue(body.teamId, "teamId");
	if (teamId instanceof Response) throw new FeedbackWriteValidationError(teamId);
	if (teamId !== undefined) properties.Team = relationProperty(teamId ? [teamId] : []);

	const details = parseStringValue(body.details, "details");
	if (details instanceof Response) throw new FeedbackWriteValidationError(details);
	if (details !== undefined && details !== null) properties.Details = richTextProperty(details);

	const actionFollowUp = parseStringValue(body.actionFollowUp, "actionFollowUp");
	if (actionFollowUp instanceof Response) throw new FeedbackWriteValidationError(actionFollowUp);
	if (actionFollowUp !== undefined && actionFollowUp !== null) properties["Action / Follow-up"] = richTextProperty(actionFollowUp);

	return properties;
}
