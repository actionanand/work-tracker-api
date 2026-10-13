import type { Env } from "../env";
import { getNotionPageProperty, type NotionDataSourceQueryResponse } from "./notion-client";

export interface NotionRelationProperty {
	id?: string;
	relation?: Array<{ id: string }>;
	has_more?: boolean;
}

export async function completeRelationIds(env: Env, pageId: string, property: NotionRelationProperty | undefined): Promise<string[]> {
	if (!property?.has_more) return (property?.relation ?? []).map((item) => item.id);
	if (!property.id) throw new Error("Incomplete Notion relation property");
	const ids: string[] = [];
	const cursors = new Set<string>();
	let cursor: string | undefined;
	do {
		const response = await getNotionPageProperty<NotionDataSourceQueryResponse<{ relation: { id: string } }>>(env, pageId, property.id, cursor);
		ids.push(...response.results.map((item) => item.relation.id));
		if (!response.has_more) return [...new Set(ids)];
		const next = response.next_cursor;
		if (!next || cursors.has(next)) throw new Error("Incomplete Notion relation pagination");
		cursors.add(next);
		cursor = next;
	} while (cursor);
	throw new Error("Incomplete Notion relation pagination");
}
