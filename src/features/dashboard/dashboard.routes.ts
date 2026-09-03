import type { Env } from "../../shared/env";
import { parseNotionIdParam } from "../../shared/notion/notion-id";
import {
	DashboardCompanyNotFoundError,
	DashboardProjectNotFoundError,
	getDashboard,
} from "./dashboard.service";

function parseOptionalNotionId(url: URL, parameter: string) {
	const parsed = parseNotionIdParam(url, parameter);

	return parsed instanceof Response ? parsed : parsed;
}

export async function handleDashboardRoutes(
	request: Request,
	url: URL,
	env: Env,
): Promise<Response | null> {
	if (request.method !== "GET" || url.pathname !== "/api/dashboard") {
		return null;
	}

	const companyId = parseOptionalNotionId(url, "companyId");

	if (companyId instanceof Response) {
		return companyId;
	}

	const projectId = parseOptionalNotionId(url, "projectId");

	if (projectId instanceof Response) {
		return projectId;
	}

	try {
		return Response.json(
			await getDashboard(env, {
				companyId,
				projectId,
			}),
		);
	} catch (error) {
		if (error instanceof DashboardCompanyNotFoundError) {
			return Response.json(
				{
					error: "Company not found",
				},
				{
					status: 404,
				},
			);
		}

		if (error instanceof DashboardProjectNotFoundError) {
			return Response.json(
				{
					error: "Project not found",
				},
				{
					status: 404,
				},
			);
		}

		console.error(error instanceof Error ? error.message : error);

		return Response.json(
			{
				error: "Failed to retrieve Dashboard",
			},
			{
				status: 500,
			},
		);
	}
}
