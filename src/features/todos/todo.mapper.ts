interface NotionTextItem {
	plain_text?: string;
}

interface NotionSelectValue {
	name?: string;
}

interface NotionDateValue {
	start?: string | null;
}

interface NotionTodoProperty {
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	status?: NotionSelectValue | null;
	date?: NotionDateValue | null;
}

export interface NotionTodoPage {
	id: string;
	created_time: string;
	last_edited_time: string;
	properties: Record<string, NotionTodoProperty | undefined>;
}

export interface Todo {
	id: string;
	createdTime: string;
	lastEditedTime: string;
	toDo: string;
	status: string;
	dueDate: string | null;
	notes: string;
}

export function plainText(items: NotionTextItem[] | undefined): string {
	return (items ?? []).map((item) => item.plain_text ?? "").join("");
}

export function mapTodo(page: NotionTodoPage): Todo {
	const properties = page.properties;

	return {
		id: page.id,
		createdTime: page.created_time,
		lastEditedTime: page.last_edited_time,
		toDo: plainText(properties["To Do"]?.title).trim(),
		status: properties.Status?.status?.name ?? "",
		dueDate: properties["Due Date"]?.date?.start ?? null,
		notes: plainText(properties.Notes?.rich_text).trim(),
	};
}
