import type { Env } from "../../shared/env";
import { invalidNotionId, invalidRequest } from "../../shared/http/validation";
import { normalizeNotionId } from "../../shared/notion/notion-id";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import {
	ReferenceLibraryValidationError,
	getReferenceImportStatus,
	getReferenceLibraryDetail,
	importReferenceMarkdown,
	isReferenceNotFound,
	listReferenceLibrary,
} from "./reference-library.service";

function parseReferencePageId(pathname: string): string | Response | null {
	const match = pathname.match(/^\/api\/reference-library\/([^/]+)$/);
	if (!match || match[1] === "import" || match[1] === "imports") return null;

	let rawPageId: string;
	try {
		rawPageId = decodeURIComponent(match[1]);
	} catch {
		return invalidNotionId("pageId");
	}

	return normalizeNotionId(rawPageId) ?? invalidNotionId("pageId");
}

function parseImportTaskId(pathname: string): string | Response | null {
	const match = pathname.match(/^\/api\/reference-library\/imports\/([^/]+)$/);
	if (!match) return null;

	let taskId: string;
	try {
		taskId = decodeURIComponent(match[1]).trim();
	} catch {
		return invalidRequest("Expected a valid import task ID", "taskId");
	}

	return taskId || invalidRequest("Expected a valid import task ID", "taskId");
}

export async function handleReferenceLibraryRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (url.pathname === "/api/reference-library" && request.method === "GET") {
		const pagination = parsePaginationParams(url);
		if (pagination instanceof Response) return pagination;

		try {
			return Response.json(await listReferenceLibrary(env, pagination));
		} catch (error) {
			const invalidCursorResponse = pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;
			if (invalidCursorResponse) return invalidCursorResponse;
			console.error(error);
			return Response.json(
				{ error: "Failed to retrieve Reference Library" },
				{ status: 500 },
			);
		}
	}

	if (url.pathname === "/api/reference-library/import" && request.method === "POST") {
		try {
			return await importReferenceMarkdown(env, request);
		} catch (error) {
			if (error instanceof ReferenceLibraryValidationError) return error.response;
			console.error(error);
			return Response.json(
				{ error: "Failed to import Reference Library item" },
				{ status: 500, headers: { "Cache-Control": "no-store" } },
			);
		}
	}

	const taskId = parseImportTaskId(url.pathname);
	if (taskId) {
		if (taskId instanceof Response) return taskId;
		if (request.method !== "GET") return null;

		try {
			return await getReferenceImportStatus(env, taskId);
		} catch (error) {
			console.error(error);
			return Response.json(
				{ error: "Failed to retrieve Reference Library import status" },
				{ status: 500, headers: { "Cache-Control": "no-store" } },
			);
		}
	}

	const pageId = parseReferencePageId(url.pathname);
	if (!pageId) return null;
	if (pageId instanceof Response) return pageId;
	if (request.method !== "GET") return null;

	try {
		return Response.json(await getReferenceLibraryDetail(env, pageId), {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (error) {
		if (isReferenceNotFound(error)) {
			return Response.json({ error: "Reference Library item not found" }, { status: 404 });
		}
		console.error(error);
		return Response.json(
			{ error: "Failed to retrieve Reference Library item" },
			{ status: 500 },
		);
	}
}
