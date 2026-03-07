import resolveRefs from "roamjs-components/dom/resolveRefs";

type RoamBlock = {
	string: string;
	uid: string;
	order: number;
	children: RoamBlock[];
};

type RoamPage = {
	title: string;
	uid: string;
	children: RoamBlock[];
};

type BacklinkResult = {
	blockUid: string;
	pageUid: string;
	pageTitle: string;
};

type BacklinksByPage = {
	pageUid: string;
	pageTitle: string;
	blocks: RoamBlock[];
};

type RoamAlphaAPI = {
	pull: (pattern: string, reference: [string, string]) => any;
	q: (query: string, ...inputs: any[]) => any[][];
};

export type ReferencesExportPayload = {
	title: string;
	contentBlocks: RoamBlock[];
	backlinksByPage: BacklinksByPage[];
};

export type ReferencesExportResult = {
	success: boolean;
	error?: string;
	markdown?: string;
};

export type BacklinksSectionResult = {
	success: boolean;
	error?: string;
	section?: string;
};

function getRoamAPI(): RoamAlphaAPI | null {
	const api = (window as any)?.roamAlphaAPI;
	if (!api?.pull || !api?.q) {
		return null;
	}
	return api as RoamAlphaAPI;
}

function normalizeResolvedAliasLinks(input: string) {
	return input.replace(
		/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gm,
		function (_match, aliasLabel: string, url: string) {
			if (
				url.includes("/page/") ||
				url.includes("/#/app/") ||
				url.includes("roamresearch.com")
			) {
				return aliasLabel;
			}
			return _match;
		}
	);
}

function resolveNestedBlockReferences(text: string): string {
	let output = text;
	const blockRefPattern = /\(\(([A-Za-z0-9_-]{9})\)\)/;

	for (let depth = 0; depth < 8; depth++) {
		if (!blockRefPattern.test(output)) {
			break;
		}

		const resolved = normalizeResolvedAliasLinks(resolveRefs(output));
		if (resolved === output) {
			break;
		}

		output = resolved;
	}

	return output;
}

function normalizeTodoStateMarkers(text: string): string {
	return text
		.replace(
			/^(\s*)(?:\{\{\[\[TODO\]\]\}\}|\[\[TODO\]\]|TODO)\s*/i,
			"$1[ ] "
		)
		.replace(
			/^(\s*)(?:\{\{\[\[DONE\]\]\}\}|\[\[DONE\]\]|DONE)\s*/i,
			"$1[x] "
		)
		.replace(
			/^(\s*)(?:\{\{\[\[ARCHIVED\]\]\}\}|\[\[ARCHIVED\]\]|ARCHIVED)\s*(.*)$/i,
			function (_match, indent: string, content: string) {
				const trimmedContent = content.trim();
				return trimmedContent.length > 0
					? `${indent}~~[ ] ${trimmedContent}~~`
					: `${indent}~~[ ]~~`;
			}
		);
}

function normalizeExportBlockText(text: string): string {
	return normalizeTodoStateMarkers(resolveNestedBlockReferences(text));
}

function extractUid(value: unknown): string | null {
	if (typeof value === "string" && value.trim().length > 0) {
		return value.trim();
	}

	if (Array.isArray(value) && value.length > 1) {
		return extractUid(value[1]);
	}

	if (value && typeof value === "object") {
		const candidate =
			(value as Record<string, unknown>)?.[":block/uid"] ??
			(value as Record<string, unknown>)?.uid ??
			(value as Record<string, unknown>)?.id;
		return extractUid(candidate);
	}

	return null;
}

function normalizeChildren(rawChildren: unknown): RoamBlock[] {
	if (!Array.isArray(rawChildren)) {
		return [];
	}

	return rawChildren
		.map((entry) => normalizePulledBlock(entry))
		.filter((entry): entry is RoamBlock => Boolean(entry))
		.sort((a, b) => a.order - b.order);
}

function normalizePulledBlock(entry: unknown): RoamBlock | null {
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
		return null;
	}

	const record = entry as Record<string, unknown>;
	const uid = extractUid(record[":block/uid"]) ?? "";
	const rawStringValue =
		typeof record[":block/string"] === "string" ? record[":block/string"] : "";
	const stringValue = normalizeExportBlockText(rawStringValue);
	const order =
		typeof record[":block/order"] === "number" ? record[":block/order"] : 0;

	return {
		string: stringValue,
		uid,
		order,
		children: normalizeChildren(record[":block/children"]),
	};
}

function isPage(uid: string): boolean {
	const api = getRoamAPI();
	if (!api) {
		return false;
	}

	const result = api.pull("[:node/title :block/string]", [":block/uid", uid]);
	return Boolean(result && typeof result[":node/title"] === "string");
}

