interface NotionTextItem {
	plain_text?: string;
}

interface NotionSelectValue {
	name?: string;
}

interface NotionDateValue {
	start?: string | null;
}

interface NotionRelationItem {
	id: string;
}

interface NotionTaskProperty {
	title?: NotionTextItem[];
	rich_text?: NotionTextItem[];
	status?: NotionSelectValue | null;
	select?: NotionSelectValue | null;
	date?: NotionDateValue | null;
	relation?: NotionRelationItem[];
}

export interface NotionTaskPage {
	id: string;
	created_time: string;
	last_edited_time: string;
	properties: Record<string, NotionTaskProperty | undefined>;
}

export interface Task {
	id: string;
	createdTime: string;
	lastEditedTime: string;
	task: string;
	status: string;
	priority: string;
	responsibility: string;
	requestedBy: string;
	requestedByType: string;
	assignedTo: string;
	assignedToType: string;
	dueDate: string | null;
	followUpDate: string | null;
	completedDate: string | null;
	companyIds: string[];
	jiraIds: string[];
	notes: string;
	outcomeUpdate: string;
}

function plainText(items: NotionTextItem[] | undefined): string {
	return (items ?? []).map((item) => item.plain_text ?? "").join("");
}

function relationIds(items: NotionRelationItem[] | undefined): string[] {
	return (items ?? []).map((item) => item.id);
}

export function mapTask(page: NotionTaskPage): Task {
	const properties = page.properties;

	return {
		id: page.id,
		createdTime: page.created_time,
		lastEditedTime: page.last_edited_time,
		task: plainText(properties.Task?.title).trim(),
		status: properties.Status?.status?.name ?? "",
		priority: properties.Priority?.select?.name ?? "",
		responsibility: properties.Responsibility?.select?.name ?? "",
		requestedBy: plainText(properties["Requested By"]?.rich_text).trim(),
		requestedByType: properties["Requested By Type"]?.select?.name ?? "",
		assignedTo: plainText(properties["Assigned To"]?.rich_text).trim(),
		assignedToType: properties["Assigned To Type"]?.select?.name ?? "",
		dueDate: properties["Due Date"]?.date?.start ?? null,
		followUpDate: properties["Follow-up Date"]?.date?.start ?? null,
		completedDate: properties["Completed Date"]?.date?.start ?? null,
		companyIds: relationIds(properties.Company?.relation),
		jiraIds: relationIds(properties.JIRAs?.relation),
		notes: plainText(properties.Notes?.rich_text).trim(),
		outcomeUpdate: plainText(properties["Outcome / Update"]?.rich_text).trim(),
	};
}
