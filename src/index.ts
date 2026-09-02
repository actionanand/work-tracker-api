import { handleJiraRoutes } from "./features/jiras/jira.routes";
import type { Env } from "./shared/env";

export default {
	async fetch(
		request: Request,
		env: Env,
		_ctx?: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/") {
			return Response.json({
				name: "Work Tracker API",
				status: "ok",
			});
		}

		const jiraResponse = await handleJiraRoutes(request, url, env);

		if (jiraResponse) {
			return jiraResponse;
		}

		return Response.json(
			{
				error: "Not found",
			},
			{
				status: 404,
			},
		);
	},
};
