import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/shared/env";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const testEnv: Env = {
	NOTION_TOKEN: "test-notion-token",
	JIRAS_DATA_SOURCE_ID: "test-jiras-data-source-id",
};

describe("Work Tracker API worker", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns the root health response", async () => {
		const request = new IncomingRequest("http://example.com/");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, testEnv, ctx);

		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			name: "Work Tracker API",
			status: "ok",
		});
	});

	it("returns 404 when no route matches", async () => {
		const request = new IncomingRequest("http://example.com/missing");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, testEnv, ctx);

		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not found",
		});
	});

	it("queries Notion and maps JIRAs", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				results: [
					{
						id: "jira-page-id",
						created_time: "2026-09-01T10:00:00.000Z",
						last_edited_time: "2026-09-02T10:00:00.000Z",
						properties: {
							"JIRA Key": {
								title: [{ plain_text: "ABC-123" }],
							},
							Summary: {
								rich_text: [{ plain_text: "Fix API response" }],
							},
							Status: {
								status: { name: "Done" },
							},
							Tags: {
								multi_select: [{ name: "api" }, { name: "notion" }],
							},
							Appraisal: {
								checkbox: true,
							},
							Spillover: {
								formula: { boolean: true },
							},
							"Spillover Count": {
								formula: { number: 2 },
							},
							"Spillover Reason": {
								rich_text: [{ plain_text: "Dependency" }],
							},
							"In Active Sprint": {
								formula: { boolean: false },
							},
							"Demo Required": {
								checkbox: true,
							},
							"Demoed Date": {
								date: { start: "2026-09-02" },
							},
							"Demo Notes": {
								rich_text: [{ plain_text: "Shown in sprint review" }],
							},
							Sprints: {
								relation: [{ id: "sprint-id" }],
							},
							Project: {
								relation: [{ id: "project-id" }],
							},
							"Blocked By": {
								relation: [{ id: "blocked-by-id" }],
							},
							"Release Items": {
								relation: [{ id: "release-item-id" }],
							},
						},
					},
				],
				has_more: false,
				next_cursor: null,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const request = new IncomingRequest("http://example.com/api/jiras");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, testEnv, ctx);

		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.notion.com/v1/data_sources/test-jiras-data-source-id/query",
			{
				method: "POST",
				headers: {
					Authorization: "Bearer test-notion-token",
					"Notion-Version": "2026-03-11",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					page_size: 100,
				}),
			},
		);
		expect(await response.json()).toEqual({
			data: [
				{
					id: "jira-page-id",
					createdTime: "2026-09-01T10:00:00.000Z",
					lastEditedTime: "2026-09-02T10:00:00.000Z",
					jiraKey: "ABC-123",
					summary: "Fix API response",
					status: "Done",
					tags: ["api", "notion"],
					appraisal: true,
					spillover: true,
					spilloverCount: 2,
					spilloverReason: "Dependency",
					inActiveSprint: false,
					demoRequired: true,
					demoedDate: "2026-09-02",
					demoNotes: "Shown in sprint review",
					sprintIds: ["sprint-id"],
					projectIds: ["project-id"],
					blockedByIds: ["blocked-by-id"],
					releaseItemIds: ["release-item-id"],
				},
			],
			count: 1,
			hasMore: false,
			nextCursor: null,
		});
	});
});
