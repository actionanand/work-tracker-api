import type { Env } from "../../shared/env";
import { noStore } from "../../shared/http/managed-write";
import { getAnalytics } from "./analytics.service";
import { parseAnalyticsRange } from "./analytics.validation";

export async function handleAnalyticsRoutes(request: Request, url: URL, env: Env): Promise<Response | null> {
	if (url.pathname !== "/api/analytics") return null;
	if (request.method !== "GET") return noStore(Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET, OPTIONS" } }));
	const range = parseAnalyticsRange(url);
	if (range instanceof Response) return noStore(range);
	try {
		return noStore(Response.json(await getAnalytics(env, range)));
	} catch {
		console.error("ANALYTICS_UPSTREAM_ERROR");
		return noStore(Response.json({ error: "Analytics data is temporarily unavailable", code: "ANALYTICS_UPSTREAM_ERROR" }, { status: 502 }));
	}
}
