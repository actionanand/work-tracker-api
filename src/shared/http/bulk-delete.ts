import { invalidNotionId, invalidRequest } from "./validation";
import { normalizeNotionId } from "../notion/notion-id";

export const MAX_BULK_DELETE_PAGE_IDS = 25;

export interface BulkDeleteRequest {
	pageIds: string[];
}

export interface BulkDeleteItemResult {
	id: string;
	deleted: boolean;
	error?: string;
}

export interface BulkDeleteResponse {
	requested: number;
	deleted: number;
	failed: BulkDeleteItemResult[];
	allSucceeded: boolean;
}

export function parseBulkDeletePageIds(
	body: Record<string, unknown>,
): string[] | Response {
	if (!Array.isArray(body.pageIds)) {
		return invalidRequest("Expected an array of Notion page IDs", "pageIds");
	}

	if (body.pageIds.length === 0) {
		return invalidRequest("Expected at least one page ID", "pageIds");
	}

	if (body.pageIds.length > MAX_BULK_DELETE_PAGE_IDS) {
		return invalidRequest(
			`Expected no more than ${MAX_BULK_DELETE_PAGE_IDS} page IDs`,
			"pageIds",
		);
	}

	const pageIds: string[] = [];
	const seen = new Set<string>();

	for (const value of body.pageIds) {
		if (typeof value !== "string") {
			return invalidNotionId("pageIds");
		}

		const normalized = normalizeNotionId(value);

		if (!normalized) {
			return invalidNotionId("pageIds");
		}

		if (seen.has(normalized)) {
			return invalidRequest("Duplicate page ID", "pageIds");
		}

		seen.add(normalized);
		pageIds.push(normalized);
	}

	return pageIds;
}
