import type { Env } from "../../shared/env";
import { parseNotionIdParam } from "../../shared/notion/notion-id";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { isRecord, parseJsonRequestBody } from "../../shared/http/request-body";
import { ensureAllowedFields, invalidRequest, parseDateValue, parseNotionIdArrayValue, parseStringValue } from "../../shared/http/validation";
import { combineReleaseFilters, releaseFilters, type ReleaseDateType } from "./release.filters";
import {
	batchSetReleaseDate,
	getReleaseCalendar,
	listReleaseItems,
	ReleaseBatchConflictError,
	ReleaseBatchOwnershipError,
	releaseAnnouncedDateSorts,
	releaseConfirmedDateSorts,
} from "./release.service";

interface ReleaseRouteConfig {
	baseFilter?: NotionQueryFilter;
	sorts: NotionQuerySort[];
}

const releaseRouteConfigs = new Map<string, ReleaseRouteConfig>([
	[
		"/api/releases",
		{
			sorts: releaseAnnouncedDateSorts,
		},
	],
	[
		"/api/releases/pending",
		{
			baseFilter: releaseFilters.pending as NotionQueryFilter,
			sorts: releaseAnnouncedDateSorts,
		},
	],
	[
		"/api/releases/confirmed",
		{
			baseFilter: releaseFilters.confirmed as NotionQueryFilter,
			sorts: releaseConfirmedDateSorts,
		},
	],
	[
		"/api/releases/not-announced",
		{
			baseFilter: releaseFilters.notAnnounced as NotionQueryFilter,
			sorts: releaseAnnouncedDateSorts,
		},
	],
]);

function invalidDateResponse(parameter: "from" | "to"): Response {
	return Response.json(
		{
			error: "Invalid date query parameter",
			parameter,
			expectedFormat: "YYYY-MM-DD",
		},
		{
			status: 400,
		},
	);
}

function parseDateParam(url: URL, name: "from" | "to"): string | Response | undefined {
	const value = url.searchParams.get(name);

	if (!value) {
		return undefined;
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return invalidDateResponse(name);
	}

	const date = new Date(`${value}T00:00:00.000Z`);

	if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
		return invalidDateResponse(name);
	}

	return value;
}

function textParam(
	url: URL,
	name: "deploymentType" | "component",
): string | undefined {
	const value = url.searchParams.get(name)?.trim();

	return value && value.length > 0 ? value : undefined;
}

function buildQueryFilter(
	url: URL,
	config: ReleaseRouteConfig,
): NotionQueryFilter | Response | undefined {
	const jiraId = parseNotionIdParam(url, "jiraId");

	if (jiraId instanceof Response) {
		return jiraId;
	}

	const from = parseDateParam(url, "from");

	if (from instanceof Response) {
		return from;
	}

	const to = parseDateParam(url, "to");

	if (to instanceof Response) {
		return to;
	}

	const deploymentType = textParam(url, "deploymentType");
	const component = textParam(url, "component");

	return combineReleaseFilters([
		config.baseFilter,
		jiraId ? releaseFilters.jira(jiraId) : undefined,
		deploymentType ? releaseFilters.deploymentType(deploymentType) : undefined,
		component ? releaseFilters.component(component) : undefined,
		from ? releaseFilters.from(from) : undefined,
		to ? releaseFilters.to(to) : undefined,
	]);
}

function parseReleaseDateType(value: string | null): ReleaseDateType | Response {
	if (value === "announcement" || value === "release") return value;
	return invalidRequest("Expected dateType to be announcement or release", "dateType");
}

function noStore(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", "no-store");
	return new Response(response.body, { status: response.status, headers });
}

