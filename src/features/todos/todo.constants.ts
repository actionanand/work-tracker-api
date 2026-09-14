export const TODO_SCHEDULES = ["Daily", "Weekly", "Monthly", "Yearly"] as const;
export { WEEKDAYS as TODO_WEEKDAYS } from "../../shared/calendar/weekdays";
export const TODO_MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;
export const TODO_MONTH_ENDS = ["Last day", "Day before last day"] as const;

export type TodoSchedule = (typeof TODO_SCHEDULES)[number];
