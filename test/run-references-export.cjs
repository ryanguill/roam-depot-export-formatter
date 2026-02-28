#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const tempOutDir = path.join(rootDir, ".tmp-references-tests");

function fail(message) {
	console.error(`\n[references-tests] ${message}`);
	process.exit(1);
}

function run(command, args = []) {
	cp.execFileSync(command, args, {
		cwd: rootDir,
		stdio: "inherit",
	});
}

function loadCompiledModule(relativePath) {
	const directPath = path.join(tempOutDir, relativePath);
	const nestedPath = path.join(tempOutDir, "src", relativePath);
	if (fs.existsSync(directPath)) {
		return require(directPath);
	}
	if (fs.existsSync(nestedPath)) {
		return require(nestedPath);
	}
	fail(`Could not locate compiled module: ${relativePath}`);
}

function expectEqual(name, actual, expected) {
	if (actual !== expected) {
		fail(
			`${name}\nExpected:\n${JSON.stringify(
				expected
			)}\nActual:\n${JSON.stringify(actual)}`
		);
	}
}

function expect(name, condition) {
	if (!condition) {
		fail(name);
	}
}

async function main() {
	fs.rmSync(tempOutDir, { recursive: true, force: true });

	run("npx", [
		"tsc",
		"--project",
		"tsconfig.json",
		"--outDir",
		tempOutDir,
		"--rootDir",
		"src",
		"--module",
		"commonjs",
		"--target",
		"es2019",
		"--declaration",
		"false",
		"--sourceMap",
		"false",
		"--noEmit",
		"false",
	]);

	const {
		blocksToMarkdown,
		exportWithReferencesToClipboard,
		formatBacklinksSection,
		formatReferencesExport,
		getBacklinksSectionMarkdown,
	} = loadCompiledModule("referencesExport.js");

	const blockMarkdown = blocksToMarkdown([
		{
			string: "parent line\ncontinued line",
			uid: "a",
			order: 0,
			children: [
				{
					string: "child line",
					uid: "b",
					order: 0,
					children: [],
				},
			],
		},
	]);
	expectEqual(
		"blocksToMarkdown should keep nested indentation and multiline blocks",
		blockMarkdown,
		"- parent line\n  continued line\n  - child line"
	);

	const markdown = formatReferencesExport({
		title: "Target Title",
		contentBlocks: [
			{
				string: "root",
				uid: "c",
				order: 0,
				children: [],
			},
		],
		backlinksByPage: [
			{
				pageUid: "d",
				pageTitle: "Daily Notes",
				blocks: [
					{
						string: "reference block",
						uid: "e",
						order: 1,
						children: [],
					},
				],
			},
		],
	});

	expectEqual(
		"formatReferencesExport should include content and backlink sections",
		markdown,
		"# Target Title\n\n- root\n\n## Backlinks\n\n### [[Daily Notes]]\n\n- reference block\n"
	);

	const backlinksOnly = formatBacklinksSection([
		{
			pageUid: "d",
			pageTitle: "Daily Notes",
			blocks: [
				{
					string: "reference block",
					uid: "e",
					order: 1,
					children: [],
				},
			],
		},
	]);
	expectEqual(
		"formatBacklinksSection should render grouped backlinks markdown",
		backlinksOnly,
		"## Backlinks\n\n### [[Daily Notes]]\n\n- reference block\n"
	);

	const previousWindow = global.window;
	const previousNavigator = global.navigator;
	const previousDocument = global.document;
	try {
		global.window = {
			location: { hash: "#/app/test-graph/page/example" },
			roamAlphaAPI: {
				pull: (pattern, reference) => {
					const uid = Array.isArray(reference) ? reference[1] : "";
					const blockDataByUid = {
						BLINK0001: {
							string: "{{[[TODO]]}} ((INNER0001))",
							order: 0,
							children: [],
						},
						INNER0001: {
							string:
								"Allow filter to also target TODO that are a block reference, ((DEEP00001))",
							order: 0,
							children: [],
						},
						DEEP00001: {
							string: "when excluding them from a page.",
							order: 0,
							children: [],
						},
						TARGET001: {
							string: "target",
							order: 0,
							children: [],
						},
					};

					if (pattern === "[:block/string]") {
						const blockData = blockDataByUid[uid];
						return blockData ? { ":block/string": blockData.string } : null;
					}

					if (String(pattern).includes(":node/title :block/string")) {
						return { ":block/string": "target" };
					}

					if (
						String(pattern).includes(":block/string :block/uid :block/order")
					) {
						const blockData = blockDataByUid[uid];
						if (!blockData) {
							return null;
						}
						return {
							":block/string": blockData.string,
							":block/uid": uid,
							":block/order": blockData.order,
							":block/children": [],
						};
					}

					return null;
				},
				q: () => [["BLINK0001", "Josh Brown", "PAGE00001"]],
			},
		};

		const resolvedBacklinks = getBacklinksSectionMarkdown("TARGET001");
		expectEqual(
			"getBacklinksSectionMarkdown should resolve nested block refs and normalize TODO markers",
			resolvedBacklinks.section,
			"## Backlinks\n\n### [[Josh Brown]]\n\n- [ ] Allow filter to also target TODO that are a block reference, when excluding them from a page.\n"
		);

		let qTargetUid = "";
		global.window = {
			roamAlphaAPI: {
				pull: (pattern, reference) => {
					const uid = Array.isArray(reference) ? reference[1] : "";

					if (String(pattern).includes(":node/title :block/uid {:block/page")) {
						if (uid === "BLOCK_A") {
							return { ":block/page": { ":block/uid": "PAGE_A" } };
						}
						return null;
					}

					if (
						String(pattern).includes(":block/string :block/uid :block/order")
					) {
						if (uid === "BETA001") {
							return {
								":block/string": "zeta block",
								":block/uid": uid,
								":block/order": 5,
								":block/children": [],
							};
						}
						if (uid === "ALPHA001") {
							return {
								":block/string": "alpha second",
								":block/uid": uid,
								":block/order": 2,
								":block/children": [],
							};
						}
						if (uid === "ALPHA000") {
							return {
								":block/string": "alpha first",
								":block/uid": uid,
								":block/order": 0,
								":block/children": [],
							};
						}
					}

					return null;
				},
				q: (_query, targetUid) => {
					qTargetUid = targetUid;
					return [
						["BETA001", "zeta page", "PAGE_Z"],
						["ALPHA001", "Alpha Page", "PAGE_A"],
						["ALPHA001", "Alpha Page", "PAGE_A"],
						["ALPHA000", "Alpha Page", "PAGE_A"],
					];
				},
			},
		};

		const forcedPageBacklinks = getBacklinksSectionMarkdown("BLOCK_A", {
			forcePage: true,
		});
		expectEqual(
			"getBacklinksSectionMarkdown should resolve to page uid and sort grouped backlinks",
			forcedPageBacklinks.section,
			"## Backlinks\n\n### [[Alpha Page]]\n\n- alpha first\n- alpha second\n\n### [[zeta page]]\n\n- zeta block\n"
		);
		expectEqual(
			"getBacklinksSectionMarkdown should query backlinks with resolved page uid",
			qTargetUid,
			"PAGE_A"
		);

		let clipboardText = "";
		if (!global.navigator) {
			global.navigator = {};
		}
		global.navigator.clipboard = {
			writeText: async (text) => {
				clipboardText = text;
			},
		};
		global.window = {
			roamAlphaAPI: {
				pull: (pattern, reference) => {
					const uid = Array.isArray(reference) ? reference[1] : "";
					if (String(pattern).includes(":node/title :block/string")) {
						if (uid === "PAGE001") {
							return {
								":node/title": "Page One",
								":block/string": "",
							};
						}
						return { ":block/string": "Task root" };
					}

					if (String(pattern).includes(":node/title :block/uid {:block/page")) {
						if (uid === "BLOCK001") {
							return { ":block/page": { ":block/uid": "PAGE001" } };
						}
						return null;
					}

					if (
						String(pattern).includes("[:node/title :block/uid") &&
						String(pattern).includes(":block/children")
					) {
						if (uid === "PAGE001") {
							return {
								":node/title": "Page One",
								":block/uid": uid,
								":block/children": [
									{
										":block/string": "page child",
										":block/uid": "PAGECHILD",
										":block/order": 0,
										":block/children": [],
									},
								],
							};
						}
						return null;
					}

					if (
						String(pattern).includes(":block/string :block/uid :block/order")
					) {
						if (uid === "BLOCK001") {
							return {
								":block/string": "Task root",
								":block/uid": uid,
								":block/order": 0,
								":block/children": [],
							};
						}
						if (uid === "BLREF001") {
							return {
								":block/string": "reference from elsewhere",
								":block/uid": uid,
								":block/order": 1,
								":block/children": [],
							};
						}
					}

					return null;
				},
				q: () => [["BLREF001", "Other Page", "PAGE999"]],
			},
		};

		const blockExport = await exportWithReferencesToClipboard("BLOCK001", {
			transformMarkdown: (markdownInput) => `PREFIX\n${markdownInput}`,
		});
		expect(
			"exportWithReferencesToClipboard should succeed for blocks",
			blockExport.success
		);
		expectEqual(
			"exportWithReferencesToClipboard should use transformed markdown",
			blockExport.markdown,
			"PREFIX\n# Task root\n\n- Task root\n\n## Backlinks\n\n### [[Other Page]]\n\n- reference from elsewhere\n"
		);
		expectEqual(
			"exportWithReferencesToClipboard should copy transformed markdown",
			clipboardText,
			blockExport.markdown
		);

		clipboardText = "";
		const pageExport = await exportWithReferencesToClipboard("BLOCK001", {
			forcePage: true,
		});
		expect(
			"exportWithReferencesToClipboard should succeed for pages",
			pageExport.success
		);
		expectEqual(
			"exportWithReferencesToClipboard should export page children when forcePage is enabled",
			pageExport.markdown,
			"# Page One\n\n- page child\n\n## Backlinks\n\n### [[Other Page]]\n\n- reference from elsewhere\n"
		);
		expectEqual(
			"exportWithReferencesToClipboard should copy page markdown",
			clipboardText,
			pageExport.markdown
		);

		global.window = {};
		const unavailableBacklinks = getBacklinksSectionMarkdown("BLOCK001");
		expectEqual(
			"getBacklinksSectionMarkdown should fail when Roam API is unavailable",
			unavailableBacklinks.error,
			"Roam API is unavailable."
		);

		const unavailableExport = await exportWithReferencesToClipboard("BLOCK001");
		expectEqual(
			"exportWithReferencesToClipboard should fail when Roam API is unavailable",
			unavailableExport.error,
			"Roam API is unavailable."
		);
	} finally {
		global.window = previousWindow;
		global.navigator = previousNavigator;
		global.document = previousDocument;
	}

	const markdownWithoutBacklinks = formatReferencesExport({
		title: "No Backlinks",
		contentBlocks: [],
		backlinksByPage: [],
	});
	expectEqual(
		"formatReferencesExport should omit backlink section when empty",
		markdownWithoutBacklinks,
		"# No Backlinks\n"
	);

	fs.rmSync(tempOutDir, { recursive: true, force: true });
	console.log("[references-tests] All tests passed.");
}

main().catch((error) => {
	fail(`Unexpected test runner error: ${String(error)}`);
});
