import type { Env } from "../../shared/env";
import { checked, domainError, ManagedWriteError } from "../../shared/http/managed-write";
import { ensureAllowedFields, invalidRequest } from "../../shared/http/validation";

export const ALTER_CONTROL_TTL_SECONDS = 30 * 60;
export type AlterControl = "sprint" | "releaseManagement";

interface AlterControlRow {
	alter_sprint_enabled_until: number | null;
	alter_release_enabled_until: number | null;
}

const columns = {
	sprint: "alter_sprint_enabled_until",
	releaseManagement: "alter_release_enabled_until",
} as const;

async function readControls(env: Env): Promise<AlterControlRow | null> {
	return env.AUTH_DB.prepare(
		"SELECT alter_sprint_enabled_until, alter_release_enabled_until FROM alter_controls WHERE id = 1",
	).first<AlterControlRow>();
}

function controlState(until: number | null | undefined, now: number) {
	const enabled = typeof until === "number" && until > now;
	return {
		enabled,
		activeUntil: enabled ? new Date(until * 1000).toISOString() : null,
		remainingSeconds: enabled ? until - now : 0,
	};
}

export async function getAlterControls(env: Env) {
	const row = await readControls(env);
	const now = Math.floor(Date.now() / 1000);
	return {
		alterSprint: controlState(row?.alter_sprint_enabled_until, now),
		alterReleaseManagement: controlState(row?.alter_release_enabled_until, now),
		ttlSeconds: ALTER_CONTROL_TTL_SECONDS,
		serverTime: new Date(now * 1000).toISOString(),
	};
}

export async function updateAlterControls(env: Env, body: Record<string, unknown>) {
	checked(ensureAllowedFields(body, new Set(["control", "enabled"])));
	if (body.control !== "sprint" && body.control !== "releaseManagement") {
		throw new ManagedWriteError(invalidRequest("Expected sprint or releaseManagement", "control"));
	}
	if (typeof body.enabled !== "boolean") {
		throw new ManagedWriteError(invalidRequest("Expected a boolean", "enabled"));
	}
	const now = Math.floor(Date.now() / 1000);
	const until = body.enabled ? now + ALTER_CONTROL_TTL_SECONDS : null;
	const column = columns[body.control];
	// Only the selected column is updated, preserving the independent control.
	await env.AUTH_DB.prepare(
		`INSERT INTO alter_controls (id, ${column}, updated_at) VALUES (1, ?1, ?2)
		 ON CONFLICT(id) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`,
	).bind(until, now).run();
	return getAlterControls(env);
}

async function requireControl(env: Env, control: AlterControl): Promise<void> {
	const row = await readControls(env);
	const until = row?.[columns[control]];
	if (typeof until === "number" && until > Math.floor(Date.now() / 1000)) return;
	throw control === "sprint"
		? domainError(403, "Alter Sprint is disabled", "ALTER_SPRINT_DISABLED")
		: domainError(403, "Alter Release Management is disabled", "ALTER_RELEASE_MANAGEMENT_DISABLED");
}

export const requireAlterSprint = (env: Env) => requireControl(env, "sprint");
export const requireAlterReleaseManagement = (env: Env) => requireControl(env, "releaseManagement");
