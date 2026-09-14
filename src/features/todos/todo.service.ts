import type { Env } from "../../shared/env";
import type { BulkDeleteResponse } from "../../shared/http/bulk-delete";
import {
	ensureAllowedFields,
	invalidOption,
	invalidRequest,
	parseBooleanValue,
	parseDateValue,
	parseNumberValue,
	parseOptionIdValue,
	parseStringArrayValue,
	parseStringValue,
} from "../../shared/http/validation";
import type { NotionQueryFilter, NotionQuerySort } from "../../shared/notion/notion-client";
import {
	createNotionPage,
	getNotionPage,
	queryNotionDataSource,
	trashNotionPage,
	updateNotionPage,
} from "../../shared/notion/notion-client";
import {
	checkboxProperty,
	dateProperty,
	multiSelectByIdProperty,
	numberProperty,
	richTextProperty,
	selectByIdProperty,
	statusByIdProperty,
	titleProperty,
	type NotionPageProperties,
} from "../../shared/notion/notion-properties";
import {
	pageBelongsToDataSource,
	type NotionPageWithParent,
} from "../../shared/notion/notion-page-ownership";
import {
	getDataSourceProperties,
	getOptionNameById,
	validateOptionId,
} from "../../shared/notion/notion-schema";
import type { PaginationParams } from "../../shared/pagination/pagination";
import {
	TODO_MONTH_ENDS,
	TODO_MONTHS,
	TODO_SCHEDULES,
	TODO_WEEKDAYS,
	type TodoSchedule,
} from "./todo.constants";
import { mapTodo, type NotionTodoPage, type Todo } from "./todo.mapper";

export interface TodoListResponse {
	data: Todo[];
	count: number;
	hasMore: boolean;
	nextCursor: string | null;
}

export class TodoWriteValidationError extends Error {
	constructor(readonly response: Response) {
		super("Invalid Todo write request");
		this.name = "TodoWriteValidationError";
	}
}

export class TodoNotWritableError extends Error {
	constructor() {
		super("Todo page is not writable through this endpoint");
		this.name = "TodoNotWritableError";
	}
}

type TodoState = Pick<
	Todo,
	| "dueDate"
	| "schedule"
	| "repeatOn"
	| "interval"
	| "repeatDay"
	| "repeatMonth"
	| "monthEnd"
	| "repeatStart"
	| "workdayAdjust"
>;

interface ParsedTodoWrite {
	toDo?: string | null;
	statusOptionId?: string | null;
	dueDate?: string | null;
	notes?: string | null;
	scheduleOptionId?: string | null;
	scheduleName?: string | null;
	repeatOnOptionIds?: string[];
	repeatOnNames?: string[];
	interval?: number | null;
	repeatDay?: number | null;
	repeatMonthOptionId?: string | null;
	repeatMonthName?: string | null;
	monthEndOptionId?: string | null;
	monthEndName?: string | null;
	repeatStart?: string | null;
	workdayAdjust?: boolean;
}

const TODO_WRITE_FIELDS = new Set([
	"toDo",
	"statusOptionId",
	"dueDate",
	"notes",
	"scheduleOptionId",
	"repeatOnOptionIds",
	"interval",
	"repeatDay",
	"repeatMonthOptionId",
	"monthEndOptionId",
	"repeatStart",
	"workdayAdjust",
]);

const todoDefaultSorts: NotionQuerySort[] = [
	{ property: "Due Date", direction: "ascending" },
];

const supportedSchedules = new Set<string>(TODO_SCHEDULES);
const supportedWeekdays = new Set<string>(TODO_WEEKDAYS);
const supportedMonths = new Set<string>(TODO_MONTHS);
const supportedMonthEnds = new Set<string>(TODO_MONTH_ENDS);

export async function listTodos(
	env: Env,
	filter?: NotionQueryFilter,
	pagination?: PaginationParams,
): Promise<TodoListResponse> {
	const notion = await queryNotionDataSource<NotionTodoPage>({
		dataSourceId: env.TODOS_DATA_SOURCE_ID,
		env,
		filter,
		sorts: todoDefaultSorts,
		pageSize: pagination?.pageSize,
		startCursor: pagination?.cursor,
	});
	const data = notion.results.map(mapTodo);

	return { data, count: data.length, hasMore: notion.has_more, nextCursor: notion.next_cursor };
}

