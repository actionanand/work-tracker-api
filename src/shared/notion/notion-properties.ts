export type NotionPageProperties = Record<string, unknown>;

const NOTION_RICH_TEXT_FRAGMENT_LENGTH = 2_000;

function textFragments(value: string): Array<{ text: { content: string } }> {
	const characters = Array.from(value);
	const fragments: Array<{ text: { content: string } }> = [];

	for (let index = 0; index < characters.length; index += NOTION_RICH_TEXT_FRAGMENT_LENGTH) {
		fragments.push({ text: { content: characters.slice(index, index + NOTION_RICH_TEXT_FRAGMENT_LENGTH).join("") } });
	}

	return fragments;
}

export function titleProperty(value: string): unknown {
	return {
		title: value ? [{ text: { content: value } }] : [],
	};
}

export function richTextProperty(value: string): unknown {
	return {
		rich_text: value ? textFragments(value) : [],
	};
}

export function dateProperty(value: string | null): unknown {
	return {
		date: value ? { start: value } : null,
	};
}

export function urlProperty(value: string | null): unknown {
	return {
		url: value,
	};
}

export function checkboxProperty(value: boolean): unknown {
	return {
		checkbox: value,
	};
}

export function numberProperty(value: number | null): unknown {
	return {
		number: value,
	};
}

export function selectByIdProperty(optionId: string | null): unknown {
	return {
		select: optionId ? { id: optionId } : null,
	};
}

export function statusByIdProperty(optionId: string | null): unknown {
	return {
		status: optionId ? { id: optionId } : null,
	};
}

export function multiSelectByIdProperty(optionIds: string[]): unknown {
	return {
		multi_select: optionIds.map((id) => ({ id })),
	};
}

export function relationProperty(pageIds: string[]): unknown {
	return {
		relation: pageIds.map((id) => ({ id })),
	};
}
