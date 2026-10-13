import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import { getNotionPage, queryAllNotionDataSourcePages, queryNotionDataSource, updateNotionPage } from "../../shared/notion/notion-client";
import { dateProperty } from "../../shared/notion/notion-properties";
import { pageBelongsToDataSource, type NotionPageWithParent } from "../../shared/notion/notion-page-ownership";
import {
	enrichReleaseItems,
	type EnrichedReleaseItem,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import type { PaginationParams } from "../../shared/pagination/pagination";
import {
	mapReleaseItem,
	type NotionReleasePage,
	type ReleaseItem,
} from "./release.mapper";
import { releaseDateProperty, type ReleaseDateType } from "./release.filters";
import { requireAlterReleaseManagement } from "../settings/alter-controls.service";
import { domainError } from "../../shared/http/managed-write";

export interface ReleaseItemListResponse<TReleaseItem = ReleaseItem> {
	data: TReleaseItem[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export async function listAllReleaseItems(
	env: Env,
	filter: NotionQueryFilter,
): Promise<ReleaseItem[]> {
	const pages = await queryAllNotionDataSourcePages<NotionReleasePage>({
		dataSourceId: env.RELEASE_ITEMS_DATA_SOURCE_ID,
		env,
		filter,
	});
	return pages.map(mapReleaseItem);
}

export interface ReleaseDateConflict {
	id: string;
	componentName: string;
	currentDate: string;
}

export class ReleaseBatchConflictError extends Error {
	constructor(readonly dateType: ReleaseDateType, readonly conflicts: ReleaseDateConflict[]) {
		super("Release date field is already set");
	}
}

export class ReleaseBatchOwnershipError extends Error {}

export async function batchSetReleaseDate(
	env: Env,
	releaseItemIds: string[],
	dateType: ReleaseDateType,
	date: string,
): Promise<{ data: ReleaseItem[]; updatedIds: string[]; failed: string[] }> {
	await requireAlterReleaseManagement(env);
	const pages: Array<NotionReleasePage & NotionPageWithParent> = [];

	for (const pageId of releaseItemIds) {
		pages.push(await getNotionPage<NotionReleasePage & NotionPageWithParent>({ env, pageId }));
	}
	if (pages.some((page) => !pageBelongsToDataSource(page, env.RELEASE_ITEMS_DATA_SOURCE_ID))) {
		throw new ReleaseBatchOwnershipError();
	}
	const items = pages.map(mapReleaseItem);
	const targetDate = (item: ReleaseItem) => dateType === "announcement" ? item.formalAnnouncedDate : item.confirmedReleaseDate;
	const confirmed = items.filter((item) => item.confirmedReleaseDate !== null && targetDate(item) !== date);
	if (confirmed.length) {
		throw domainError(409, "Confirmed Release Items are read-only", "RELEASE_ITEM_CONFIRMED", {
			conflicts: confirmed.map((item) => ({ id: item.id, componentName: item.componentName, currentDate: item.confirmedReleaseDate })),
		});
	}
	const property = releaseDateProperty(dateType);
	const conflicts = items.flatMap((item) => {
		const currentDate = targetDate(item);
		return currentDate && currentDate !== date ? [{ id: item.id, componentName: item.componentName, currentDate }] : [];
	});
	if (conflicts.length) throw new ReleaseBatchConflictError(dateType, conflicts);
	const data: ReleaseItem[] = [];
	const updatedIds: string[] = [];
	const failed: string[] = [];
	await requireAlterReleaseManagement(env);
	for (let index = 0; index < pages.length; index++) {
		const page = pages[index];
		if (targetDate(items[index]) === date) {
			// Count a replayed row as completed without writing it again.
			data.push(items[index]);
			updatedIds.push(page.id);
			continue;
		}
		try {
			await requireAlterReleaseManagement(env);
			data.push(mapReleaseItem(await updateNotionPage<NotionReleasePage>({ env, pageId: page.id, properties: { [property]: dateProperty(date) } })));
			updatedIds.push(page.id);
		} catch {
			failed.push(page.id);
		}
	}
	return { data, updatedIds, failed };
}

export async function getReleaseCalendar(env: Env, dateType: ReleaseDateType, from: string, to: string) {
	const pages = await queryAllNotionDataSourcePages<NotionReleasePage>({
		dataSourceId: env.RELEASE_ITEMS_DATA_SOURCE_ID, env,
		filter: { and: [
			{ property: releaseDateProperty(dateType), date: { on_or_after: from } },
			{ property: releaseDateProperty(dateType), date: { on_or_before: to } },
		] },
	});
	const counts = new Map<string, number>();
	for (const item of pages.map(mapReleaseItem)) {
		const value = dateType === "announcement" ? item.formalAnnouncedDate : item.confirmedReleaseDate;
		if (value) {
			const dateKey = value.slice(0, 10);
			counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
		}
	}
	return { dateType, from, to, totalItems: pages.length, dates: [...counts].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)) };
}

export const releaseAnnouncedDateSorts: NotionQuerySort[] = [
	{
		property: "Formal Announced Date",
		direction: "descending",
	},
];

export const releaseConfirmedDateSorts: NotionQuerySort[] = [
	{
		property: "Confirmed Release Date",
		direction: "descending",
	},
];

export async function listReleaseItems(
	env: Env,
	filter?: NotionQueryFilter,
	sorts: NotionQuerySort[] = releaseAnnouncedDateSorts,
	options: IncludeRelationsOption & { pagination?: PaginationParams } = {},
): Promise<ReleaseItemListResponse<ReleaseItem | EnrichedReleaseItem>> {
	const notion = await queryNotionDataSource<NotionReleasePage>({
		dataSourceId: env.RELEASE_ITEMS_DATA_SOURCE_ID,
		env,
		filter,
		sorts,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapReleaseItem);
	const responseData = options.includeRelations
		? await enrichReleaseItems(env, data)
		: data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}