export async function createTodo(env: Env, body: Record<string, unknown>): Promise<Todo> {
	const properties = await buildTodoProperties(env, body, undefined);
	const page = await createNotionPage<NotionTodoPage>({
		env,
		dataSourceId: env.TODOS_DATA_SOURCE_ID,
		properties,
	});

	return mapTodo(page);
}

export async function updateTodo(
	env: Env,
	pageId: string,
	body: Record<string, unknown>,
): Promise<Todo> {
	const page = await getNotionPage<NotionTodoPage & NotionPageWithParent>({ env, pageId });
	if (!pageBelongsToDataSource(page, env.TODOS_DATA_SOURCE_ID)) throw new TodoNotWritableError();

	const properties = await buildTodoProperties(env, body, mapTodo(page));
	const updated = await updateNotionPage<NotionTodoPage>({ env, pageId, properties });

	return mapTodo(updated);
}

export async function deleteTodo(env: Env, pageId: string): Promise<{ id: string; deleted: true }> {
	const page = await getNotionPage<NotionTodoPage & NotionPageWithParent>({ env, pageId });
	if (!pageBelongsToDataSource(page, env.TODOS_DATA_SOURCE_ID)) throw new TodoNotWritableError();

	await trashNotionPage({ env, pageId });
	return { id: pageId, deleted: true };
}

export async function bulkDeleteTodos(
	env: Env,
	pageIds: string[],
): Promise<BulkDeleteResponse> {
	for (const pageId of pageIds) {
		const page = await getNotionPage<NotionTodoPage & NotionPageWithParent>({ env, pageId });
		if (!pageBelongsToDataSource(page, env.TODOS_DATA_SOURCE_ID)) throw new TodoNotWritableError();
	}

	const failed: BulkDeleteResponse["failed"] = [];
	for (const pageId of pageIds) {
		try {
			await trashNotionPage({ env, pageId });
		} catch {
			failed.push({ id: pageId, deleted: false, error: "Failed to delete page" });
		}
	}

	return {
		requested: pageIds.length,
		deleted: pageIds.length - failed.length,
		failed,
		allSucceeded: failed.length === 0,
	};
}

async function buildTodoProperties(
	env: Env,
	body: Record<string, unknown>,
	existing: Todo | undefined,
): Promise<NotionPageProperties> {
	const disallowed = ensureAllowedFields(body, TODO_WRITE_FIELDS);
	if (disallowed) throw new TodoWriteValidationError(disallowed);

	const schema = await getDataSourceProperties(env, env.TODOS_DATA_SOURCE_ID);
	const parsed = parseTodoWrite(body);
	resolveTodoOptions(parsed, schema);

	if ((!existing && !parsed.toDo) || parsed.toDo === null || parsed.toDo === "") {
		throw validationError("Expected a non-empty string", "toDo");
	}

	const state = existing ? stateFromTodo(existing) : emptyTodoState();
	const previousSchedule = state.schedule;
	applyParsedState(state, parsed);

	const forcedClears = new Set<keyof TodoState>();
	if (existing && parsed.scheduleOptionId !== undefined && previousSchedule !== state.schedule) {
		normalizeScheduleChange(state, parsed.dueDate !== undefined, forcedClears);
	}

	validateTodoState(state);
	return buildNotionProperties(parsed, forcedClears);
}

function parseTodoWrite(body: Record<string, unknown>): ParsedTodoWrite {
	return {
		toDo: parseOrThrow(parseStringValue(body.toDo, "toDo")),
		statusOptionId: parseOrThrow(parseOptionIdValue(body.statusOptionId, "statusOptionId")),
		dueDate: parseOrThrow(parseDateValue(body.dueDate, "dueDate")),
		notes: parseOrThrow(parseStringValue(body.notes, "notes")),
		scheduleOptionId: parseOrThrow(
			parseOptionIdValue(body.scheduleOptionId, "scheduleOptionId"),
		),
		repeatOnOptionIds: parseOrThrow(
			parseStringArrayValue(body.repeatOnOptionIds, "repeatOnOptionIds"),
		),
		interval: parseOrThrow(parseNumberValue(body.interval, "interval")),
		repeatDay: parseOrThrow(parseNumberValue(body.repeatDay, "repeatDay")),
		repeatMonthOptionId: parseOrThrow(
			parseOptionIdValue(body.repeatMonthOptionId, "repeatMonthOptionId"),
		),
		monthEndOptionId: parseOrThrow(
			parseOptionIdValue(body.monthEndOptionId, "monthEndOptionId"),
		),
		repeatStart: parseOrThrow(parseDateValue(body.repeatStart, "repeatStart")),
		workdayAdjust: parseOrThrow(parseBooleanValue(body.workdayAdjust, "workdayAdjust")),
	};
}

