import type { Env } from "../../shared/env";
import { parseDomainQueryRequest, withAcceptQuery } from "../../shared/http/http-query";
import { isRecord, parseJsonRequestBody } from "../../shared/http/request-body";
import {
	invalidNotionId,
	invalidRequest,
	parseBooleanValue,
	parseNotionIdArrayValue,
	parseStringArrayValue,
	parseStringValue,
} from "../../shared/http/validation";
import { normalizeNotionId, parseNotionIdParam } from "../../shared/notion/notion-id";
import type { NotionQueryFilter } from "../../shared/notion/notion-client";
import { NotionQueryError } from "../../shared/notion/notion-client";
import { buildResourceMetadata } from "../../shared/notion/notion-schema";
import {
	invalidPaginationCursorResponse,
	parsePaginationParams,
} from "../../shared/pagination/pagination";
import { parseIncludeRelations } from "../../shared/relations/relation-enrichment";
import { combineWorkLinkFilters, workLinkFilters } from "./work-link.filters";
import {
	WorkLinkNotWritableError,
	WorkLinkWriteValidationError,
	createWorkLink,
	listWorkLinks,
	updateWorkLink,
} from "./work-link.service";

interface WorkLinkRouteConfig {
	baseFilter?: NotionQueryFilter;
}

const workLinkRouteConfigs = new Map<string, WorkLinkRouteConfig>([
	["/api/work-links", {}],
	[
		"/api/work-links/active",
		{
			baseFilter: workLinkFilters.active as NotionQueryFilter,
		},
	],
]);

function textParam(url: URL, name: "type" | "q"): string | undefined {
	const value = url.searchParams.get(name)?.trim();

	return value && value.length > 0 ? value : undefined;
}

function buildQueryFilter(
	url: URL,
	config: WorkLinkRouteConfig,
): NotionQueryFilter | Response | undefined {
	const companyId = parseNotionIdParam(url, "companyId");

	if (companyId instanceof Response) {
		return companyId;
	}

	const projectId = parseNotionIdParam(url, "projectId");

	if (projectId instanceof Response) {
		return projectId;
	}

	const type = textParam(url, "type");
	const query = textParam(url, "q");

	return combineWorkLinkFilters([
		config.baseFilter,
		companyId ? workLinkFilters.company(companyId) : undefined,
		projectId ? workLinkFilters.project(projectId) : undefined,
		type ? workLinkFilters.type(type) : undefined,
		query ? workLinkFilters.query(query) : undefined,
	]);
}

const WORK_LINK_QUERY_FILTERS = new Set([
	"companyIds",
	"projectIds",
	"types",
	"active",
	"q",
]);

function buildBodyFilter(
	filters: Record<string, unknown>,
	baseFilter?: NotionQueryFilter,
): NotionQueryFilter | Response | undefined {
	const companyIds = parseNotionIdArrayValue(filters.companyIds, "companyIds");
	if (companyIds instanceof Response) return companyIds;

	const projectIds = parseNotionIdArrayValue(filters.projectIds, "projectIds");
	if (projectIds instanceof Response) return projectIds;

	const types = parseStringArrayValue(filters.types, "types");
	if (types instanceof Response) return types;

	const active = parseBooleanValue(filters.active, "active");
	if (active instanceof Response) return active;

	const query = parseStringValue(filters.q, "q");
	if (query instanceof Response) return query;

	return combineWorkLinkFilters([
		baseFilter,
		companyIds ? workLinkFilters.companies(companyIds) : undefined,
		projectIds ? workLinkFilters.projects(projectIds) : undefined,
		types ? workLinkFilters.types(types) : undefined,
		typeof active === "boolean" ? workLinkFilters.activeValue(active) : undefined,
		query ? workLinkFilters.query(query) : undefined,
	]);
}

