interface FenceState {
	character: "`" | "~";
	length: number;
}

export function normalizeReferenceMarkdownForDisplay(markdown: string): string {
	const parts = markdown.split(/(\r\n|\n|\r)/);
	let fence: FenceState | null = null;

	for (let index = 0; index < parts.length; index += 2) {
		const line = parts[index];

		if (fence) {
			if (isClosingFence(line, fence)) fence = null;
			continue;
		}

		const openingFence = parseOpeningFence(line);
		if (openingFence) {
			fence = openingFence;
			continue;
		}

		if (/^[\t ]*<empty-block\/>[\t ]*$/.test(line)) {
			parts[index] = "";
		}
	}

	return parts.join("");
}

function parseOpeningFence(line: string): FenceState | null {
	const match = line.match(/^[\t ]{0,3}(`{3,}|~{3,})(.*)$/);
	if (!match) return null;

	return {
		character: match[1][0] as FenceState["character"],
		length: match[1].length,
	};
}

function isClosingFence(line: string, fence: FenceState): boolean {
	const match = line.match(/^[\t ]{0,3}(`+|~+)[\t ]*$/);

	return Boolean(
		match && match[1][0] === fence.character && match[1].length >= fence.length,
	);
}
