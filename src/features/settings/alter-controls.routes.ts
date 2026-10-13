import type { Env } from "../../shared/env";
import { managedResponse, mutationBody } from "../../shared/http/managed-write";
import { getAlterControls, updateAlterControls } from "./alter-controls.service";

export async function handleAlterControlRoutes(request: Request, url: URL, env: Env): Promise<Response | null> {
	if (url.pathname !== "/api/settings/alter-controls") return null;
	if (request.method === "GET") {
		return managedResponse(async () => Response.json({ data: await getAlterControls(env) }), "Failed to retrieve alter controls");
	}
	if (request.method === "PATCH") {
		return managedResponse(async () => Response.json({ data: await updateAlterControls(env, await mutationBody(request)) }), "Failed to update alter controls");
	}
	return null;
}
