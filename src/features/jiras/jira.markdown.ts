function decodeEntities(value: string): string {
	return value
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'");
}

export function htmlToMarkdown(html: string): string {
	let value = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
	value = value.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code) => `\n\n\`\`\`\n${decodeEntities(code.replace(/<[^>]+>/g, ""))}\n\`\`\`\n\n`);
	value = value.replace(/<br\s*\/?>/gi, "\n").replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
	value = value.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) => `\n\n${"#".repeat(Number(level))} ${text}\n\n`);
	value = value.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**").replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*").replace(/<(s|del|strike)[^>]*>([\s\S]*?)<\/\1>/gi, "~~$2~~").replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
	value = value.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
	value = value.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, text) => `\n\n${text.replace(/<[^>]+>/g, "").split("\n").map((line: string) => `> ${line.trim()}`).join("\n")}\n\n`);
	value = value.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n").replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
	value = value.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n");
	value = value.replace(/<[^>]+>/g, "");

	return decodeEntities(value).replace(/\n{3,}/g, "\n\n").trim();
}