function parseOrThrow<T>(value: T | Response): T {
	if (value instanceof Response) throw new TodoWriteValidationError(value);
	return value;
}

function resolveTodoOptions(
	parsed: ParsedTodoWrite,
	schema: Awaited<ReturnType<typeof getDataSourceProperties>>,
): void {
	if (parsed.statusOptionId && !validateOptionId(schema, "Status", parsed.statusOptionId)) {
		throw new TodoWriteValidationError(invalidOption("statusOptionId"));
	}

	parsed.scheduleName = resolveOptionName(
		parsed.scheduleOptionId,
		schema,
		"Schedule",
		"scheduleOptionId",
	);
	parsed.repeatMonthName = resolveOptionName(
		parsed.repeatMonthOptionId,
		schema,
		"Repeat Month",
		"repeatMonthOptionId",
	);
	parsed.monthEndName = resolveOptionName(
		parsed.monthEndOptionId,
		schema,
		"Month End",
		"monthEndOptionId",
	);

	if (parsed.repeatOnOptionIds !== undefined) {
		parsed.repeatOnNames = parsed.repeatOnOptionIds.map((optionId) => {
			const name = getOptionNameById(schema, "Repeat On", optionId);
			if (!name) throw new TodoWriteValidationError(invalidOption("repeatOnOptionIds"));
			return name;
		});
	}
}

function resolveOptionName(
	optionId: string | null | undefined,
	schema: Awaited<ReturnType<typeof getDataSourceProperties>>,
	property: string,
	field: string,
): string | null | undefined {
	if (!optionId) return optionId === undefined ? undefined : null;

	const name = getOptionNameById(schema, property, optionId);
	if (!name) throw new TodoWriteValidationError(invalidOption(field));
	return name;
}

function emptyTodoState(): TodoState {
	return {
		dueDate: null,
		schedule: null,
		repeatOn: [],
		interval: null,
		repeatDay: null,
		repeatMonth: null,
		monthEnd: null,
		repeatStart: null,
		workdayAdjust: false,
	};
}

function stateFromTodo(todo: Todo): TodoState {
	return {
		dueDate: todo.dueDate,
		schedule: todo.schedule,
		repeatOn: [...todo.repeatOn],
		interval: todo.interval,
		repeatDay: todo.repeatDay,
		repeatMonth: todo.repeatMonth,
		monthEnd: todo.monthEnd,
		repeatStart: todo.repeatStart,
		workdayAdjust: todo.workdayAdjust,
	};
}

function applyParsedState(state: TodoState, parsed: ParsedTodoWrite): void {
	if (parsed.dueDate !== undefined) state.dueDate = parsed.dueDate;
	if (parsed.scheduleName !== undefined) state.schedule = parsed.scheduleName;
	if (parsed.repeatOnNames !== undefined) state.repeatOn = parsed.repeatOnNames;
	if (parsed.interval !== undefined) state.interval = parsed.interval;
	if (parsed.repeatDay !== undefined) state.repeatDay = parsed.repeatDay;
	if (parsed.repeatMonthName !== undefined) state.repeatMonth = parsed.repeatMonthName;
	if (parsed.monthEndName !== undefined) state.monthEnd = parsed.monthEndName;
	if (parsed.repeatStart !== undefined) state.repeatStart = parsed.repeatStart;
	if (parsed.workdayAdjust !== undefined) state.workdayAdjust = parsed.workdayAdjust;
}

function normalizeScheduleChange(
	state: TodoState,
	dueDateWasExplicit: boolean,
	forcedClears: Set<keyof TodoState>,
): void {
	if (!state.schedule) {
		clearStateFields(state, forcedClears, [
			"repeatOn",
			"interval",
			"repeatDay",
			"repeatMonth",
			"monthEnd",
			"repeatStart",
			"workdayAdjust",
		]);
		return;
	}

	if (!dueDateWasExplicit) clearStateFields(state, forcedClears, ["dueDate"]);

	const allowedBySchedule: Record<TodoSchedule, Array<keyof TodoState>> = {
		Daily: ["interval", "repeatStart", "workdayAdjust"],
		Weekly: ["repeatOn", "interval", "repeatStart", "workdayAdjust"],
		Monthly: ["repeatDay", "monthEnd", "workdayAdjust"],
		Yearly: ["repeatDay", "repeatMonth", "workdayAdjust"],
	};
	if (!supportedSchedules.has(state.schedule)) return;

	const candidates: Array<keyof TodoState> = [
		"repeatOn",
		"interval",
		"repeatDay",
		"repeatMonth",
		"monthEnd",
		"repeatStart",
	];
	clearStateFields(
		state,
		forcedClears,
		candidates.filter(
			(field) => !allowedBySchedule[state.schedule as TodoSchedule].includes(field),
		),
	);
}

