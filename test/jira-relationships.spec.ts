import { afterEach, describe, expect, it, vi } from "vitest";
import { buildJiraRelationships } from "../src/features/jiras/jira.relationships";
import type { Jira } from "../src/features/jiras/jira.mapper";
import type { Env } from "../src/shared/env";

const env = {
	NOTION_TOKEN: "test-notion-token",
	JIRAS_DATA_SOURCE_ID: "jiras-data-source-id",
} as Env;

function jiraPage(
	id: string,
	key: string,
	linkType: string | null,
	linkedJiraIds: string[],
) {
	return {
		id,
		parent: { data_source_id: env.JIRAS_DATA_SOURCE_ID },
		created_time: "2026-09-01T00:00:00.000Z",
		last_edited_time: "2026-09-01T00:00:00.000Z",
		properties: {
			"JIRA Key": { title: [{ plain_text: key }] },
			Summary: { rich_text: [{ plain_text: `${key} summary` }] },
			Status: { status: { name: "Open" } },
			"Linked JIRA": { relation: linkedJiraIds.map((relatedId) => ({ id: relatedId })) },
			"Link Type": linkType ? { select: { name: linkType } } : undefined,
			"Link Reason": { rich_text: [{ plain_text: "Reason from source" }] },
			"Linked On": { date: { start: "2026-09-02" } },
			"Resolved On": { date: { start: "2026-09-03" } },
		},
	};
}

const current: Jira = {
	id: "current-id",
	createdTime: "2026-09-01T00:00:00.000Z",
	lastEditedTime: "2026-09-01T00:00:00.000Z",
	jiraKey: "CRI-1",
	summary: "Current",
	status: "Open",
	tags: [],
	appraisal: false,
	spillover: false,
	spilloverCount: 0,
	description: "",
	firstSprintStart: null,
	inActiveSprint: false,
	demoRequired: false,
	demoedDate: null,
	demoNotes: "",
	sprintIds: [],
	projectIds: [],
	linkedJiraIds: ["target-id"],
	linkedFromIds: ["source-a", "source-b", "source-c"],
	linkType: "Blocks",
	linkReason: "Current-source reason",
	linkedOn: "2026-09-01",
	resolvedOn: null,
	releaseItemIds: [],
};

describe("JIRA relationship detail", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("uses source metadata and correct incoming/outgoing display semantics", async () => {
		const pages = new Map([
			["target-id", jiraPage("target-id", "CRI-2", null, [])],
			["source-a", jiraPage("source-a", "CRI-3", "Blocks", [current.id])],
			[
				"source-b",
				jiraPage("source-b", "CRI-4", "Dependency for", [current.id]),
			],
			[
				"source-c",
				jiraPage("source-c", "CRI-5", "Related to", [current.id]),
			],
		]);
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) => {
				const pageId = url.split("/").at(-1) ?? "";
				return Promise.resolve(Response.json(pages.get(pageId)));
			}),
		);

		const relationships = await buildJiraRelationships(env, current);

		expect(relationships).toMatchObject([
			{
				direction: "outgoing",
				storedType: "Blocks",
				displayType: "Blocks",
				otherJira: { id: "target-id", key: "CRI-2" },
				reason: "Current-source reason",
				resolvedOn: null,
			},
			{ direction: "incoming", storedType: "Blocks", displayType: "Blocked by" },
			{
				direction: "incoming",
				storedType: "Dependency for",
				displayType: "Depends on",
			},
			{ direction: "incoming", storedType: "Related to", displayType: "Related to" },
		]);
		expect(relationships.slice(1).every((relationship) => relationship.reason === "Reason from source")).toBe(true);
		expect(relationships.slice(1).every((relationship) => relationship.resolvedOn === "2026-09-03")).toBe(true);
	});

	it("ignores a linked page outside the JIRAs data source", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				Response.json({
					...jiraPage("outside-id", "CRI-9", "Blocks", []),
					parent: { data_source_id: "another-data-source-id" },
				}),
			),
		);

		const relationships = await buildJiraRelationships(env, {
			...current,
			linkedJiraIds: ["outside-id"],
			linkedFromIds: [],
		});

		expect(relationships).toEqual([]);
		expect(warn).toHaveBeenCalledWith(
			"Ignoring linked page outside the JIRAs data source",
			{ pageId: "outside-id" },
		);
	});
});
