import { parseDateValue } from "../../shared/http/validation";
import type { AnalyticsRange } from "./analytics.types";

export const MAX_ANALYTICS_DAYS = 370;
export const DAY_MS = 86400000;

export function parseAnalyticsRange(url: URL): AnalyticsRange | Response {
	const dates: string[] = [];
	for (const parameter of ["from", "to"]) {
		const values = url.searchParams.getAll(parameter);
		const value = values[0];
		const parsed = parseDateValue(value, parameter);
		if (values.length !== 1 || !value || value !== value.trim() || typeof parsed !== "string") {
			return Response.json({ error: "Expected a valid YYYY-MM-DD date", code: "ANALYTICS_DATE_INVALID", parameter }, { status: 400 });
		}
		dates.push(parsed);
	}
	const [from, to] = dates;
	if (from > to) return Response.json({ error: "Analytics from must not exceed to", code: "ANALYTICS_RANGE_INVALID" }, { status: 400 });
	const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
	if (days > MAX_ANALYTICS_DAYS) {
		return Response.json({ error: "Analytics range is too large", code: "ANALYTICS_RANGE_TOO_LARGE", maxDays: MAX_ANALYTICS_DAYS }, { status: 400 });
	}
	return { from, to };
}
