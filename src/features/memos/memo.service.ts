import type { Env } from "../../shared/env";
import type { BulkDeleteResponse } from "../../shared/http/bulk-delete";
import {
	ensureAllowedFields,
	invalidOption,
	invalidRequest,
	parseBooleanValue,
	parseOptionIdValue,
	parseStringArrayValue,
	parseStringValue,
} from "../../shared/http/validation";
import type { NotionQueryFilter, NotionQuerySort } from "../../shared/notion/notion-client";
import {
	createNotionPage,
	getNotionPage,
	queryNotionDataSource,
	retrieveNotionMarkdown,
	trashNotionPage,
	updateNotionMarkdown,
	updateNotionPage,
} from "../../shared/notion/notion-client";
import {
	checkboxProperty,
	multiSelectByIdProperty,
	selectByIdProperty,
	titleProperty,
	type NotionPageProperties,
} from "../../shared/notion/notion-properties";
import {
	pageBelongsToDataSource,
	type NotionPageWithParent,
} from "../../shared/notion/notion-page-ownership";
import { getDataSourceProperties, validateOptionId } from "../../shared/notion/notion-schema";
import type { PaginationParams } from "../../shared/pagination/pagination";
import { mapMemo, type Memo, type MemoDetail, type NotionMemoPage } from "./memo.mapper";

interface NotionMarkdownResponse {
	markdown?: string;
	truncated?: boolean;
	unknown_block_ids?: string[];
	text_fallback?: string;
}