export async function handleReleaseRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (request.method === "GET" && url.pathname === "/api/releases/calendar") {
		const dateType = parseReleaseDateType(url.searchParams.get("dateType"));
		const from = parseDateParam(url, "from");
		const to = parseDateParam(url, "to");
		if (dateType instanceof Response) return dateType;
		if (from instanceof Response || to instanceof Response) return from instanceof Response ? from : to as Response;
		if (!from || !to) return invalidRequest("from and to are required");
		if (from > to || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 366) return invalidRequest("Invalid calendar date range");
		try { return Response.json(await getReleaseCalendar(env, dateType, from, to)); } catch { return Response.json({ error: "Failed to retrieve Release calendar" }, { status: 500 }); }
	}

	if (request.method === "GET" && url.pathname === "/api/releases/by-date") {
		const dateType = parseReleaseDateType(url.searchParams.get("dateType"));
		const date = url.searchParams.get("date");
		const parsedDate = parseDateValue(date, "date");
		if (dateType instanceof Response) return dateType;
		if (parsedDate instanceof Response || !parsedDate) return parsedDate instanceof Response ? parsedDate : invalidRequest("date is required", "date");
		const pagination = parsePaginationParams(url); if (pagination instanceof Response) return pagination;
		const includeRelations = parseIncludeRelations(url); if (includeRelations instanceof Response) return includeRelations;
		try {
			return Response.json(await listReleaseItems(env, releaseFilters.dateEquals(dateType, parsedDate), [{ property: dateType === "announcement" ? "Formal Announced Date" : "Confirmed Release Date", direction: "ascending" }], { includeRelations, pagination }));
		} catch (error) {
			const invalidCursorResponse = pagination.cursor ? invalidPaginationCursorResponse(error) : null;
			if (invalidCursorResponse) return invalidCursorResponse;
			console.error(error);
			return Response.json({ error: "Failed to retrieve Release Items" }, { status: 500 });
		}
	}

	if (request.method === "PATCH" && url.pathname === "/api/releases/bulk-date") {
		const parsed = await parseJsonRequestBody(request);
		if (parsed instanceof Response || !isRecord(parsed.value)) return noStore(parsed instanceof Response ? parsed : invalidRequest("Expected a JSON object"));
		const unknown = ensureAllowedFields(parsed.value, new Set(["releaseItemIds", "dateType", "date"])); if (unknown) return noStore(unknown);
		const ids = parseNotionIdArrayValue(parsed.value.releaseItemIds, "releaseItemIds");
		const dateTypeValue = parseStringValue(parsed.value.dateType, "dateType");
		const date = parseDateValue(parsed.value.date, "date");
		if (ids instanceof Response || dateTypeValue instanceof Response || date instanceof Response) return noStore(ids instanceof Response ? ids : dateTypeValue instanceof Response ? dateTypeValue : date as Response);
		const uniqueIds = [...new Set(ids ?? [])]; if (!uniqueIds.length || uniqueIds.length > 100) return noStore(invalidRequest("Expected 1 to 100 releaseItemIds", "releaseItemIds"));
		const dateType = parseReleaseDateType(dateTypeValue ?? null); if (dateType instanceof Response) return noStore(dateType);
		if (!date) return noStore(invalidRequest("Expected date in YYYY-MM-DD format", "date"));
		try {
			const result = await batchSetReleaseDate(env, uniqueIds, dateType, date);
			if (result.failed.length) return noStore(Response.json({ error: "Release batch update partially failed", requested: uniqueIds.length, updated: result.updatedIds.length, allSucceeded: false, updatedIds: result.updatedIds, failed: result.failed.map((id) => ({ id, error: "update-failed" })) }, { status: 502 }));
			return noStore(Response.json({ dateType, date, requested: uniqueIds.length, updated: result.data.length, allSucceeded: true, data: result.data }));
		} catch (error) {
			if (error instanceof ReleaseBatchConflictError) return noStore(Response.json({ error: "Release date field is already set", code: "RELEASE_DATE_CONFLICT", dateType: error.dateType, conflicts: error.conflicts }, { status: 409 }));
			if (error instanceof ReleaseBatchOwnershipError) return noStore(invalidRequest("Expected a Release Item page", "releaseItemIds"));
			return noStore(Response.json({ error: "Failed to update Release Items" }, { status: 500 }));
		}
	}

	const config = releaseRouteConfigs.get(url.pathname);

	if (request.method !== "GET" || !config) {
		return null;
	}

	const pagination = parsePaginationParams(url);

	if (pagination instanceof Response) {
		return pagination;
	}

	const includeRelations = parseIncludeRelations(url);

	if (includeRelations instanceof Response) {
		return includeRelations;
	}

	const filter = buildQueryFilter(url, config);

	if (filter instanceof Response) {
		return filter;
	}

	try {
		return Response.json(
			await listReleaseItems(env, filter, config.sorts, {
				includeRelations,
				pagination,
			}),
		);
	} catch (error) {
		const invalidCursorResponse = pagination.cursor
			? invalidPaginationCursorResponse(error)
			: null;

		if (invalidCursorResponse) {
			return invalidCursorResponse;
		}

		console.error(error);

		return Response.json(
			{
				error: "Failed to retrieve Release Items",
			},
			{
				status: 500,
			},
		);
	}
}
