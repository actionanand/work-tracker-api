import type { RateLimitBinding } from "./auth/auth.types";

export interface Env {
	NOTION_TOKEN: string;
	AUTH_PASSWORD_HASH: string;
	AUTH_PASSWORD_SALT: string;
	AUTH_PASSWORD_ITERATIONS?: string;
	AUTH_JWT_SECRET: string;
	AUTH_TOKEN_TTL_SECONDS?: string;
	AUTH_RATE_LIMITER: RateLimitBinding;

	JIRAS_DATA_SOURCE_ID: string;
	SPRINTS_DATA_SOURCE_ID: string;
	SPRINT_ALLOCATIONS_DATA_SOURCE_ID: string;
	PROJECTS_DATA_SOURCE_ID: string;
	COMPANIES_DATA_SOURCE_ID: string;
	TEAMS_DATA_SOURCE_ID: string;

	WORK_LOGS_DATA_SOURCE_ID: string;

	RELEASE_ITEMS_DATA_SOURCE_ID: string;

	FEEDBACK_DATA_SOURCE_ID: string;

	WORK_LINKS_DATA_SOURCE_ID: string;
}
