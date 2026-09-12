export type NotionPageProperties = Record<string, unknown>;

export function titleProperty(value: string): unknown {
	return {
		title: value ? [{ text: { content: value } }] : [],
	};
}

export function richTextProperty(value: string): unknown {
	return {
		rich_text: value ? [{ text: { content: value } }] : [],
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
