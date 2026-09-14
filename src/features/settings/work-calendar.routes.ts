import type { Env } from "../../shared/env";
import { isRecord, parseJsonRequestBody } from "../../shared/http/request-body";
import { invalidRequest } from "../../shared/http/validation";
import {
	WorkCalendarValidationError,
	getWorkCalendarSettings,
	updateWorkCalendarSettings,
} from "./work-calendar.service";

const WORK_CALENDAR_PATH = "/api/settings/work-calendar";

export async function handleWorkCalendarRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (url.pathname !== WORK_CALENDAR_PATH) return null;

	if (request.method === "GET") {
		try {
			return noStore(Response.json({ data: await getWorkCalendarSettings(env) }));
		} catch (error) {
			console.error(error);
			return noStore(Response.json({ error: "Failed to retrieve work calendar" }, { status: 500 }));
		}
	}

	if (request.method === "PATCH") {
		const parsed = await parseJsonRequestBody(request);
		if (parsed instanceof Response) return noStore(parsed);
		if (!isRecord(parsed.value)) return noStore(invalidRequest("Expected a JSON object"));

		try {
			return noStore(
				Response.json({ data: await updateWorkCalendarSettings(env, parsed.value) }),
			);
		} catch (error) {
			if (error instanceof WorkCalendarValidationError) return noStore(error.response);
			console.error(error);
			return noStore(Response.json({ error: "Failed to update work calendar" }, { status: 500 }));
		}
	}

	return null;
}

function noStore(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", "no-store");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
