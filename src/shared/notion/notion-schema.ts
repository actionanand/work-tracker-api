import type { Env } from "../env";
import { getNotionDataSource } from "./notion-client";

interface NotionOption {
	id?: string;
	name?: string;
	color?: string;
}

interface NotionPropertySchema {
	id?: string;
	name?: string;
	type?: string;
	select?: {
		options?: NotionOption[];
	};
	multi_select?: {
		options?: NotionOption[];
	};
	relation?: {
		data_source_id?: string;
		database_id?: string;
	};
}

interface NotionDataSourceSchema {
	properties?: Record<string, NotionPropertySchema>;
}

export interface MetadataField {
	key: string;
	label: string;
	type: string;
	writable: boolean;
	options?: Array<{
		id: string;
		name: string;
		color: string;
	}>;
	optionsEndpoint?: string;
}

export interface FieldMetadataConfig {
	key: string;
	property: string;
	writable: boolean;
	optionsEndpoint?: string;
}

export async function getDataSourceProperties(
	env: Env,
	dataSourceId: string,
): Promise<Record<string, NotionPropertySchema>> {
	const dataSource = await getNotionDataSource<NotionDataSourceSchema>({
		env,
		dataSourceId,
	});

	return dataSource.properties ?? {};
}

export async function buildResourceMetadata(
	env: Env,
	dataSourceId: string,
	resource: string,
	fields: FieldMetadataConfig[],
): Promise<{ resource: string; fields: MetadataField[] }> {
	const properties = await getDataSourceProperties(env, dataSourceId);

	return {
		resource,
		fields: fields.map((field) => {
			const schema = properties[field.property];
			const type = schema?.type ?? "unknown";
			const options = getOptions(schema);

			return {
				key: field.key,
				label: field.property,
				type,
				writable: field.writable && type !== "rollup" && type !== "formula",
				...(options.length ? { options } : {}),
				...(field.optionsEndpoint ? { optionsEndpoint: field.optionsEndpoint } : {}),
			};
		}),
	};
}

export function validateOptionId(
	properties: Record<string, NotionPropertySchema>,
	property: string,
	optionId: string,
): boolean {
	return getOptions(properties[property]).some((option) => option.id === optionId);
}

function getOptions(
	property: NotionPropertySchema | undefined,
): Array<{ id: string; name: string; color: string }> {
	const options =
		property?.type === "multi_select"
			? property.multi_select?.options
			: property?.select?.options;

	return (options ?? []).flatMap((option) => {
		if (!option.id || !option.name) {
			return [];
		}

		return [
			{
				id: option.id,
				name: option.name,
				color: option.color ?? "default",
			},
		];
	});
}
