import type { Env } from "../../shared/env";
import {
	invalidOption,
	invalidRequest,
	parseOptionIdValue,
	parseStringValue,
} from "../../shared/http/validation";
import type {
	NotionQueryError,
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import {
	createNotionPage,
	getNotionPage,
	queryNotionDataSource,
	retrieveNotionAsyncTask,
	retrieveNotionMarkdown,
} from "../../shared/notion/notion-client";
import {
	multiSelectByIdProperty,
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
import type { PaginationParams } from "../../shared/pagination/pagination";
import {
	mapReferenceLibraryItem,
	type NotionReferenceLibraryPage,
	type ReferenceLibraryItem,
} from "./reference-library.mapper";
import { normalizeReferenceMarkdownForDisplay } from "./reference-library.markdown";

const MAX_MARKDOWN_UPLOAD_BYTES = 4_500_000;
const REFERENCE_IMPORT_FIELDS = new Set([
	"file",
	"article",
	"categoryOptionId",
	"tagOptionIds",
]);
const referenceLibrarySorts: NotionQuerySort[] = [
	{ property: "Last Edited", direction: "descending" },
];

interface NotionMarkdownResponse {
	markdown?: string;
	truncated?: boolean;
	unknown_block_ids?: string[];
	text_fallback?: string;
}

interface NotionAsyncTaskResponse {
	id?: string;
	status?: string;
	poll_after_seconds?: number;
	result?: { id?: string; page_id?: string };
	error?: unknown;
}

export interface ReferenceLibraryDetail extends ReferenceLibraryItem {
	markdown: string;
	truncated: boolean;
	unknownBlockIds: string[];
	textFallback: string;
}

export interface ReferenceLibraryListResponse {
	data: ReferenceLibraryItem[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export class ReferenceLibraryValidationError extends Error {
	constructor(readonly response: Response) {
		super("Invalid Reference Library request");
		this.name = "ReferenceLibraryValidationError";
	}
}

export class ReferenceLibraryNotFoundError extends Error {
	constructor() {
		super("Reference Library page not found");
		this.name = "ReferenceLibraryNotFoundError";
	}
}

export async function listReferenceLibrary(
	env: Env,
	pagination: PaginationParams,
	filter?: NotionQueryFilter,
): Promise<ReferenceLibraryListResponse> {
	const response = await queryNotionDataSource<NotionReferenceLibraryPage>({
		env,
		dataSourceId: env.REFERENCE_LIBRARY_DATA_SOURCE_ID,
		filter,
		sorts: referenceLibrarySorts,
		pageSize: pagination.pageSize,
		startCursor: pagination.cursor,
	});
	const data = response.results.map(mapReferenceLibraryItem);

	return {
		data,
		count: data.length,
		hasMore: response.has_more,
		nextCursor: response.next_cursor,
	};
}

export async function getReferenceLibraryDetail(
	env: Env,
	pageId: string,
): Promise<ReferenceLibraryDetail> {
	const page = await getReferenceLibraryPage(env, pageId);
	const markdown = await retrieveNotionMarkdown<NotionMarkdownResponse>({ env, pageId });

	return {
		...mapReferenceLibraryItem(page),
		markdown: normalizeReferenceMarkdownForDisplay(markdown.markdown ?? ""),
		truncated: markdown.truncated ?? false,
		unknownBlockIds: markdown.unknown_block_ids ?? [],
		textFallback: markdown.text_fallback ?? "",
	};
}

export async function importReferenceMarkdown(
	env: Env,
	request: Request,
): Promise<Response> {
	const formData = await request.formData();
	validateImportFields(formData);
	const file = formData.get("file");

	if (!(file instanceof File)) {
		throw validationError(invalidRequest("Expected multipart file", "file"));
	}
	if (file.size === 0) {
		throw validationError(invalidRequest("Expected a non-empty file", "file"));
	}
	if (file.size > MAX_MARKDOWN_UPLOAD_BYTES) {
		return Response.json(
			{ error: "Payload too large", maxBytes: MAX_MARKDOWN_UPLOAD_BYTES },
			{ status: 413, headers: { "Cache-Control": "no-store" } },
		);
	}
	if (!/\.(md|markdown)$/i.test(file.name)) {
		return Response.json(
			{ error: "Unsupported media type", message: "Expected a .md or .markdown file" },
			{ status: 415, headers: { "Cache-Control": "no-store" } },
		);
	}

	const article = parseArticle(formData.get("article"), file.name);
	const categoryOptionId = parseImportOption(
		formData.get("categoryOptionId"),
		"categoryOptionId",
	);
	const tagOptionIds = parseImportTags(formData.getAll("tagOptionIds"));
	const properties = await buildImportProperties(
		env,
		article,
		categoryOptionId,
		tagOptionIds,
		formData.has("tagOptionIds"),
	);
	const markdown = new TextDecoder("utf-8", {
		fatal: true,
		ignoreBOM: false,
	}).decode(await file.arrayBuffer());
	const created = await createNotionPage<
		NotionReferenceLibraryPage | NotionAsyncTaskResponse
	>({
		env,
		dataSourceId: env.REFERENCE_LIBRARY_DATA_SOURCE_ID,
		properties,
		markdown,
		allowAsync: true,
	});

	if ("status" in created && created.id) {
		return Response.json(
			{
				status: normalizeAsyncStatus(created.status),
				taskId: created.id,
				pollAfterSeconds: created.poll_after_seconds ?? 1,
			},
			{ status: 202, headers: { "Cache-Control": "no-store" } },
		);
	}

	return Response.json(
		{ data: mapReferenceLibraryItem(created as NotionReferenceLibraryPage) },
		{ status: 201, headers: { "Cache-Control": "no-store" } },
	);
}

export async function getReferenceImportStatus(
	env: Env,
	taskId: string,
): Promise<Response> {
	const task = await retrieveNotionAsyncTask<NotionAsyncTaskResponse>({ env, taskId });
	const status = normalizeAsyncStatus(task.status);

	return Response.json(
		{
			status,
			taskId: task.id ?? taskId,
			pollAfterSeconds: task.poll_after_seconds ?? null,
			pageId: task.result?.page_id ?? task.result?.id ?? null,
			failed: status === "failed",
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}

export function isReferenceNotFound(error: unknown): boolean {
	return error instanceof ReferenceLibraryNotFoundError || isNotionNotFound(error);
}

async function getReferenceLibraryPage(
	env: Env,
	pageId: string,
): Promise<NotionReferenceLibraryPage & NotionPageWithParent> {
	const page = await getNotionPage<
		NotionReferenceLibraryPage & NotionPageWithParent
	>({ env, pageId });

	if (!pageBelongsToDataSource(page, env.REFERENCE_LIBRARY_DATA_SOURCE_ID)) {
		throw new ReferenceLibraryNotFoundError();
	}

	return page;
}

async function buildImportProperties(
	env: Env,
	article: string,
	categoryOptionId: string | null | undefined,
	tagOptionIds: string[],
	hasTagOptionIds: boolean,
): Promise<NotionPageProperties> {
	const properties: NotionPageProperties = { Article: titleProperty(article) };

	if (categoryOptionId === undefined && !hasTagOptionIds) return properties;

	const schema = await getDataSourceProperties(
		env,
		env.REFERENCE_LIBRARY_DATA_SOURCE_ID,
	);

	if (categoryOptionId !== undefined) {
		if (
			categoryOptionId &&
			!validateOptionId(schema, "Category", categoryOptionId)
		) {
			throw validationError(invalidOption("categoryOptionId"));
		}
		properties.Category = selectByIdProperty(categoryOptionId);
	}

	if (hasTagOptionIds) {
		for (const tagOptionId of tagOptionIds) {
			if (!validateOptionId(schema, "Tags", tagOptionId)) {
				throw validationError(invalidOption("tagOptionIds"));
			}
		}
		properties.Tags = multiSelectByIdProperty(tagOptionIds);
	}

	return properties;
}

function validateImportFields(formData: FormData): void {
	for (const field of formData.keys()) {
		if (!REFERENCE_IMPORT_FIELDS.has(field)) {
			throw validationError(invalidRequest("Unknown field", field));
		}
	}
}

function parseArticle(value: string | File | null, filename: string): string {
	if (value instanceof File) {
		throw validationError(invalidRequest("Expected a string", "article"));
	}

	const article = parseStringValue(value ?? undefined, "article");
	if (article instanceof Response) throw validationError(article);
	if (article !== undefined && !article) {
		throw validationError(invalidRequest("Expected a non-empty string", "article"));
	}

	return article ?? titleFromFilename(filename);
}

function parseImportOption(
	value: string | File | null,
	field: string,
): string | null | undefined {
	if (value instanceof File) {
		throw validationError(invalidRequest("Expected a string", field));
	}

	const parsed = parseOptionIdValue(value ?? undefined, field);
	if (parsed instanceof Response) throw validationError(parsed);

	return parsed;
}

function parseImportTags(values: Array<string | File>): string[] {
	const tags: string[] = [];

	for (const value of values) {
		if (value instanceof File) {
			throw validationError(invalidRequest("Expected a string", "tagOptionIds"));
		}
		const trimmed = value.trim();
		if (trimmed) tags.push(trimmed);
	}

	return tags;
}

function validationError(response: Response): ReferenceLibraryValidationError {
	return new ReferenceLibraryValidationError(response);
}

function isNotionNotFound(error: unknown): boolean {
	return (error as NotionQueryError | undefined)?.status === 404;
}

function titleFromFilename(filename: string): string {
	const base = filename.split(/[\\/]/).pop() ?? "";
	const stem = base.replace(/\.(md|markdown)$/i, "");
	const title = stem.replace(/[\u0000-\u001f\u007f]/g, "").trim();

	return title || "Untitled";
}

function normalizeAsyncStatus(status: string | undefined): string {
	if (status === "queued" || status === "running" || status === "retrying") {
		return status;
	}
	if (status === "succeeded" || status === "completed" || status === "success") {
		return "succeeded";
	}
	if (status === "failed" || status === "error") return "failed";

	return status ?? "running";
}
