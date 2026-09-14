interface NotionTextItem {
	plain_text?: string;
}

interface NotionSelectValue {
	name?: string;
}

interface NotionFormulaValue {
	boolean?: boolean | null;
	string?: string | null;
}

interface NotionDateValue {
	start?: string | null;
}

interface NotionTodoProperty {
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	status?: NotionSelectValue | null;
	select?: NotionSelectValue | null;
	multi_select?: NotionSelectValue[];
	date?: NotionDateValue | null;
	number?: number | null;
	checkbox?: boolean;
	formula?: NotionFormulaValue;
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
	schedule: string | null;
	repeatOn: string[];
	interval: number | null;
	repeatDay: number | null;
	repeatMonth: string | null;
	monthEnd: string | null;
	repeatStart: string | null;
	workdayAdjust: boolean;
	recurring: boolean;
	showToday: boolean;
	setupIssue: string;
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
		schedule: properties.Schedule?.select?.name ?? null,
		repeatOn: (properties["Repeat On"]?.multi_select ?? []).flatMap((option) =>
			option.name ? [option.name] : [],
		),
		interval: properties.Interval?.number ?? null,
		repeatDay: properties["Repeat Day"]?.number ?? null,
		repeatMonth: properties["Repeat Month"]?.select?.name ?? null,
		monthEnd: properties["Month End"]?.select?.name ?? null,
		repeatStart: properties["Repeat Start"]?.date?.start ?? null,
		workdayAdjust: properties["Workday Adjust"]?.checkbox ?? false,
		recurring: properties.Recurring?.formula?.boolean ?? false,
		showToday: properties["Show Today"]?.formula?.boolean ?? false,
		setupIssue: properties["Setup Issue"]?.formula?.string ?? "",
	};
}
