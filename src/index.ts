import { handleSprintAllocationRoutes } from "./features/sprint-allocations/sprint-allocation.routes";
import { handleSprintRoutes } from "./features/sprints/sprint.routes";
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

		const sprintResponse = await handleSprintRoutes(request, url, env);

		if (sprintResponse) {
			return sprintResponse;
		}

		const sprintAllocationResponse = await handleSprintAllocationRoutes(
			request,
			url,
			env,
		);

		if (sprintAllocationResponse) {
			return sprintAllocationResponse;
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
