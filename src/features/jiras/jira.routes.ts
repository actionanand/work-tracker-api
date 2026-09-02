import type { Env } from "../../shared/env";
import { listJiras } from "./jira.service";

export async function handleJiraRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (request.method !== "GET" || url.pathname !== "/api/jiras") {
		return null;
	}

	try {
		return Response.json(await listJiras(env));
	} catch (error) {
		console.error(error);

		return Response.json(
			{
				error: "Failed to retrieve JIRAs",
			},
			{
				status: 500,
			},
		);
	}
}
