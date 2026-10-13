import type { Env } from "../env";
import { isRecord, parseJsonRequestBody } from "./request-body";
import { invalidRequest, invalidNotionId } from "./validation";
import { normalizeNotionId } from "../notion/notion-id";
import { getNotionPage, NotionQueryError } from "../notion/notion-client";
import { pageBelongsToDataSource, type NotionPageWithParent } from "../notion/notion-page-ownership";

export class ManagedWriteError extends Error {
	constructor(readonly response: Response) {
		super("Managed write rejected");
	}
}

export function domainError(status: number, error: string, code: string, extra: Record<string, unknown> = {}): ManagedWriteError {
	return new ManagedWriteError(Response.json({ error, code, ...extra }, { status }));
}

export function checked<T>(value: T | Response): T {
	if (value instanceof Response) throw new ManagedWriteError(value);
	return value;
}

export function noStore(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", "no-store");
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function managedResponse(operation: () => Promise<Response>, message: string): Promise<Response> {
	try {
		return noStore(await operation());
	} catch (error) {
		if (error instanceof ManagedWriteError) return noStore(error.response);
		console.error(message);
		return noStore(Response.json({ error: message }, { status: 500 }));
	}
}

export async function mutationBody(request: Request): Promise<Record<string, unknown>> {
	const parsed = checked(await parseJsonRequestBody(request));
	if (!isRecord(parsed.value)) throw new ManagedWriteError(invalidRequest("Expected a JSON object"));
	return parsed.value;
}

export function notionIdSegment(segment: string, field: string): string {
	let id: string | null;
	try {
		id = normalizeNotionId(decodeURIComponent(segment));
	} catch {
		id = null;
	}
	if (!id) throw new ManagedWriteError(invalidNotionId(field));
	return id;
}

export async function ownedPage<T extends NotionPageWithParent>(env: Env, pageId: string, dataSourceId: string, resource: string): Promise<T> {
	let page: T;
	try {
		page = await getNotionPage<T>({ env, pageId });
	} catch (error) {
		if (error instanceof NotionQueryError && error.status === 404) {
			throw new ManagedWriteError(Response.json({ error: `${resource} not found` }, { status: 404 }));
		}
		throw error;
	}
	if (!pageBelongsToDataSource(page, dataSourceId)) {
		throw new ManagedWriteError(invalidRequest(`Expected a ${resource} page`));
	}
	return page;
}