function clearStateFields(
	state: TodoState,
	forcedClears: Set<keyof TodoState>,
	fields: Array<keyof TodoState>,
): void {
	for (const field of fields) {
		if (field === "repeatOn") state.repeatOn = [];
		else if (field === "workdayAdjust") state.workdayAdjust = false;
		else state[field] = null as never;
		forcedClears.add(field);
	}
}

function validateTodoState(state: TodoState): void {
	if (state.interval !== null && (!Number.isInteger(state.interval) || state.interval < 1)) {
		throw validationError("Expected an integer greater than or equal to 1", "interval");
	}
	if (state.repeatDay !== null && !Number.isInteger(state.repeatDay)) {
		throw validationError("Expected an integer", "repeatDay");
	}

	if (!state.schedule) {
		requireEmpty(state.repeatOn, "repeatOnOptionIds", "Schedule is not set");
		requireEmpty(state.interval, "interval", "Schedule is not set");
		requireEmpty(state.repeatDay, "repeatDay", "Schedule is not set");
		requireEmpty(state.repeatMonth, "repeatMonthOptionId", "Schedule is not set");
		requireEmpty(state.monthEnd, "monthEndOptionId", "Schedule is not set");
		requireEmpty(state.repeatStart, "repeatStart", "Schedule is not set");
		if (state.workdayAdjust) {
			throw validationError("Workday Adjust requires a recurring Schedule", "workdayAdjust");
		}
		return;
	}

	if (!supportedSchedules.has(state.schedule)) {
		throw validationError("Unsupported Schedule option", "scheduleOptionId");
	}
	if (state.dueDate !== null) {
		throw validationError("Due Date must be empty for recurring To Dos", "dueDate");
	}

	if (state.schedule === "Daily" || state.schedule === "Weekly") {
		validateIntervalSchedule(state);
	}

	if (state.schedule === "Daily") {
		requireEmpty(state.repeatOn, "repeatOnOptionIds", "Daily Schedule");
		requireEmpty(state.repeatDay, "repeatDay", "Daily Schedule");
		requireEmpty(state.repeatMonth, "repeatMonthOptionId", "Daily Schedule");
		requireEmpty(state.monthEnd, "monthEndOptionId", "Daily Schedule");
		return;
	}

	if (state.schedule === "Weekly") {
		if (state.repeatOn.length === 0) {
			throw validationError("Weekly Schedule requires at least one weekday", "repeatOnOptionIds");
		}
		if (state.repeatOn.some((weekday) => !supportedWeekdays.has(weekday))) {
			throw validationError("Unsupported Repeat On option", "repeatOnOptionIds");
		}
		requireEmpty(state.repeatDay, "repeatDay", "Weekly Schedule");
		requireEmpty(state.repeatMonth, "repeatMonthOptionId", "Weekly Schedule");
		requireEmpty(state.monthEnd, "monthEndOptionId", "Weekly Schedule");
		return;
	}

	if (state.schedule === "Monthly") {
		requireEmpty(state.repeatOn, "repeatOnOptionIds", "Monthly Schedule");
		requireEmpty(state.interval, "interval", "Monthly Schedule");
		requireEmpty(state.repeatStart, "repeatStart", "Monthly Schedule");
		requireEmpty(state.repeatMonth, "repeatMonthOptionId", "Monthly Schedule");
		if ((state.repeatDay === null) === (state.monthEnd === null)) {
			throw validationError(
				"Monthly Schedule requires exactly one of Repeat Day or Month End",
				"repeatDay",
			);
		}
		if (state.repeatDay !== null && (state.repeatDay < 1 || state.repeatDay > 31)) {
			throw validationError("Expected an integer from 1 to 31", "repeatDay");
		}
		if (state.monthEnd !== null && !supportedMonthEnds.has(state.monthEnd)) {
			throw validationError("Unsupported Month End option", "monthEndOptionId");
		}
		return;
	}

	requireEmpty(state.repeatOn, "repeatOnOptionIds", "Yearly Schedule");
	requireEmpty(state.interval, "interval", "Yearly Schedule");
	requireEmpty(state.repeatStart, "repeatStart", "Yearly Schedule");
	requireEmpty(state.monthEnd, "monthEndOptionId", "Yearly Schedule");
	if (!state.repeatMonth || !supportedMonths.has(state.repeatMonth)) {
		throw validationError("Yearly Schedule requires a supported Repeat Month", "repeatMonthOptionId");
	}
	if (state.repeatDay === null) {
		throw validationError("Yearly Schedule requires Repeat Day", "repeatDay");
	}
	const maximumDay = maximumDayForMonth(state.repeatMonth);
	if (state.repeatDay < 1 || state.repeatDay > maximumDay) {
		throw validationError(
			`Expected an integer from 1 to ${maximumDay} for ${state.repeatMonth}`,
			"repeatDay",
		);
	}
}

