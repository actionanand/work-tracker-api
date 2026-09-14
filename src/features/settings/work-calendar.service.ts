import type { Env } from "../../shared/env";
import { ensureAllowedFields, invalidRequest } from "../../shared/http/validation";
import { WEEKDAYS, type Weekday } from "../../shared/calendar/weekdays";

export interface WorkCalendarSettings {
	weekOffDays: Weekday[];
}

interface WorkCalendarRow {
	week_off_days: string;
}

export class WorkCalendarValidationError extends Error {
	constructor(readonly response: Response) {
		super("Invalid work-calendar settings request");
		this.name = "WorkCalendarValidationError";
	}
}

const DEFAULT_WEEK_OFF_DAYS: Weekday[] = ["Saturday", "Sunday"];
const WORK_CALENDAR_FIELDS = new Set(["weekOffDays"]);
const weekdaySet = new Set<string>(WEEKDAYS);

export async function getWorkCalendarSettings(env: Env): Promise<WorkCalendarSettings> {
	let row: WorkCalendarRow | null;

	try {
		row = await env.AUTH_DB.prepare(
			"SELECT week_off_days FROM work_calendar_settings WHERE id = 1",
		).first<WorkCalendarRow>();
	} catch (error) {
		if (error instanceof Error && error.message.toLowerCase().includes("no such table")) {
			return { weekOffDays: [...DEFAULT_WEEK_OFF_DAYS] };
		}
		throw error;
	}

	if (!row) return { weekOffDays: [...DEFAULT_WEEK_OFF_DAYS] };

	const parsed = parseStoredWeekdays(row.week_off_days);
	return { weekOffDays: parsed ?? [...DEFAULT_WEEK_OFF_DAYS] };
}

export async function updateWorkCalendarSettings(
	env: Env,
	body: Record<string, unknown>,
): Promise<WorkCalendarSettings> {
	const disallowed = ensureAllowedFields(body, WORK_CALENDAR_FIELDS);
	if (disallowed) throw new WorkCalendarValidationError(disallowed);

	if (!Object.hasOwn(body, "weekOffDays")) {
		throw validationError("Expected weekOffDays", "weekOffDays");
	}

	const weekOffDays = parseWeekdays(body.weekOffDays);
	await env.AUTH_DB.prepare(
		`INSERT INTO work_calendar_settings (id, week_off_days, updated_at)
		 VALUES (1, ?1, ?2)
		 ON CONFLICT(id) DO UPDATE SET
		 	week_off_days = excluded.week_off_days,
		 	updated_at = excluded.updated_at`,
	)
		.bind(JSON.stringify(weekOffDays), Math.floor(Date.now() / 1000))
		.run();

	return { weekOffDays };
}

function parseWeekdays(value: unknown): Weekday[] {
	if (!Array.isArray(value)) {
		throw validationError("Expected an array of weekdays", "weekOffDays");
	}

	const seen = new Set<string>();
	for (const item of value) {
		if (typeof item !== "string" || !weekdaySet.has(item)) {
			throw validationError("Expected exact weekday names Monday through Sunday", "weekOffDays");
		}
		if (seen.has(item)) {
			throw validationError("Week-off days must not contain duplicates", "weekOffDays");
		}
		seen.add(item);
	}

	if (seen.size === WEEKDAYS.length) {
		throw validationError("At least one working day is required", "weekOffDays");
	}

	return WEEKDAYS.filter((weekday) => seen.has(weekday));
}

function parseStoredWeekdays(value: string): Weekday[] | null {
	try {
		const parsed = JSON.parse(value) as unknown;
		return parseWeekdays(parsed);
	} catch {
		return null;
	}
}

function validationError(message: string, field: string): WorkCalendarValidationError {
	return new WorkCalendarValidationError(invalidRequest(message, field));
}
