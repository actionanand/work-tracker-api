import type { Env } from "../../shared/env";
import type {
	NotionQueryFilter,
	NotionQuerySort,
} from "../../shared/notion/notion-client";
import {
	createNotionPage,
	getNotionPage,
	queryNotionDataSource,
	updateNotionPage,
} from "../../shared/notion/notion-client";
import {
	checkboxProperty,
	relationProperty,
	richTextProperty,
	selectByIdProperty,
	titleProperty,
	type NotionPageProperties,
	urlProperty,
} from "../../shared/notion/notion-properties";
import {
	pageBelongsToDataSource,
	type NotionPageWithParent,
} from "../../shared/notion/notion-page-ownership";
import {
	getDataSourceProperties,
	validateOptionId,
} from "../../shared/notion/notion-schema";
import {
	ensureAllowedFields,
	invalidOption,
	invalidRequest,
	parseBooleanValue,
	parseNotionIdValue,
	parseOptionIdValue,
	parseStringValue,
} from "../../shared/http/validation";
import {
	enrichWorkLinks,
	type EnrichedWorkLink,
	type IncludeRelationsOption,
} from "../../shared/relations/relation-enrichment";
import type { PaginationParams } from "../../shared/pagination/pagination";
import {
	mapWorkLink,
	type NotionWorkLinkPage,
	type WorkLink,
} from "./work-link.mapper";

export interface WorkLinkListResponse<TWorkLink = WorkLink> {
	data: TWorkLink[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export class WorkLinkWriteValidationError extends Error {
	constructor(readonly response: Response) {
		super("Invalid Work Link write request");
		this.name = "WorkLinkWriteValidationError";
	}
}

export class WorkLinkNotWritableError extends Error {
	constructor() {
		super("Work Link page is not writable through this endpoint");
		this.name = "WorkLinkNotWritableError";
	}
}

export const workLinkDefaultSorts: NotionQuerySort[] = [
	{
		property: "Link",
		direction: "ascending",
	},
];

export async function listWorkLinks(
	env: Env,
	filter?: NotionQueryFilter,
	options: IncludeRelationsOption & { pagination?: PaginationParams } = {},
): Promise<WorkLinkListResponse<WorkLink | EnrichedWorkLink>> {
	const notion = await queryNotionDataSource<NotionWorkLinkPage>({
		dataSourceId: env.WORK_LINKS_DATA_SOURCE_ID,
		env,
		filter,
		sorts: workLinkDefaultSorts,
		pageSize: options.pagination?.pageSize,
		startCursor: options.pagination?.cursor,
	});

	const data = notion.results.map(mapWorkLink);
	const responseData = options.includeRelations
		? await enrichWorkLinks(env, data)
		: data;

	return {
		data: responseData,
		count: responseData.length,
		hasMore: notion.has_more,
		nextCursor: notion.next_cursor,
	};
}

const WORK_LINK_WRITE_FIELDS = new Set([
	"link",
	"typeOptionId",
	"url",
	"companyId",
	"projectId",
	"notes",
	"active",
]);

export async function createWorkLink(
	env: Env,
	body: Record<string, unknown>,
): Promise<WorkLink> {
	const properties = await buildWorkLinkProperties(env, body);
	const page = await createNotionPage<NotionWorkLinkPage>({
		env,
		dataSourceId: env.WORK_LINKS_DATA_SOURCE_ID,
		properties,
	});

	return mapWorkLink(page);
}

export async function updateWorkLink(
	env: Env,
	pageId: string,
	body: Record<string, unknown>,
): Promise<WorkLink> {
	const page = await getNotionPage<NotionWorkLinkPage & NotionPageWithParent>({
		env,
		pageId,
	});

	if (!pageBelongsToDataSource(page, env.WORK_LINKS_DATA_SOURCE_ID)) {
		throw new WorkLinkNotWritableError();
	}

	const properties = await buildWorkLinkProperties(env, body);
	const updated = await updateNotionPage<NotionWorkLinkPage>({
		env,
		pageId,
		properties,
	});

	return mapWorkLink(updated);
}

async function buildWorkLinkProperties(
	env: Env,
	body: Record<string, unknown>,
): Promise<NotionPageProperties> {
	const disallowed = ensureAllowedFields(body, WORK_LINK_WRITE_FIELDS);

	if (disallowed) {
		throw new WorkLinkWriteValidationError(disallowed);
	}

	const schema = await getDataSourceProperties(env, env.WORK_LINKS_DATA_SOURCE_ID);
	const properties: NotionPageProperties = {};

	const link = parseStringValue(body.link, "link");
	if (link instanceof Response) throw new WorkLinkWriteValidationError(link);
	if (link !== undefined && link !== null) properties.Link = titleProperty(link);

	const type = parseOptionIdValue(body.typeOptionId, "typeOptionId");
	if (type instanceof Response) throw new WorkLinkWriteValidationError(type);
	if (type !== undefined) {
		if (type && !validateOptionId(schema, "Type", type)) {
			throw new WorkLinkWriteValidationError(invalidOption("typeOptionId"));
		}
		properties.Type = selectByIdProperty(type);
	}

	const url = parseStringValue(body.url, "url");
	if (url instanceof Response) throw new WorkLinkWriteValidationError(url);
	if (url !== undefined) {
		if (url !== null && url.length > 0) {
			try {
				new URL(url);
			} catch {
				throw new WorkLinkWriteValidationError(invalidRequest("Expected a valid URL", "url"));
			}
		}
		properties.URL = urlProperty(url && url.length > 0 ? url : null);
	}

	const companyId = parseNotionIdValue(body.companyId, "companyId");
	if (companyId instanceof Response) throw new WorkLinkWriteValidationError(companyId);
	if (companyId !== undefined) properties.Company = relationProperty(companyId ? [companyId] : []);

	const projectId = parseNotionIdValue(body.projectId, "projectId");
	if (projectId instanceof Response) throw new WorkLinkWriteValidationError(projectId);
	if (projectId !== undefined) properties.Project = relationProperty(projectId ? [projectId] : []);

	const notes = parseStringValue(body.notes, "notes");
	if (notes instanceof Response) throw new WorkLinkWriteValidationError(notes);
	if (notes !== undefined && notes !== null) properties.Notes = richTextProperty(notes);

	const active = parseBooleanValue(body.active, "active");
	if (active instanceof Response) throw new WorkLinkWriteValidationError(active);
	if (active !== undefined) properties.Active = checkboxProperty(active);

	return properties;
}
