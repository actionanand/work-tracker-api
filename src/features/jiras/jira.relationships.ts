import type { Env } from "../../shared/env";
import {
	getNotionPage,
	NotionQueryError,
} from "../../shared/notion/notion-client";
import {
	pageBelongsToDataSource,
	type NotionPageWithParent,
} from "../../shared/notion/notion-page-ownership";
import { mapJira, type Jira, type NotionJiraPage } from "./jira.mapper";

export interface JiraRelationship {
	direction: "incoming" | "outgoing";
	storedType: string;
	displayType: string;
	otherJira: {
		id: string;
		key: string;
		summary: string;
		status: string | null;
	};
	reason: string;
	linkedOn: string | null;
	resolvedOn: string | null;
}

type JiraPage = NotionJiraPage & NotionPageWithParent;

function incomingDisplayType(storedType: string): string {
	if (storedType === "Blocks") return "Blocked by";
	if (storedType === "Dependency for") return "Depends on";
	return storedType;
}

function toOtherJira(jira: Jira): JiraRelationship["otherJira"] {
	return {
		id: jira.id,
		key: jira.jiraKey,
		summary: jira.summary,
		status: jira.status,
	};
}

async function loadJira(env: Env, pageId: string): Promise<Jira | null> {
	try {
		const page = await getNotionPage<JiraPage>({ env, pageId });

		if (!pageBelongsToDataSource(page, env.JIRAS_DATA_SOURCE_ID)) {
			console.warn("Ignoring linked page outside the JIRAs data source", { pageId });
			return null;
		}

		return mapJira(page);
	} catch (error) {
		if (error instanceof NotionQueryError && error.status === 404) {
			console.warn("Ignoring unavailable linked JIRA page", { pageId });
			return null;
		}

		throw error;
	}
}

export async function buildJiraRelationships(
	env: Env,
	currentJira: Jira,
): Promise<JiraRelationship[]> {
	const [outgoingPages, incomingPages] = await Promise.all([
		Promise.all(currentJira.linkedJiraIds.map((id) => loadJira(env, id))),
		Promise.all(currentJira.linkedFromIds.map((id) => loadJira(env, id))),
	]);
	const outgoing = outgoingPages.flatMap((target) => {
		if (!target || !currentJira.linkType) return [];

		return [{
			direction: "outgoing" as const,
			storedType: currentJira.linkType,
			displayType: currentJira.linkType,
			otherJira: toOtherJira(target),
			reason: currentJira.linkReason,
			linkedOn: currentJira.linkedOn,
			resolvedOn: currentJira.resolvedOn,
		}];
	});
	const incoming = incomingPages.flatMap((source) => {
		if (!source || !source.linkedJiraIds.includes(currentJira.id) || !source.linkType) {
			return [];
		}

		return [{
			direction: "incoming" as const,
			storedType: source.linkType,
			displayType: incomingDisplayType(source.linkType),
			otherJira: toOtherJira(source),
			reason: source.linkReason,
			linkedOn: source.linkedOn,
			resolvedOn: source.resolvedOn,
		}];
	});

	return [...outgoing, ...incoming];
}