export interface MemoListResponse {
	data: Memo[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export class MemoWriteValidationError extends Error {
	constructor(readonly response: Response) {
		super("Invalid Memo write request");
		this.name = "MemoWriteValidationError";
	}
}

export class MemoNotWritableError extends Error {
	constructor() {
		super("Memo page is not writable through this endpoint");
		this.name = "MemoNotWritableError";
	}
}

const MEMO_WRITE_FIELDS = new Set([
	"memo",
	"categoryOptionId",
	"tagOptionIds",
	"pinned",
	"markdown",
]);

const memoDefaultSorts: NotionQuerySort[] = [
	{ property: "Last Edited", direction: "descending" },
];

export async function listMemos(
	env: Env,
	filter?: NotionQueryFilter,
	pagination?: PaginationParams,
): Promise<MemoListResponse> {
	const notion = await queryNotionDataSource<NotionMemoPage>({
		dataSourceId: env.MEMOS_DATA_SOURCE_ID,
		env,
		filter,
		sorts: memoDefaultSorts,
		pageSize: pagination?.pageSize,
		startCursor: pagination?.cursor,
	});
	const data = notion.results.map(mapMemo);

	return {
		data,
		count: data.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

export async function getMemoDetail(env: Env, pageId: string): Promise<MemoDetail> {
	const page = await getMemoPageForMutation(env, pageId);
	const markdown = await retrieveNotionMarkdown<NotionMarkdownResponse>({ env, pageId });

	return {
		...mapMemo(page),
		markdown: markdown.markdown ?? "",
		truncated: markdown.truncated ?? false,
		unknownBlockIds: markdown.unknown_block_ids ?? [],
		textFallback: markdown.text_fallback ?? "",
	};
}

export async function createMemo(
	env: Env,
	body: Record<string, unknown>,
): Promise<Memo | MemoDetail> {
	const { properties, markdown } = await buildMemoProperties(env, body, true);
	const page = await createNotionPage<NotionMemoPage>({
		env,
		dataSourceId: env.MEMOS_DATA_SOURCE_ID,
		properties,
		...(markdown !== undefined ? { markdown, allowAsync: true } : {}),
	});

	if (markdown === undefined) {
		return mapMemo(page);
	}

	return {
		...mapMemo(page),
		markdown,
		truncated: false,
		unknownBlockIds: [],
		textFallback: "",
	};
}

export async function updateMemo(
	env: Env,
	pageId: string,
	body: Record<string, unknown>,
): Promise<Memo | MemoDetail> {
	await getMemoPageForMutation(env, pageId);
	const { properties, markdown } = await buildMemoProperties(env, body, false);
	let page: NotionMemoPage;

	if (Object.keys(properties).length > 0) {
		page = await updateNotionPage<NotionMemoPage>({ env, pageId, properties });
	} else {
		page = await getNotionPage<NotionMemoPage>({ env, pageId });
	}

	if (markdown === undefined) {
		return mapMemo(page);
	}

	await updateNotionMarkdown({ env, pageId, markdown, allowAsync: true });

	return {
		...mapMemo(page),
		markdown,
		truncated: false,
		unknownBlockIds: [],
		textFallback: "",
	};
}

export async function deleteMemo(env: Env, pageId: string): Promise<{ id: string; deleted: true }> {
	await getMemoPageForMutation(env, pageId);
	await trashNotionPage({ env, pageId });

	return { id: pageId, deleted: true };
}

export async function bulkDeleteMemos(
	env: Env,
	pageIds: string[],
): Promise<BulkDeleteResponse> {
	for (const pageId of pageIds) {
		await getMemoPageForMutation(env, pageId);
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

async function getMemoPageForMutation(
	env: Env,
	pageId: string,
): Promise<NotionMemoPage & NotionPageWithParent> {
	const page = await getNotionPage<NotionMemoPage & NotionPageWithParent>({ env, pageId });

	if (!pageBelongsToDataSource(page, env.MEMOS_DATA_SOURCE_ID)) {
		throw new MemoNotWritableError();
	}

	return page;
}

async function buildMemoProperties(
	env: Env,
	body: Record<string, unknown>,
	requireTitle: boolean,
): Promise<{ properties: NotionPageProperties; markdown?: string }> {
	const disallowed = ensureAllowedFields(body, MEMO_WRITE_FIELDS);
	if (disallowed) throw new MemoWriteValidationError(disallowed);

	const schema = await getDataSourceProperties(env, env.MEMOS_DATA_SOURCE_ID);
	const properties: NotionPageProperties = {};

	const memo = parseStringValue(body.memo, "memo");
	if (memo instanceof Response) throw new MemoWriteValidationError(memo);
	if (requireTitle && !memo) {
		throw new MemoWriteValidationError(invalidRequest("Expected a non-empty string", "memo"));
	}
	if (memo !== undefined && memo !== null) properties.Memo = titleProperty(memo);

	const category = parseOptionIdValue(body.categoryOptionId, "categoryOptionId");
	if (category instanceof Response) throw new MemoWriteValidationError(category);
	if (category !== undefined) {
		if (category && !validateOptionId(schema, "Category", category)) {
			throw new MemoWriteValidationError(invalidOption("categoryOptionId"));
		}
		properties.Category = selectByIdProperty(category);
	}

	const tagOptionIds = parseStringArrayValue(body.tagOptionIds, "tagOptionIds");
	if (tagOptionIds instanceof Response) throw new MemoWriteValidationError(tagOptionIds);
	if (tagOptionIds !== undefined) {
		for (const tagOptionId of tagOptionIds) {
			if (!validateOptionId(schema, "Tags", tagOptionId)) {
				throw new MemoWriteValidationError(invalidOption("tagOptionIds"));
			}
		}
		properties.Tags = multiSelectByIdProperty(tagOptionIds);
	}

	const pinned = parseBooleanValue(body.pinned, "pinned");
	if (pinned instanceof Response) throw new MemoWriteValidationError(pinned);
	if (pinned !== undefined) properties.Pinned = checkboxProperty(pinned);

	const markdown = parseStringValue(body.markdown, "markdown");
	if (markdown instanceof Response) throw new MemoWriteValidationError(markdown);

	return {
		properties,
		...(markdown !== undefined && markdown !== null ? { markdown } : {}),
	};
}