function getPageByUid(uid: string): RoamPage | null {
	const api = getRoamAPI();
	if (!api) {
		return null;
	}

	const result = api.pull(
		`[:node/title :block/uid
		  {:block/children [:block/string :block/uid :block/order
							{:block/children ...}]}]`,
		[":block/uid", uid]
	);

	if (!result) {
		return null;
	}

	const title =
		typeof result[":node/title"] === "string" ? result[":node/title"] : "";
	const pageUid = extractUid(result[":block/uid"]) ?? uid;

	return {
		title,
		uid: pageUid,
		children: normalizeChildren(result[":block/children"]),
	};
}

function getBlockByUid(uid: string): RoamBlock | null {
	const api = getRoamAPI();
	if (!api) {
		return null;
	}

	const result = api.pull(
		`[:block/string :block/uid :block/order
		  {:block/children [:block/string :block/uid :block/order
							{:block/children ...}]}]`,
		[":block/uid", uid]
	);

	if (!result) {
		return null;
	}

	const normalized = normalizePulledBlock(result);
	if (!normalized) {
		return null;
	}

	return normalized;
}

function getPageUidForUid(uid: string): string | null {
	const api = getRoamAPI();
	if (!api) {
		return null;
	}

	const result = api.pull(
		"[:node/title :block/uid {:block/page [:block/uid]}]",
		[":block/uid", uid]
	);
	if (!result) {
		return null;
	}

	if (typeof result[":node/title"] === "string") {
		return extractUid(result[":block/uid"]) ?? uid;
	}

	return extractUid(result[":block/page"]);
}

function findBacklinks(targetUid: string): BacklinkResult[] {
	const api = getRoamAPI();
	if (!api) {
		return [];
	}

	const results = api.q(
		`[:find ?ref-uid ?page-title ?page-uid
		  :in $ ?target-uid
		  :where
		  [?target :block/uid ?target-uid]
		  [?ref :block/refs ?target]
		  [?ref :block/uid ?ref-uid]
		  [?ref :block/page ?page]
		  [?page :node/title ?page-title]
		  [?page :block/uid ?page-uid]]`,
		targetUid
	);

	return (results || [])
		.map((row) => {
			if (!Array.isArray(row)) {
				return null;
			}
			const [blockUid, pageTitle, pageUid] = row;
			if (
				typeof blockUid !== "string" ||
				typeof pageTitle !== "string" ||
				typeof pageUid !== "string"
			) {
				return null;
			}
			return { blockUid, pageTitle, pageUid };
		})
		.filter((entry): entry is BacklinkResult => Boolean(entry));
}

function groupAndLoadBacklinks(backlinks: BacklinkResult[]): BacklinksByPage[] {
	const grouped = new Map<
		string,
		{ pageTitle: string; blockUids: Set<string>; blocks: RoamBlock[] }
	>();

	for (let i = 0; i < backlinks.length; i++) {
		const backlink = backlinks[i];
		if (!grouped.has(backlink.pageUid)) {
			grouped.set(backlink.pageUid, {
				pageTitle: backlink.pageTitle,
				blockUids: new Set<string>(),
				blocks: [],
			});
		}

		const entry = grouped.get(backlink.pageUid);
		if (!entry || entry.blockUids.has(backlink.blockUid)) {
			continue;
		}
		entry.blockUids.add(backlink.blockUid);

		const fullBlock = getBlockByUid(backlink.blockUid);
		if (fullBlock) {
			entry.blocks.push(fullBlock);
		}
	}

	const groupedList = Array.from(grouped.entries())
		.map(([pageUid, value]) => ({
			pageUid,
			pageTitle: value.pageTitle,
			blocks: value.blocks.sort((a, b) => a.order - b.order),
		}))
		.filter((entry) => entry.blocks.length > 0);

	groupedList.sort((a, b) =>
		a.pageTitle.localeCompare(b.pageTitle, undefined, {
			sensitivity: "base",
		})
	);

	return groupedList;
}

export function blocksToMarkdown(blocks: RoamBlock[], depth: number = 0): string {
	const lines: string[] = [];

	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		const indent = "  ".repeat(depth);
		const text = typeof block.string === "string" ? block.string : "";
		const blockLines = text.split("\n");
		const firstLine = blockLines[0] ?? "";

		lines.push(`${indent}- ${firstLine}`);

		for (let j = 1; j < blockLines.length; j++) {
			lines.push(`${indent}  ${blockLines[j]}`);
		}

		if (block.children.length > 0) {
			lines.push(blocksToMarkdown(block.children, depth + 1));
		}
	}

	return lines.join("\n");
}