function validateIntervalSchedule(state: TodoState): void {
	if (state.interval !== null && state.interval > 1 && !state.repeatStart) {
		throw validationError("Repeat Start is required when Interval is greater than 1", "repeatStart");
	}
	if ((state.interval === null || state.interval === 1) && state.repeatStart) {
		throw validationError("Repeat Start requires Interval greater than 1", "repeatStart");
	}
}

function requireEmpty(value: unknown[] | string | number | null, field: string, context: string): void {
	const populated = Array.isArray(value) ? value.length > 0 : value !== null;
	if (populated) throw validationError(`Must be empty for ${context}`, field);
}

function maximumDayForMonth(month: string): number {
	if (month === "February") return 28;
	if (["April", "June", "September", "November"].includes(month)) return 30;
	return 31;
}

function validationError(message: string, field: string): TodoWriteValidationError {
	return new TodoWriteValidationError(invalidRequest(message, field));
}

function buildNotionProperties(
	parsed: ParsedTodoWrite,
	forcedClears: Set<keyof TodoState>,
): NotionPageProperties {
	const properties: NotionPageProperties = {};

	if (parsed.toDo !== undefined) properties["To Do"] = titleProperty(parsed.toDo ?? "");
	if (parsed.statusOptionId !== undefined) properties.Status = statusByIdProperty(parsed.statusOptionId);
	if (parsed.dueDate !== undefined || forcedClears.has("dueDate")) {
		properties["Due Date"] = dateProperty(forcedClears.has("dueDate") ? null : parsed.dueDate ?? null);
	}
	if (parsed.notes !== undefined) properties.Notes = richTextProperty(parsed.notes ?? "");
	if (parsed.scheduleOptionId !== undefined) {
		properties.Schedule = selectByIdProperty(parsed.scheduleOptionId);
	}
	if (parsed.repeatOnOptionIds !== undefined || forcedClears.has("repeatOn")) {
		properties["Repeat On"] = multiSelectByIdProperty(
			forcedClears.has("repeatOn") ? [] : parsed.repeatOnOptionIds ?? [],
		);
	}
	if (parsed.interval !== undefined || forcedClears.has("interval")) {
		properties.Interval = numberProperty(forcedClears.has("interval") ? null : parsed.interval ?? null);
	}
	if (parsed.repeatDay !== undefined || forcedClears.has("repeatDay")) {
		properties["Repeat Day"] = numberProperty(
			forcedClears.has("repeatDay") ? null : parsed.repeatDay ?? null,
		);
	}
	if (parsed.repeatMonthOptionId !== undefined || forcedClears.has("repeatMonth")) {
		properties["Repeat Month"] = selectByIdProperty(
			forcedClears.has("repeatMonth") ? null : parsed.repeatMonthOptionId ?? null,
		);
	}
	if (parsed.monthEndOptionId !== undefined || forcedClears.has("monthEnd")) {
		properties["Month End"] = selectByIdProperty(
			forcedClears.has("monthEnd") ? null : parsed.monthEndOptionId ?? null,
		);
	}
	if (parsed.repeatStart !== undefined || forcedClears.has("repeatStart")) {
		properties["Repeat Start"] = dateProperty(
			forcedClears.has("repeatStart") ? null : parsed.repeatStart ?? null,
		);
	}
	if (parsed.workdayAdjust !== undefined || forcedClears.has("workdayAdjust")) {
		properties["Workday Adjust"] = checkboxProperty(
			forcedClears.has("workdayAdjust") ? false : parsed.workdayAdjust ?? false,
		);
	}

	return properties;
}
