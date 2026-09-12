export interface NotionPageWithParent {
	parent?: {
		type?: string;
		data_source_id?: string;
		database_id?: string;
	};
}

export function pageBelongsToDataSource(
	page: NotionPageWithParent,
	dataSourceId: string,
): boolean {
	return (
		page.parent?.data_source_id === dataSourceId ||
		page.parent?.database_id === dataSourceId
	);
}