export function formatReferencesExport(
	payload: ReferencesExportPayload
): string {
	const sections: string[] = [];
	const title = payload.title.trim().length > 0 ? payload.title : "Untitled";

	sections.push(`# ${title}`);
	sections.push("");

	if (payload.contentBlocks.length > 0) {
		sections.push(blocksToMarkdown(payload.contentBlocks));
		sections.push("");
	}

	const backlinksSection = formatBacklinksSection(payload.backlinksByPage);
	if (backlinksSection.length > 0) {
		sections.push(backlinksSection.trimEnd());
		sections.push("");
	}

	return `${sections.join("\n").trimEnd()}\n`;
}

export function formatBacklinksSection(backlinksByPage: BacklinksByPage[]): string {
	if (backlinksByPage.length === 0) {
		return "";
	}

	const sections: string[] = ["## Backlinks", ""];

	for (let i = 0; i < backlinksByPage.length; i++) {
		const group = backlinksByPage[i];
		sections.push(`### [[${group.pageTitle}]]`);
		sections.push("");

		if (group.blocks.length > 0) {
			sections.push(blocksToMarkdown(group.blocks));
		}

		sections.push("");
	}

	return `${sections.join("\n").trimEnd()}\n`;
}

export function getBacklinksSectionMarkdown(
	uid: string,
	options?: { forcePage?: boolean }
): BacklinksSectionResult {
	try {
		const api = getRoamAPI();
		if (!api) {
			return {
				success: false,
				error: "Roam API is unavailable.",
			};
		}

		const normalizedUid = uid.trim();
		if (normalizedUid.length === 0) {
			return {
				success: false,
				error: "Could not determine a page or block to export.",
			};
		}

		const forcePage = Boolean(options?.forcePage);
		const targetUid = forcePage
			? getPageUidForUid(normalizedUid) ?? normalizedUid
			: normalizedUid;

		const backlinksByPage = groupAndLoadBacklinks(findBacklinks(targetUid));
		return {
			success: true,
			section: formatBacklinksSection(backlinksByPage),
		};
	} catch (error) {
		console.error("Could not build backlinks section.", error);
		return {
			success: false,
			error: "Unexpected error while loading backlinks.",
		};
	}
}

async function copyPlainTextToClipboard(text: string): Promise<boolean> {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (_error) {}
	}

	if (!document.body || typeof document.execCommand !== "function") {
		return false;
	}

	const activeElement = document.activeElement as HTMLElement | null;
	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "true");
	textarea.style.position = "fixed";
	textarea.style.left = "-9999px";
	textarea.style.top = "0";
	textarea.style.opacity = "0";
	document.body.appendChild(textarea);

	textarea.focus();
	textarea.select();

	let copied = false;
	try {
		copied = document.execCommand("copy");
	} catch (_error) {
		copied = false;
	}

	document.body.removeChild(textarea);
	activeElement?.focus?.();

	return copied;
}

export async function exportWithReferencesToClipboard(
	uid: string,
	options?: { forcePage?: boolean; transformMarkdown?: (markdown: string) => string }
): Promise<ReferencesExportResult> {
	try {
		const api = getRoamAPI();
		if (!api) {
			return {
				success: false,
				error: "Roam API is unavailable.",
			};
		}

		const normalizedUid = uid.trim();
		if (normalizedUid.length === 0) {
			return {
				success: false,
				error: "Could not determine a page or block to export.",
			};
		}

		const forcePage = Boolean(options?.forcePage);
		const targetUid = forcePage
			? getPageUidForUid(normalizedUid) ?? normalizedUid
			: normalizedUid;

		const targetIsPage = isPage(targetUid);
		const backlinksByPage = groupAndLoadBacklinks(findBacklinks(targetUid));
		let payload: ReferencesExportPayload | null = null;

		if (targetIsPage) {
			const page = getPageByUid(targetUid);
			if (!page) {
				return {
					success: false,
					error: "Could not find page data for export.",
				};
			}

			payload = {
				title: page.title,
				contentBlocks: page.children,
				backlinksByPage,
			};
		} else {
			const block = getBlockByUid(targetUid);
			if (!block) {
				return {
					success: false,
					error: "Could not find block data for export.",
				};
			}

			payload = {
				title: block.string.split("\n")[0] ?? block.string,
				contentBlocks: [block],
				backlinksByPage,
			};
		}

		const rawMarkdown = formatReferencesExport(payload);
		const markdown = options?.transformMarkdown
			? options.transformMarkdown(rawMarkdown)
			: rawMarkdown;
		const copied = await copyPlainTextToClipboard(markdown);
		if (!copied) {
			return {
				success: false,
				error: "Failed to copy export to clipboard.",
				markdown,
			};
		}

		return {
			success: true,
			markdown,
		};
	} catch (error) {
		console.error("Could not export with references.", error);
		return {
			success: false,
			error: "Unexpected error while exporting with references.",
		};
	}
}
