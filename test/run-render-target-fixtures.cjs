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
	return `Expected:\n${JSON.stringify(expected, null, 2)}\nActual:\n${JSON.stringify(
		actual,
		null,
		2
	)}`;
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

	const { applyRenderTargetProfile, RENDER_TARGET_VALUES, shouldPreferRichCopy, shouldPreviewAsPlainText } =
		loadCompiledModule("renderTargets.js");
	const { BLOCK_DELIMITER } = loadCompiledModule("index.js");
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
					`Case "${fixtureCase.name}" failed for target "${target}".\n${formatMismatch(
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

	fs.rmSync(tempOutDir, { recursive: true, force: true });
	console.log(
		`[render-target-tests] Passed ${fixtures.cases.length} cases across ${targetList.length} targets.`
	);
}

main();
