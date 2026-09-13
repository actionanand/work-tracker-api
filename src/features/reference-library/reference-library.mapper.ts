interface NotionTextItem {
	plain_text?: string;
}

interface NotionSelectValue {
	name?: string;
}

interface NotionReferenceLibraryProperty {
	title?: NotionTextItem[];
	select?: NotionSelectValue | null;
	multi_select?: NotionSelectValue[];
}

export interface NotionReferenceLibraryPage {
	id: string;
	created_time?: string;
	last_edited_time?: string;
	properties: Record<string, NotionReferenceLibraryProperty | undefined>;
}

export interface ReferenceLibraryItem {
	id: string;
	article: string;
	category: string | null;
	tags: string[];
	createdTime: string | null;
	lastEditedTime: string | null;
}

function plainText(items: NotionTextItem[] | undefined): string {
	return (items ?? []).map((item) => item.plain_text ?? "").join("");
}

export function mapReferenceLibraryItem(
	page: NotionReferenceLibraryPage,
): ReferenceLibraryItem {
	const properties = page.properties;

	return {
		id: page.id,
		article: plainText(properties.Article?.title).trim(),
		category: properties.Category?.select?.name ?? null,
		tags: (properties.Tags?.multi_select ?? [])
			.map((tag) => tag.name ?? "")
			.filter(Boolean),
		createdTime: page.created_time ?? null,
		lastEditedTime: page.last_edited_time ?? null,
	};
}
