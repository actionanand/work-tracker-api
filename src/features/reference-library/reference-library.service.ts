import type { Env } from "../../shared/env";
import { invalidRequest } from "../../shared/http/validation";
import type { NotionQueryError } from "../../shared/notion/notion-client";
import {
	createNotionPage,
	getNotionPage,
	listNotionBlockChildren,
	retrieveNotionAsyncTask,
	retrieveNotionMarkdown,
} from "../../shared/notion/notion-client";
import { titleProperty } from "../../shared/notion/notion-properties";
import {
	pageBelongsToPage,
	type NotionPageWithParent,
} from "../../shared/notion/notion-page-ownership";
import type { PaginationParams } from "../../shared/pagination/pagination";

const MAX_MARKDOWN_UPLOAD_BYTES = 4_500_000;

interface NotionChildPageBlock {
	id: string;
	type?: string;
	created_time?: string;
	last_edited_time?: string;
	child_page?: {
		title?: string;
	};
}

interface NotionBlockChildrenResponse {
	results: NotionChildPageBlock[];
	has_more: boolean;
	next_cursor: string | null;
}

interface NotionPage {
	id: string;
	created_time: string;
	last_edited_time: string;
	properties?: {
		title?: {
			title?: Array<{ plain_text?: string }>;
		};
	};
}

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
	result?: {
		id?: string;
		page_id?: string;
	};
	error?: unknown;
}

export interface ReferenceLibraryItem {
	id: string;
	title: string;
	createdTime: string | null;
	lastEditedTime: string | null;
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
): Promise<ReferenceLibraryListResponse> {
	const response = await listNotionBlockChildren<NotionBlockChildrenResponse>({
		env,
		blockId: env.REFERENCE_LIBRARY_PAGE_ID,
		pageSize: pagination.pageSize,
		startCursor: pagination.cursor,
	});
	const data = response.results
		.filter((block) => block.type === "child_page")
		.map((block) => ({
			id: block.id,
			title: block.child_page?.title ?? "",
			createdTime: block.created_time ?? null,
			lastEditedTime: block.last_edited_time ?? null,
		}));

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
	const page = await getReferenceChildPage(env, pageId);
	const markdown = await retrieveNotionMarkdown<NotionMarkdownResponse>({ env, pageId });

	return {
		id: page.id,
		title: plainTitle(page),
		createdTime: page.created_time,
		lastEditedTime: page.last_edited_time,
		markdown: markdown.markdown ?? "",
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
	const file = formData.get("file");

	if (!(file instanceof File)) {
		throw new ReferenceLibraryValidationError(invalidRequest("Expected multipart file", "file"));
	}

	if (file.size === 0) {
		throw new ReferenceLibraryValidationError(invalidRequest("Expected a non-empty file", "file"));
	}

	if (file.size > MAX_MARKDOWN_UPLOAD_BYTES) {
		return Response.json(
			{
				error: "Payload too large",
				maxBytes: MAX_MARKDOWN_UPLOAD_BYTES,
			},
			{ status: 413, headers: { "Cache-Control": "no-store" } },
		);
	}

	if (!/\.(md|markdown)$/i.test(file.name)) {
		return Response.json(
			{
				error: "Unsupported media type",
				message: "Expected a .md or .markdown file",
			},
			{ status: 415, headers: { "Cache-Control": "no-store" } },
		);
	}

	const markdown = new TextDecoder("utf-8", {
		fatal: true,
		ignoreBOM: false,
	}).decode(await file.arrayBuffer());
	const title = titleFromFilename(file.name);
	const created = await createNotionPage<NotionPage | NotionAsyncTaskResponse>({
		env,
		parentPageId: env.REFERENCE_LIBRARY_PAGE_ID,
		properties: {
			title: titleProperty(title),
		},
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
		{
			data: {
				id: created.id,
				title,
			},
		},
		{ status: 201, headers: { "Cache-Control": "no-store" } },
	);
}

export async function getReferenceImportStatus(
	env: Env,
	taskId: string,
): Promise<Response> {
	const task = await retrieveNotionAsyncTask<NotionAsyncTaskResponse>({ env, taskId });

	return Response.json(
		{
			status: normalizeAsyncStatus(task.status),
			taskId: task.id ?? taskId,
			pollAfterSeconds: task.poll_after_seconds ?? null,
			pageId: task.result?.page_id ?? task.result?.id ?? null,
			failed: normalizeAsyncStatus(task.status) === "failed",
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}

export function isReferenceNotFound(error: unknown): boolean {
	return error instanceof ReferenceLibraryNotFoundError || isNotionNotFound(error);
}

function isNotionNotFound(error: unknown): boolean {
	return (error as NotionQueryError | undefined)?.status === 404;
}

async function getReferenceChildPage(
	env: Env,
	pageId: string,
): Promise<NotionPage & NotionPageWithParent> {
	const page = await getNotionPage<NotionPage & NotionPageWithParent>({ env, pageId });

	if (!pageBelongsToPage(page, env.REFERENCE_LIBRARY_PAGE_ID)) {
		throw new ReferenceLibraryNotFoundError();
	}

	return page;
}

function plainTitle(page: NotionPage): string {
	return (page.properties?.title?.title ?? [])
		.map((item) => item.plain_text ?? "")
		.join("")
		.trim();
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

	if (status === "failed" || status === "error") {
		return "failed";
	}

	return status ?? "running";
}