function parseWorkLinkPageId(pathname: string): string | Response | null {
	const match = pathname.match(/^\/api\/work-links\/([^/]+)$/);

	if (!match) {
		return null;
	}

	let rawPageId: string;

	try {
		rawPageId = decodeURIComponent(match[1]);
	} catch {
		return invalidNotionId("pageId");
	}

	return normalizeNotionId(rawPageId) ?? invalidNotionId("pageId");
}

async function parseMutationBody(request: Request): Promise<Record<string, unknown> | Response> {
	const parsed = await parseJsonRequestBody(request);

	if (parsed instanceof Response) {
		return parsed;
	}

	return isRecord(parsed.value) ? parsed.value : invalidRequest("Expected a JSON object");
}

function mutationHeaders(response: Response): Response {
	const headers = new Headers(response.headers);

	headers.set("Cache-Control", "no-store");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export async function handleWorkLinkRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	const config = workLinkRouteConfigs.get(url.pathname);

	if (url.pathname === "/api/work-links/meta" && request.method === "GET") {
		return Response.json(
			await buildResourceMetadata(env, env.WORK_LINKS_DATA_SOURCE_ID, "work-links", [
				{ key: "link", property: "Link", writable: true },
				{ key: "typeOptionId", property: "Type", writable: true },
				{ key: "url", property: "URL", writable: true },
				{ key: "companyId", property: "Company", writable: true, optionsEndpoint: "/api/companies/active" },
				{ key: "projectId", property: "Project", writable: true, optionsEndpoint: "/api/projects/active" },
				{ key: "notes", property: "Notes", writable: true },
				{ key: "active", property: "Active", writable: true },
			]),
		);
	}

	if (request.method === "POST" && url.pathname === "/api/work-links") {
		const body = await parseMutationBody(request);

		if (body instanceof Response) {
			return body;
		}

		try {
			return mutationHeaders(
				Response.json({ data: await createWorkLink(env, body) }, { status: 201 }),
			);
		} catch (error) {
			if (error instanceof WorkLinkWriteValidationError) {
				return error.response;
			}

			console.error(error);

			return Response.json({ error: "Failed to create Work Link" }, { status: 500 });
		}
	}

	if (request.method === "PATCH") {
		const pageId = parseWorkLinkPageId(url.pathname);

		if (!pageId) {
			return null;
		}

		if (pageId instanceof Response) {
			return pageId;
		}

		const body = await parseMutationBody(request);

		if (body instanceof Response) {
			return body;
		}

		try {
			return mutationHeaders(
				Response.json({ data: await updateWorkLink(env, pageId, body) }),
			);
		} catch (error) {
			if (error instanceof WorkLinkWriteValidationError) {
				return error.response;
			}

			if (error instanceof WorkLinkNotWritableError || error instanceof NotionQueryError) {
				return Response.json({ error: "Work Link not found" }, { status: 404 });
			}

			console.error(error);

			return Response.json({ error: "Failed to update Work Link" }, { status: 500 });
		}
	}

	if (request.method === "QUERY" && config) {
		const query = await parseDomainQueryRequest(request, WORK_LINK_QUERY_FILTERS);

		if (query instanceof Response) {
			return query;
		}

		const filter = buildBodyFilter(query.filters, config.baseFilter);

		if (filter instanceof Response) {
			return filter;
		}

		try {
			return withAcceptQuery(
				Response.json(
					await listWorkLinks(env, filter, {
						includeRelations: query.includeRelations,
						pagination: query.pagination,
					}),
					{ headers: { "Cache-Control": "no-store" } },
				),
			);
		} catch (error) {
			const invalidCursorResponse = query.pagination.cursor
				? invalidPaginationCursorResponse(error)
				: null;

			if (invalidCursorResponse) {
				return invalidCursorResponse;
			}

			console.error(error);

			return Response.json({ error: "Failed to retrieve Work Links" }, { status: 500 });
		}
	}

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
		return withAcceptQuery(
			Response.json(
				await listWorkLinks(env, filter, { includeRelations, pagination }),
			),
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
				error: "Failed to retrieve Work Links",
			},
			{
				status: 500,
			},
		);
	}
}
