import { handleCompanyRoutes } from "./features/companies/company.routes";
import { handleFeedbackRoutes } from "./features/feedback/feedback.routes";
import { handleProjectRoutes } from "./features/projects/project.routes";
import { handleReleaseRoutes } from "./features/releases/release.routes";
import { handleSprintAllocationRoutes } from "./features/sprint-allocations/sprint-allocation.routes";
import { handleSprintRoutes } from "./features/sprints/sprint.routes";
import { handleTeamRoutes } from "./features/teams/team.routes";
import { handleWorkLinkRoutes } from "./features/work-links/work-link.routes";
import { handleWorkLogRoutes } from "./features/work-logs/work-log.routes";
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

		const companyResponse = await handleCompanyRoutes(request, url, env);

		if (companyResponse) {
			return companyResponse;
		}

		const teamResponse = await handleTeamRoutes(request, url, env);

		if (teamResponse) {
			return teamResponse;
		}

		const projectResponse = await handleProjectRoutes(request, url, env);

		if (projectResponse) {
			return projectResponse;
		}

		const workLogResponse = await handleWorkLogRoutes(request, url, env);

		if (workLogResponse) {
			return workLogResponse;
		}

		const releaseResponse = await handleReleaseRoutes(request, url, env);

		if (releaseResponse) {
			return releaseResponse;
		}

		const feedbackResponse = await handleFeedbackRoutes(request, url, env);

		if (feedbackResponse) {
			return feedbackResponse;
		}

		const workLinkResponse = await handleWorkLinkRoutes(request, url, env);

		if (workLinkResponse) {
			return workLinkResponse;
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
