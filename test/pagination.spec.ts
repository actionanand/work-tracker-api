import { describe, expect, it } from "vitest";
import {
	DEFAULT_PAGE_SIZE,
	MAX_PAGE_SIZE,
	MIN_PAGE_SIZE,
	parsePaginationParams,
} from "../src/shared/pagination/pagination";

function parse(path: string) {
	return parsePaginationParams(new URL(`http://example.com${path}`));
}

async function expectInvalidPagination(
	path: string,
	parameter: "pageSize" | "cursor",
	message: string,
) {
	const response = parse(path);

	expect(response).toBeInstanceOf(Response);
	expect((response as Response).status).toBe(400);
	expect(await (response as Response).json()).toEqual({
		error: "Invalid pagination query parameter",
		parameter,
		message,
	});
}

describe("pagination query parsing", () => {
	it("uses the public default page size when no parameters are supplied", () => {
		expect(parse("/api/work-logs")).toEqual({
			pageSize: DEFAULT_PAGE_SIZE,
		});
	});

	it.each([
		["1", MIN_PAGE_SIZE],
		["25", DEFAULT_PAGE_SIZE],
		["100", MAX_PAGE_SIZE],
	])("accepts pageSize=%s", (value, pageSize) => {
		expect(parse(`/api/work-logs?pageSize=${value}`)).toEqual({
			pageSize,
		});
	});

	it.each(["0", "101", "-1", "abc", "10.5", ""])(
		"rejects invalid pageSize=%s",
		async (value) => {
			await expectInvalidPagination(
				`/api/work-logs?pageSize=${encodeURIComponent(value)}`,
				"pageSize",
				"Expected an integer from 1 to 100",
			);
		},
	);

	it("accepts an opaque cursor unchanged after trimming", () => {
		expect(parse("/api/work-logs?cursor=%20opaque.cursor-2%20")).toEqual({
			pageSize: DEFAULT_PAGE_SIZE,
			cursor: "opaque.cursor-2",
		});
	});

	it.each(["", "%20"])("rejects empty cursor=%s", async (value) => {
		await expectInvalidPagination(
			`/api/work-logs?cursor=${value}`,
			"cursor",
			"Expected a non-empty pagination cursor",
		);
	});
});
