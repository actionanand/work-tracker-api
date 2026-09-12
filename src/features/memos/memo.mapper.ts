interface NotionTextItem {
	plain_text?: string;
}

interface NotionSelectValue {
	name?: string;
}

interface NotionMemoProperty {
	title?: NotionTextItem[];
	select?: NotionSelectValue | null;
	multi_select?: NotionSelectValue[];
	checkbox?: boolean;
}

export interface NotionMemoPage {
	id: string;
	created_time: string;
	last_edited_time: string;
	properties: Record<string, NotionMemoProperty | undefined>;
}

export interface Memo {
	id: string;
	createdTime: string;
	lastEditedTime: string;
	memo: string;
	category: string;
	tags: string[];
	pinned: boolean;
}

export type MemoDetail = Memo & {
	markdown: string;
	truncated: boolean;
	unknownBlockIds: string[];
	textFallback: string;
};

function plainText(items: NotionTextItem[] | undefined): string {
	return (items ?? []).map((item) => item.plain_text ?? "").join("");
}

export function mapMemo(page: NotionMemoPage): Memo {
	const properties = page.properties;

	return {
		id: page.id,
		createdTime: page.created_time,
		lastEditedTime: page.last_edited_time,
		memo: plainText(properties.Memo?.title).trim(),
		category: properties.Category?.select?.name ?? "",
		tags: (properties.Tags?.multi_select ?? []).map((tag) => tag.name ?? "").filter(Boolean),
		pinned: properties.Pinned?.checkbox ?? false,
	};
}
