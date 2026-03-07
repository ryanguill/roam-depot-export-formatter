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

function main() {
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
		formatBacklinksSection,
		formatReferencesExport,
		getBacklinksSectionMarkdown,
	} =
		loadCompiledModule("referencesExport.js");

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
	global.window = {
		location: { hash: "#/app/test-graph/page/example" },
		roamAlphaAPI: {
			pull: (pattern, reference) => {
				const uid = Array.isArray(reference) ? reference[1] : "";
				const blockDataByUid = {
					BLINK0001: {
						string:
							"{{[[TODO]]}} ((INNER0001))",
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
						string:
							"when excluding them from a page.",
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
					String(pattern).includes(
						":block/string :block/uid :block/order"
					)
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

	global.window = previousWindow;

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

main();
