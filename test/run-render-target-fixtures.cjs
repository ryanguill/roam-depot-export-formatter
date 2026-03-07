#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const tempOutDir = path.join(rootDir, ".tmp-render-target-tests");
const fixturePath = path.join(__dirname, "fixtures", "render-targets.json");

function fail(message) {
	console.error(`\n[render-target-tests] ${message}`);
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

function formatMismatch(expected, actual) {
	return `Expected:\n${JSON.stringify(
		expected,
		null,
		2
	)}\nActual:\n${JSON.stringify(actual, null, 2)}`;
}

function makeDefaultFormatterSettings() {
	return {
		ignore_parent_node: false,
		flatten_indentation: 0,
		remove_bullets: false,
		remove_double_brackets: false,
		remove_double_braces: false,
		remove_formatting: false,
		remove_callouts: false,
		remove_code_blocks: false,
		add_line_breaks: 0,
		line_breaks_before_all_nodes: false,
		remove_colon_from_attributes: false,
		remove_quotes: false,
		remove_hashtag_marks: false,
		remove_todos: false,
		remove_namespaces: false,
		remove_blocks_with_queries: false,
	};
}

function assertFormatterOutput({
	name,
	inputLines,
	expectedLines,
	settings,
	applyFormatterSettings,
	BLOCK_DELIMITER,
}) {
	const input = inputLines.join(BLOCK_DELIMITER);
	const expected = expectedLines.join(BLOCK_DELIMITER);
	const actual = applyFormatterSettings(input, settings);
	if (actual !== expected) {
		fail(
			`${name}\n${formatMismatch(expectedLines, actual.split(BLOCK_DELIMITER))}`
		);
	}
}

function main() {
	if (!fs.existsSync(fixturePath)) {
		fail(`Missing fixture file: ${fixturePath}`);
	}

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
		applyRenderTargetProfile,
		RENDER_TARGET_VALUES,
		shouldPreferRichCopy,
		shouldPreviewAsPlainText,
	} = loadCompiledModule("renderTargets.js");
	const { BLOCK_DELIMITER } = loadCompiledModule("index.js");
	const { applyFormatterSettings } = loadCompiledModule("formatter.js");
	const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

	if (!Array.isArray(fixtures.cases) || fixtures.cases.length === 0) {
		fail("Fixture file has no cases.");
	}

	const targetList = Array.from(RENDER_TARGET_VALUES);
	const expectedTargetFallbacks = {
		google_docs: "word",
		github: "standard",
		llm: "standard",
		email: "word",
		google_chat: "messaging",
		line: "messaging",
		wechat: "messaging",
		matrix: "messaging",
		excel: "signal",
		google_sheets: "signal",
		terminal: "signal",
	};

	for (const fixtureCase of fixtures.cases) {
		if (!fixtureCase || typeof fixtureCase.name !== "string") {
			fail("Fixture case is missing a valid name.");
		}
		if (!Array.isArray(fixtureCase.lines)) {
			fail(`Fixture case "${fixtureCase.name}" must define "lines".`);
		}
		const input = fixtureCase.lines.join(BLOCK_DELIMITER);

		for (const target of targetList) {
			let expectedLines = fixtureCase.expect?.[target];
			if (!Array.isArray(expectedLines)) {
				const fallbackTarget = expectedTargetFallbacks[target];
				if (fallbackTarget) {
					expectedLines = fixtureCase.expect?.[fallbackTarget];
				}
			}
			if (!Array.isArray(expectedLines)) {
				fail(
					`Fixture case "${fixtureCase.name}" is missing expected lines for target "${target}".`
				);
			}

			const expected = expectedLines.join(BLOCK_DELIMITER);
			const actual = applyRenderTargetProfile(input, target);
			if (actual !== expected) {
				fail(
					`Case "${
						fixtureCase.name
					}" failed for target "${target}".\n${formatMismatch(
						expectedLines,
						actual.split(BLOCK_DELIMITER)
					)}`
				);
			}
		}
	}

	const expectedPlainPreviewTargets = new Set([
		"slack",
		"whatsapp",
		"telegram",
		"google_chat",
		"line",
		"wechat",
		"matrix",
		"messaging",
		"excel",
		"google_sheets",
		"latex",
		"terminal",
		"signal",
		"imessage",
	]);
	const expectedRichCopyTargets = new Set([
		"word",
		"google_docs",
		"notion",
		"email",
	]);

	for (const target of targetList) {
		const previewAsPlain = shouldPreviewAsPlainText(target);
		if (previewAsPlain !== expectedPlainPreviewTargets.has(target)) {
			fail(`Unexpected plain preview mode for target "${target}".`);
		}

		const preferRichCopy = shouldPreferRichCopy(target);
		if (preferRichCopy !== expectedRichCopyTargets.has(target)) {
			fail(`Unexpected rich copy mode for target "${target}".`);
		}
	}

	let formatterCaseCount = 0;

	const hashtagSettings = {
		...makeDefaultFormatterSettings(),
		remove_hashtag_marks: true,
	};

	assertFormatterOutput({
		name: "Hashtag removal should preserve indentation and spacing.",
		inputLines: [
			"- root",
			"\t- keep  aligned #tag",
			"\t\t- child    spacing #[[Topic]]",
		],
		expectedLines: ["- root", "\t- keep  aligned", "\t\t- child    spacing"],
		settings: hashtagSettings,
		applyFormatterSettings,
		BLOCK_DELIMITER,
	});
	formatterCaseCount += 1;

	assertFormatterOutput({
		name: "Hashtag removal should clean punctuation spacing only.",
		inputLines: [
			"- Hello #tag, world",
			"\t- (prefix #[[Topic]]) and #((abcdefghi)).",
		],
		expectedLines: ["- Hello, world", "\t- (prefix) and."],
		settings: hashtagSettings,
		applyFormatterSettings,
		BLOCK_DELIMITER,
	});
	formatterCaseCount += 1;

	assertFormatterOutput({
		name: "TODO/DONE/ARCHIVED conversion should happen when remove_todos is disabled.",
		inputLines: [
			"- {{[[TODO]]}} Ship it",
			"[[DONE]] Finish tests",
			"ARCHIVED legacy note",
		],
		expectedLines: [
			"- [ ] Ship it",
			"- [x] Finish tests",
			"~~- [ ] legacy note~~",
		],
		settings: makeDefaultFormatterSettings(),
		applyFormatterSettings,
		BLOCK_DELIMITER,
	});
	formatterCaseCount += 1;

	assertFormatterOutput({
		name: "remove_todos should strip todo tokens and drop marker-only lines.",
		inputLines: [
			"- {{[[TODO]]}} Keep content",
			"- [[DONE]]",
			"{{[[ARCHIVED]]}}",
			"- ARCHIVED Keep archived content",
		],
		expectedLines: ["- Keep content", "- Keep archived content"],
		settings: {
			...makeDefaultFormatterSettings(),
			remove_todos: true,
		},
		applyFormatterSettings,
		BLOCK_DELIMITER,
	});
	formatterCaseCount += 1;

	assertFormatterOutput({
		name: "remove_todos should also strip markdown checkbox markers.",
		inputLines: ["- [ ] Keep content", "- [x]", "\t- [ ] Nested keep"],
		expectedLines: ["- Keep content", "\t- Nested keep"],
		settings: {
			...makeDefaultFormatterSettings(),
			remove_todos: true,
		},
		applyFormatterSettings,
		BLOCK_DELIMITER,
	});
	formatterCaseCount += 1;

	assertFormatterOutput({
		name: "remove_todos should not strip plain-text TODO/DONE words in sentences.",
		inputLines: [
			"- Allow filter to also target TODO that are a block reference",
			"- This plain text mentions DONE in a sentence",
		],
		expectedLines: [
			"- Allow filter to also target TODO that are a block reference",
			"- This plain text mentions DONE in a sentence",
		],
		settings: {
			...makeDefaultFormatterSettings(),
			remove_todos: true,
		},
		applyFormatterSettings,
		BLOCK_DELIMITER,
	});
	formatterCaseCount += 1;

	assertFormatterOutput({
		name: "Query blocks should be removed before brace cleanup runs.",
		inputLines: [
			"- keep this",
			"- {{query: should disappear}}",
			"- {{[[query]]: should also disappear}}",
			":q [:find ?e]",
			"- {{[[video]]: keep payload}}",
		],
		expectedLines: ["- keep this"],
		settings: {
			...makeDefaultFormatterSettings(),
			remove_blocks_with_queries: true,
			remove_double_braces: true,
		},
		applyFormatterSettings,
		BLOCK_DELIMITER,
	});
	formatterCaseCount += 1;

	assertFormatterOutput({
		name: "Callout marker removal should keep content and drop empty marker lines.",
		inputLines: [
			"- [[>]] [[!NOTE]] Keep this",
			"\t- [[>]] [[!TIP]]",
			"- regular line",
		],
		expectedLines: ["- Keep this", "- regular line"],
		settings: {
			...makeDefaultFormatterSettings(),
			remove_callouts: true,
		},
		applyFormatterSettings,
		BLOCK_DELIMITER,
	});
	formatterCaseCount += 1;

	assertFormatterOutput({
		name: "Code block removal should remove fenced blocks and keep surrounding text.",
		inputLines: [
			"- keep before",
			"- ```inline``` after",
			"- ```ts",
			"  const x = 1;",
			"  return x;",
			"```",
			"- use `inline` code",
			"- keep after",
		],
		expectedLines: [
			"- keep before",
			"- after",
			"- use `inline` code",
			"- keep after",
		],
		settings: {
			...makeDefaultFormatterSettings(),
			remove_code_blocks: true,
		},
		applyFormatterSettings,
		BLOCK_DELIMITER,
	});
	formatterCaseCount += 1;

	assertFormatterOutput({
		name: "Code block removal should support 4+ backtick fences without leaving stray ticks.",
		inputLines: [
			"- keep before",
			"- `````markdown",
			"  FFood`````",
			"- ````markdown",
			"  Food````",
			"- `````code````` after",
			"- keep after",
		],
		expectedLines: ["- keep before", "- after", "- keep after"],
		settings: {
			...makeDefaultFormatterSettings(),
			remove_code_blocks: true,
		},
		applyFormatterSettings,
		BLOCK_DELIMITER,
	});
	formatterCaseCount += 1;

	fs.rmSync(tempOutDir, { recursive: true, force: true });
	console.log(
		`[render-target-tests] Passed ${fixtures.cases.length} render-target fixture cases across ${targetList.length} targets and ${formatterCaseCount} formatter regression cases.`
	);
}

main();
