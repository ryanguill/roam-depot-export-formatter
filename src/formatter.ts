const { Remarkable } = require("remarkable");

import { BLOCK_DELIMITER } from "./index";
import {
	applyRenderTargetProfile,
	DEFAULT_RENDER_TARGET,
	findGroupForTarget,
	getRenderTargetLabel,
	isRenderTarget,
	RENDER_TARGET_GROUPS,
	shouldPreviewAsPlainText,
	shouldPreferRichCopy,
	type RenderTarget,
	type RenderTargetGroup,
} from "./renderTargets";

var md = new Remarkable({ breaks: true });
md.inline.ruler.enable(["ins", "mark", "sub", "sup"]);

import { getElementValue, setElementValue, addEventListener } from "./utils";

const RENDERED_PREVIEW_SETTING_ID = "rgef_enable_rendered_preview";
const RENDER_TARGET_SETTING_ID = "rgef_render_target";
const PARAGRAPH_BREAKS_HINT_ID = "rgef_paragraph_breaks_hint";
const copyButtonResetTimers = new Map<string, number>();
const SETTINGS_STORAGE_KEY_BASE = "rgef_settings";
let pendingRenderFrame: number | null = null;
let pendingPreviewFrame: number | null = null;
let orderedRenderTargetsCache: ReadonlyArray<RenderTarget> | null = null;

export interface settings {
	ignore_parent_node: boolean;
	flatten_indentation: number;
	remove_bullets: boolean;
	remove_double_brackets: boolean;
	remove_double_braces: boolean;
	remove_formatting: boolean;
	remove_callouts: boolean;
	remove_code_blocks: boolean;
	add_line_breaks: number;
	line_breaks_before_all_nodes: boolean;
	remove_colon_from_attributes: boolean;
	remove_quotes: boolean;
	remove_hashtag_marks: boolean;
	remove_todos: boolean;
	remove_namespaces: boolean;
	remove_blocks_with_queries: boolean;
}

interface uiSettings {
	enable_rendered_preview: boolean;
	render_target_group: RenderTargetGroup;
	render_target: RenderTarget;
	include_backlinks: boolean;
	backlinks_scope: "target" | "page";
}

const RENDER_TARGET_HINT_TEXT: Record<RenderTarget, string> = {
	word: "Rich HTML + plain text copy for Word pastes",
	google_docs: "Rich HTML + plain text copy for Google Docs pastes",
	notion: "Rich HTML + plain text copy for Notion pastes",
	email: "Rich HTML + plain text copy for email composers",
	github: "Markdown-first output for GitHub markdown fields",
	llm: "Markdown-first output for LLM prompts and chat inputs",
	slack: "Plain-text markdown output for copy/paste into Slack composer",
	whatsapp: "Plain-text markers and links normalized for WhatsApp paste",
	telegram: "Conservative markdown marker set and plain link fallback",
	signal: "Plain-text safe output. Unsupported markdown is stripped",
	imessage: "Plain-text safe output. Unsupported markdown is stripped",
	google_chat: "Plain-text safe output for Google Chat composer pastes",
	line: "Plain-text safe output for LINE composer pastes",
	wechat: "Plain-text safe output for WeChat composer pastes",
	matrix: "Plain-text safe output for Matrix/Element composer pastes",
	messaging: "Generic plain-text profile for chat apps with varied parsing",
	excel: "Plain-text cell-friendly output for spreadsheet pastes",
	google_sheets: "Plain-text cell-friendly output for Sheets pastes",
	latex: "Plain-text output with markdown links converted to \\\\url{}",
	terminal: "Plain-text output for terminal pastes without wrappers",
};

function getGraphStorageScope(): string {
	try {
		const maybeGraphName = (window as any)?.roamAlphaAPI?.graph?.name;
		if (
			typeof maybeGraphName === "string" &&
			maybeGraphName.trim().length > 0
		) {
			return maybeGraphName.trim();
		}
		if (typeof maybeGraphName === "function") {
			const graphName = maybeGraphName();
			if (typeof graphName === "string" && graphName.trim().length > 0) {
				return graphName.trim();
			}
		}
	} catch (_error) {}

	try {
		const hash = window.location?.hash ?? "";
		const hashMatch = hash.match(/#\/app\/([^/?]+)/);
		if (hashMatch && hashMatch[1]) {
			return decodeURIComponent(hashMatch[1]);
		}
	} catch (_error) {}

	return "global";
}

function getScopedSettingsStorageKey() {
	return `${SETTINGS_STORAGE_KEY_BASE}::${getGraphStorageScope()}`;
}

function setRenderTargetHint(renderTarget: RenderTarget) {
	const hintEl = document.getElementById("rgef_render_target_hint");
	if (!(hintEl instanceof HTMLElement)) {
		return;
	}

	hintEl.textContent =
		RENDER_TARGET_HINT_TEXT[renderTarget] ?? RENDER_TARGET_HINT_TEXT.whatsapp;
}

function buildOrderedRenderTargets(): RenderTarget[] {
	const orderedTargets: RenderTarget[] = [];
	if (!Array.isArray(RENDER_TARGET_GROUPS)) {
		return [DEFAULT_RENDER_TARGET];
	}
	for (
		let groupIndex = 0;
		groupIndex < RENDER_TARGET_GROUPS.length;
		groupIndex++
	) {
		const group = RENDER_TARGET_GROUPS[groupIndex];
		for (
			let targetIndex = 0;
			targetIndex < group.targets.length;
			targetIndex++
		) {
			const target = group.targets[targetIndex] as RenderTarget;
			if (!orderedTargets.includes(target)) {
				orderedTargets.push(target);
			}
		}
	}
	return orderedTargets.sort((a, b) =>
		getRenderTargetLabel(a).localeCompare(getRenderTargetLabel(b), undefined, {
			sensitivity: "base",
		})
	);
}

function getOrderedRenderTargetsCached(): ReadonlyArray<RenderTarget> {
	if (orderedRenderTargetsCache) {
		return orderedRenderTargetsCache;
	}
	orderedRenderTargetsCache = buildOrderedRenderTargets();
	return orderedRenderTargetsCache;
}

function ensureRenderTargetOptions(
	preferredTarget?: RenderTarget
): RenderTarget {
	const targetSelect = document.getElementById(
		RENDER_TARGET_SETTING_ID
	) as HTMLSelectElement | null;
	if (!(targetSelect instanceof HTMLSelectElement)) {
		return DEFAULT_RENDER_TARGET;
	}

	const targets = getOrderedRenderTargetsCached();
	targetSelect.innerHTML = "";

	for (let i = 0; i < targets.length; i++) {
		const target = targets[i];
		const option = document.createElement("option");
		option.value = target;
		option.textContent = getRenderTargetLabel(target);
		targetSelect.appendChild(option);
	}

	const selectedTarget =
		preferredTarget && targets.includes(preferredTarget)
			? preferredTarget
			: targets.includes(DEFAULT_RENDER_TARGET)
			? DEFAULT_RENDER_TARGET
			: targets[0] ?? DEFAULT_RENDER_TARGET;

	targetSelect.value = selectedTarget;
	return selectedTarget;
}

function scheduleRender() {
	if (pendingRenderFrame !== null) {
		return;
	}
	pendingRenderFrame = window.requestAnimationFrame(function () {
		pendingRenderFrame = null;
		render();
	});
}

function scheduleRenderedPreviewFromOutputField() {
	if (pendingPreviewFrame !== null) {
		return;
	}
	pendingPreviewFrame = window.requestAnimationFrame(function () {
		pendingPreviewFrame = null;
		renderRenderedPreviewFromOutputField();
	});
}

function getCheckboxValue(id: string): boolean {
	const el = document.getElementById(id) as HTMLInputElement | null;
	return el?.checked ?? false;
}

function copyPlainTextWithExecCommand(text: string): boolean {
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
	} catch (err) {
		console.error("Sync: Could not copy text via execCommand: ", err);
	}

	document.body.removeChild(textarea);
	activeElement?.focus?.();

	return copied;
}

function copyRichTextWithExecCommand(
	htmlOutput: string,
	plainTextOutput: string
): boolean {
	if (!document.body || typeof document.execCommand !== "function") {
		return false;
	}

	const selection = window.getSelection();
	if (!selection) {
		return false;
	}

	const activeElement = document.activeElement as HTMLElement | null;
	const originalRanges: Range[] = [];
	for (let i = 0; i < selection.rangeCount; i++) {
		originalRanges.push(selection.getRangeAt(i));
	}

	const source = document.createElement("div");
	source.setAttribute("contenteditable", "true");
	source.style.position = "fixed";
	source.style.left = "-9999px";
	source.style.top = "0";
	source.style.opacity = "0";
	source.style.pointerEvents = "none";
	source.innerHTML = htmlOutput;
	document.body.appendChild(source);

	const range = document.createRange();
	range.selectNodeContents(source);
	selection.removeAllRanges();
	selection.addRange(range);

	let copied = false;
	const onCopy = function (event: ClipboardEvent) {
		if (!event.clipboardData) {
			return;
		}
		event.preventDefault();
		event.clipboardData.setData("text/html", htmlOutput);
		event.clipboardData.setData("text/plain", plainTextOutput);
		copied = true;
	};

	document.addEventListener("copy", onCopy);
	try {
		copied = document.execCommand("copy") || copied;
	} catch (err) {
		console.error("Sync: Could not copy rich text via execCommand: ", err);
	}
	document.removeEventListener("copy", onCopy);

	selection.removeAllRanges();
	for (let i = 0; i < originalRanges.length; i++) {
		try {
			selection.addRange(originalRanges[i]);
		} catch (err) {
			break;
		}
	}
	document.body.removeChild(source);
	activeElement?.focus?.();

	return copied;
}

async function copyPlainText(text: string): Promise<boolean> {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (err) {
			console.error("Async: Could not copy text: ", err);
		}
	}

	return copyPlainTextWithExecCommand(text);
}

async function copyRenderedOutput(
	htmlOutput: string,
	plainTextOutput: string
): Promise<boolean> {
	const ClipboardItemConstructor = (window as any).ClipboardItem;

	if (navigator.clipboard?.write && ClipboardItemConstructor) {
		try {
			const clipboardItem = new ClipboardItemConstructor({
				"text/html": new Blob([htmlOutput], { type: "text/html" }),
				"text/plain": new Blob([plainTextOutput], { type: "text/plain" }),
			});

			await navigator.clipboard.write([clipboardItem]);
			return true;
		} catch (err) {
			console.error("Async: Could not copy rich text: ", err);
		}
	}

	if (copyRichTextWithExecCommand(htmlOutput, plainTextOutput)) {
		return true;
	}

	return copyPlainText(plainTextOutput);
}

function flashCopyButton(buttonId: string) {
	const button = document.getElementById(buttonId);
	if (!button) {
		return;
	}

	const label = button.querySelector(".rgef_copy_label");
	if (!(label instanceof HTMLElement)) {
		return;
	}

	const original =
		button.getAttribute("data-copy-label") ?? label.textContent ?? "Copy";
	button.setAttribute("data-copy-label", original);

	const existingTimer = copyButtonResetTimers.get(buttonId);
	if (existingTimer !== undefined) {
		window.clearTimeout(existingTimer);
	}

	label.textContent = "Copied!";
	const resetTimer = window.setTimeout(function () {
		label.textContent = original;
		copyButtonResetTimers.delete(buttonId);
	}, 1500);
	copyButtonResetTimers.set(buttonId, resetTimer);
}

function syncRenderedColumnVisibility(previewEnabled: boolean) {
	const parentLayout = document.querySelector(".rgef_parent");
	if (!(parentLayout instanceof HTMLElement)) {
		return;
	}

	parentLayout.classList.toggle("rgef_rendered-hidden", !previewEnabled);
}

function syncParagraphBreaksHintVisibility() {
	const hintEl = document.getElementById(PARAGRAPH_BREAKS_HINT_ID);
	if (!(hintEl instanceof HTMLElement)) {
		return;
	}

	const isParagraphMode =
		getElementValue("#rgef_line_breaks_before_all_nodes") === "false";
	const isRemovingParentNode = getCheckboxValue("rgef_ignore_parent_node");
	hintEl.style.display =
		isParagraphMode && !isRemovingParentNode ? "block" : "none";
}

function setSettingValue(
	id: string,
	value: string | number | null | boolean,
	set_to_default: boolean = false
) {
	const el = document.getElementById(id);
	if (!el) {
		return;
	}

	if (el instanceof HTMLInputElement && el.type === "checkbox") {
		if (set_to_default) {
			el.checked = el.dataset.default === "true";
		} else if (typeof value === "boolean") {
			el.checked = value;
		} else {
			el.checked = String(value) === "true";
		}
		return;
	}

	if (el instanceof HTMLSelectElement) {
		const options = [...el.options];
		if (set_to_default) {
			value = el.dataset.default?.toString() ?? "";
		}
		if (value !== null) {
			const optionIndex = options.findIndex(
				(opt) => opt.value === String(value)
			);
			if (optionIndex >= 0) {
				el.selectedIndex = optionIndex;
			}
		}
	}
}

function applyStoredSetting(settingId: string, value: unknown) {
	if (typeof value === "undefined") {
		return;
	}
	setSettingValue(settingId, value as string | number | boolean);
}

export function formatter_init() {
	ensureRenderTargetOptions(DEFAULT_RENDER_TARGET);
	loadSettingsFromLocalStorage();

	addEventListener("#rgef_settings-form", "change", function () {
		saveSettingsToLocalStorage();
		syncParagraphBreaksHintVisibility();
		render();
	});

	addEventListener("#rgef_input", "change", scheduleRender);
	addEventListener("#rgef_input", "input", scheduleRender);
	addEventListener(
		"#rgef_output",
		"change",
		scheduleRenderedPreviewFromOutputField
	);
	addEventListener(
		"#rgef_output",
		"input",
		scheduleRenderedPreviewFromOutputField
	);

	addEventListener(".rgef_reset-options", "click", function () {
		const form = document.getElementById("rgef_settings-form");
		if (!form) {
			return;
		}

		form
			.querySelectorAll("input[type='checkbox'], select")
			.forEach(function (el) {
				const id = el.getAttribute("id");
				if (id) {
					setSettingValue(id, null, true);
				}
			});
		ensureRenderTargetOptions(DEFAULT_RENDER_TARGET);
		setSettingValue(RENDER_TARGET_SETTING_ID, null, true);
		saveSettingsToLocalStorage();
		syncParagraphBreaksHintVisibility();
		render();
	});

	addEventListener(`#${RENDER_TARGET_SETTING_ID}`, "change", function () {
		saveSettingsToLocalStorage();
		renderRenderedPreviewFromOutputField();
	});

	addEventListener("#rgef_copy_output", "click", function () {
		const output = getElementValue("#rgef_output");
		void copyPlainText(output).then(function (copied) {
			if (copied) {
				flashCopyButton("rgef_copy_output");
			} else {
				console.error("Could not copy output.");
			}
		});
	});

	addEventListener("#rgef_copy_rendered", "click", function () {
		const renderedOutputElement = document.getElementById(
			"rgef_rendered-output"
		);
		if (!renderedOutputElement) {
			return;
		}

		const uiSettings = getUiSettingsFromDom();
		const previewEnabled = uiSettings.enable_rendered_preview;
		const renderTarget = uiSettings.render_target;
		const targetOutput = getTargetOutputFromOutputField(renderTarget);
		const htmlOutput = previewEnabled
			? renderedOutputElement.innerHTML
			: renderMarkdownOutput(targetOutput);
		const plainTextOutput = targetOutput.replaceAll(BLOCK_DELIMITER, "\n");
		const copyOperation = shouldPreferRichCopy(renderTarget)
			? copyRenderedOutput(htmlOutput, plainTextOutput)
			: copyPlainText(plainTextOutput);
		void copyOperation.then(function (copied) {
			if (copied) {
				flashCopyButton("rgef_copy_rendered");
			} else {
				console.error("Could not copy rendered output.");
			}
		});
	});

	render();
}

function saveSettingsToLocalStorage() {
	const settings = getSettingsFromDom();
	const uiSettings = getUiSettingsFromDom();
	localStorage.setItem(
		getScopedSettingsStorageKey(),
		JSON.stringify({ ...settings, ...uiSettings })
	);
}

function loadSettingsFromLocalStorage() {
	const scopedStorageKey = getScopedSettingsStorageKey();
	const legacyStorageKey = SETTINGS_STORAGE_KEY_BASE;
	const scopedValue = localStorage.getItem(scopedStorageKey);
	const storedValue = scopedValue ?? localStorage.getItem(legacyStorageKey);
	if (!storedValue) {
		return;
	}

	let storedSettings: Record<string, unknown>;
	try {
		storedSettings = JSON.parse(storedValue);
	} catch (err) {
		return;
	}

	const storedRenderTargetRaw = storedSettings["render_target"];
	const storedRenderTarget =
		typeof storedRenderTargetRaw === "string"
			? storedRenderTargetRaw === "standard"
				? "word"
				: storedRenderTargetRaw === "beeper" ||
				  storedRenderTargetRaw === "plain"
				? "messaging"
				: isRenderTarget(storedRenderTargetRaw)
				? storedRenderTargetRaw
				: undefined
			: undefined;

	for (const key of Object.keys(storedSettings)) {
		if (key === "render_target" || key === "render_target_group") {
			continue;
		}
		applyStoredSetting(`rgef_${key}`, storedSettings[key]);
	}

	ensureRenderTargetOptions(storedRenderTarget);

	// Migrate existing legacy global settings to scoped key for this graph.
	if (
		!scopedValue ||
		storedRenderTargetRaw === "standard" ||
		storedRenderTargetRaw === "beeper" ||
		storedRenderTargetRaw === "plain"
	) {
		saveSettingsToLocalStorage();
	}
}

function getSettingsFromDom(): settings {
	return {
		ignore_parent_node: getCheckboxValue("rgef_ignore_parent_node"),
		flatten_indentation: Number(getElementValue("#rgef_flatten_indentation")),
		remove_bullets: getCheckboxValue("rgef_remove_bullets"),
		remove_double_brackets: getCheckboxValue("rgef_remove_double_brackets"),
		remove_double_braces: getCheckboxValue("rgef_remove_double_braces"),
		remove_formatting: getCheckboxValue("rgef_remove_formatting"),
		remove_callouts: getCheckboxValue("rgef_remove_callouts"),
		remove_code_blocks: getCheckboxValue("rgef_remove_code_blocks"),
		add_line_breaks: Number(getElementValue("#rgef_add_line_breaks")),
		line_breaks_before_all_nodes:
			getElementValue("#rgef_line_breaks_before_all_nodes") === "true",
		remove_colon_from_attributes: getCheckboxValue(
			"rgef_remove_colon_from_attributes"
		),
		remove_quotes: getCheckboxValue("rgef_remove_quotes"),
		remove_hashtag_marks: getCheckboxValue("rgef_remove_hashtag_marks"),
		remove_todos: getCheckboxValue("rgef_remove_todos"),
		remove_namespaces: getCheckboxValue("rgef_remove_namespaces"),
		remove_blocks_with_queries: getCheckboxValue(
			"rgef_remove_blocks_with_queries"
		),
	};
}

export function getCurrentFormatterSettings(): settings {
	return getSettingsFromDom();
}

function getUiSettingsFromDom(): uiSettings {
	const renderTargetValue = getElementValue(`#${RENDER_TARGET_SETTING_ID}`);
	const backlinksScopeValue = getElementValue("#rgef_backlinks_scope");
	const renderTarget = isRenderTarget(renderTargetValue)
		? renderTargetValue
		: DEFAULT_RENDER_TARGET;
	return {
		enable_rendered_preview: getCheckboxValue(RENDERED_PREVIEW_SETTING_ID),
		render_target_group: findGroupForTarget(renderTarget),
		render_target: renderTarget,
		include_backlinks: getCheckboxValue("rgef_include_backlinks"),
		backlinks_scope: backlinksScopeValue === "page" ? "page" : "target",
	};
}

export function applyFormatterSettings(
	input: string,
	settings: settings
): string {
	let result = input;

	if (settings.ignore_parent_node) {
		result = ignoreParentNode(result);
	}

	if (settings.flatten_indentation) {
		result = flattenIndentation(result, settings.flatten_indentation);
	}

	if (settings.remove_bullets) {
		result = removeBullets(result);
	}

	if (settings.line_breaks_before_all_nodes) {
		result = addLineBreaksBeforeAllNodes(result, settings.add_line_breaks);
	} else {
		result = addLineBreaksBeforeParagraphs(result, settings.add_line_breaks);
	}

	// Query removal runs early so query macros are removed before
	// braces and other transforms reshape the line.
	if (settings.remove_blocks_with_queries) {
		result = removeBlocksWithQueries(result);
	}

	if (settings.remove_todos) {
		result = removeTodos(result);
	}

	// Convert TODO/DONE before brace stripping so task tags still match.
	result = convertTodoAndDone(result);

	if (settings.remove_todos) {
		result = removeTodoOnlyLines(result);
	}

	if (settings.remove_double_braces) {
		result = removeDoubleBraces(result);
	}

	if (settings.remove_namespaces) {
		result = removeNamespaces(result);
	}

	if (settings.remove_hashtag_marks) {
		result = removeHashtags(result);
	}

	if (settings.remove_double_brackets) {
		result = removeDoubleBrackets(result);
	}

	if (settings.remove_colon_from_attributes) {
		result = removeColonFromAttributes(result);
	}

	if (settings.remove_quotes) {
		result = removeQuotes(result);
	}

	if (settings.remove_callouts) {
		result = removeCalloutMarkers(result);
	}

	if (settings.remove_code_blocks) {
		result = removeCodeBlocks(result);
	}

	if (settings.remove_formatting) {
		result = removeFormatting(result);
	}

	return result;
}

function renderMarkdownOutput(result: string): string {
	return md.render(convertForMarkdown(result), { gfm: true }) + `<br />`;
}

function getOutputFieldContentWithDelimiter(): string {
	const output = getElementValue("#rgef_output") ?? "";
	return output.replaceAll("\n", BLOCK_DELIMITER);
}

function getTargetOutputFromOutputField(renderTarget: RenderTarget): string {
	return applyRenderTargetProfile(
		getOutputFieldContentWithDelimiter(),
		renderTarget
	);
}

function renderRenderedPreviewFromOutputField() {
	const uiSettings = getUiSettingsFromDom();
	const previewEnabled = uiSettings.enable_rendered_preview;
	setRenderTargetHint(uiSettings.render_target);
	syncRenderedColumnVisibility(previewEnabled);

	const renderedOutputElement = document.getElementById("rgef_rendered-output");
	if (!renderedOutputElement) {
		return;
	}

	if (!previewEnabled) {
		renderedOutputElement.innerHTML = "";
		return;
	}

	const targetOutput = getTargetOutputFromOutputField(uiSettings.render_target);

	if (shouldPreviewAsPlainText(uiSettings.render_target)) {
		renderedOutputElement.style.whiteSpace = "pre-wrap";
		renderedOutputElement.textContent = targetOutput.replaceAll(
			BLOCK_DELIMITER,
			"\n"
		);
		return;
	}

	renderedOutputElement.style.whiteSpace = "normal";
	renderedOutputElement.innerHTML = renderMarkdownOutput(targetOutput);
}

export function render() {
	syncParagraphBreaksHintVisibility();

	const settings = getSettingsFromDom();
	if (isNaN(settings.add_line_breaks)) {
		settings.add_line_breaks = 0;
	}

	const input = getElementValue("#rgef_input") ?? "";
	const result = applyFormatterSettings(input, settings);

	setElementValue("#rgef_output", result.replaceAll(BLOCK_DELIMITER, "\n"));
	renderRenderedPreviewFromOutputField();
}

function convertForMarkdown(input: string) {
	return input
		.split(BLOCK_DELIMITER)
		.map(function (line) {
			let markdownLine = line
				.replace(/__/gm, `_`)
				.replace(/\^\^(.+)\^\^/gm, `==$1==`)
				.replace(/\b(.+\:\:)/gm, `**$1**`);

			if (!markdownLine.trim().startsWith("- ")) {
				markdownLine = markdownLine.replace(
					/\s\s\s\s/gm,
					"&nbsp;&nbsp;&nbsp;&nbsp;"
				);
			}

			if (
				markdownLine.trim().startsWith("> ") ||
				markdownLine.trim().startsWith("- > ")
			) {
				return markdownLine + `\n`;
			}

			return markdownLine;
		})
		.join("\n");
}

function convertTodoAndDone(input: string) {
	return input
		.split(BLOCK_DELIMITER)
		.map(function (line) {
			const converted = line
				.replace(
					/^(\s*)-\s*(?:\{\{\[\[TODO\]\]\}\}|\[\[TODO\]\]|TODO)\s*/,
					"$1- [ ] "
				)
				.replace(
					/^(\s*)-\s*(?:\{\{\[\[DONE\]\]\}\}|\[\[DONE\]\]|DONE)\s*/,
					"$1- [x] "
				)
				.replace(
					/^(\s*)(?:\{\{\[\[TODO\]\]\}\}|\[\[TODO\]\]|TODO)\s*/,
					"$1- [ ] "
				)
				.replace(
					/^(\s*)(?:\{\{\[\[DONE\]\]\}\}|\[\[DONE\]\]|DONE)\s*/,
					"$1- [x] "
				);

			return converted
				.replace(
					/^(\s*)-\s*(?:\{\{\[\[ARCHIVED\]\]\}\}|\[\[ARCHIVED\]\]|ARCHIVED)\s*(.*)$/,
					function (_match, indent: string, content: string) {
						const normalizedContent = content.trimEnd();
						return normalizedContent.length > 0
							? `${indent}~~- [ ] ${normalizedContent}~~`
							: `${indent}~~- [ ]~~`;
					}
				)
				.replace(
					/^(\s*)(?:\{\{\[\[ARCHIVED\]\]\}\}|\[\[ARCHIVED\]\]|ARCHIVED)\s*(.*)$/,
					function (_match, indent: string, content: string) {
						const normalizedContent = content.trimEnd();
						return normalizedContent.length > 0
							? `${indent}~~- [ ] ${normalizedContent}~~`
							: `${indent}~~- [ ]~~`;
					}
				);
		})
		.join(BLOCK_DELIMITER);
}

function removeTodos(input: string) {
	const lines = input.split(BLOCK_DELIMITER);
	const outputLines: string[] = [];
	const todoStateAtLineStartPattern =
		/^(\s*(?:-\s*)?)(?:\{\{\[\[(?:TODO|DONE|ARCHIVED)\]\]\}\}|\[\[(?:TODO|DONE|ARCHIVED)\]\]|(?:TODO|DONE|ARCHIVED)\b)\s*/i;
	const markdownTaskPattern = /^(\s*(?:-\s*)?)\[(?:\s|x|X)\]\s*/;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		let cleaned = line;
		let removedTodoMarker = false;

		for (let pass = 0; pass < 8; pass++) {
			const previous = cleaned;
			cleaned = cleaned
				.replace(markdownTaskPattern, "$1")
				.replace(todoStateAtLineStartPattern, "$1");
			if (cleaned !== previous) {
				removedTodoMarker = true;
				continue;
			}
			break;
		}

		cleaned = cleaned.replace(/^(\s*-\s)\s+/gm, "$1").trimEnd();

		// If TODO/DONE/ARCHIVED markers were the whole line (or just a bullet wrapper), drop it.
		if (
			removedTodoMarker &&
			(cleaned.trim() === "" || /^\s*-\s*$/.test(cleaned))
		) {
			continue;
		}

		outputLines.push(cleaned);
	}

	return outputLines.join(BLOCK_DELIMITER);
}

function addLineBreaksBeforeParagraphs(
	input: string,
	numberOfLineBreaks: number
) {
	return input
		.split(BLOCK_DELIMITER)
		.map(function (line, index) {
			//dont add line breaks before the first paragraph
			if (index > 0 && numberOfLineBreaks > 0 && line.trimStart() === line) {
				return "\n".repeat(numberOfLineBreaks) + line;
			}
			return line;
		})
		.join(BLOCK_DELIMITER);
}

function addLineBreaksBeforeAllNodes(
	input: string,
	numberOfLineBreaks: number
) {
	return input
		.split(BLOCK_DELIMITER)
		.map(function (line, index) {
			//dont add line breaks before the first node
			if (index > 0 && numberOfLineBreaks > 0) {
				return "\n".repeat(numberOfLineBreaks) + line;
			}
			return line;
		})
		.join(BLOCK_DELIMITER);
}

function ignoreParentNode(input: string) {
	return flattenIndentation(
		input.split(BLOCK_DELIMITER).slice(1).join(BLOCK_DELIMITER),
		1
	);
}

function flattenIndentation(input: string, flatten_indentation: number) {
	if (flatten_indentation > 5) {
		return input
			.split(BLOCK_DELIMITER)
			.map(function (line) {
				return line.trimStart();
			})
			.join(BLOCK_DELIMITER);
	}

	return input
		.split(BLOCK_DELIMITER)
		.map(function (line) {
			let output = line;
			let removedTabs = 0;
			while (removedTabs < flatten_indentation && output.startsWith("\t")) {
				output = output.slice(1);
				removedTabs++;
			}
			return output;
		})
		.join(BLOCK_DELIMITER);
}

function removeBullets(input: string) {
	return input
		.split(BLOCK_DELIMITER)
		.map(function (line) {
			return line.replace(/^(\s*)-\s/gm, "$1");
		})
		.join(BLOCK_DELIMITER);
}

function removeColonFromAttributes(input: string) {
	return input
		.split(BLOCK_DELIMITER)
		.map(function (line) {
			return line.replace(/\b(.+)\:\:/gm, "$1:");
		})
		.join(BLOCK_DELIMITER);
}

function removeQuotes(input: string) {
	return input
		.split(BLOCK_DELIMITER)
		.map(function (line) {
			return line
				.replace(/\"(.+)\"/gm, "$1")
				.replace(/^(\s*)-\s*>\s?/gm, "$1- ")
				.replace(/^(\s*)>\s?/gm, "$1");
		})
		.join(BLOCK_DELIMITER);
}

function removeHashtagMarks(input: string): string {
	return removeHashtags(input);
}

function removeHashtags(input: string) {
	const hashtagPattern =
		/#\[\[[^\]]+\]\]|#\(\([^)]+\)\)|#[^\s#()[\]{}.,;:!?]+/g;
	const outputLines: string[] = [];
	const lines = input.split(BLOCK_DELIMITER);
	const hashtagTokenPattern =
		/(^|[\s(])(?:#\[\[[^\]]+\]\]|#\(\([^)]+\)\)|#[^\s#()[\]{}.,;:!?]+)(?=$|[\s),.;:!?])/;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const hadHashtagToken = hashtagTokenPattern.test(line);

		hashtagPattern.lastIndex = 0;
		let rebuilt = "";
		let cursor = 0;
		let match = hashtagPattern.exec(line);

		while (match) {
			const token = match[0];
			const start = match.index;
			const end = start + token.length;
			const prevChar = start > 0 ? line[start - 1] : "";
			const nextChar = end < line.length ? line[end] : "";
			const hasValidPrefix = start === 0 || /[\s(]/.test(prevChar);
			const hasValidSuffix = nextChar === "" || /[\s),.;:!?]/.test(nextChar);

			if (!hasValidPrefix || !hasValidSuffix) {
				match = hashtagPattern.exec(line);
				continue;
			}

			let segment = line.slice(cursor, start);
			if (segment.endsWith(" ") && nextChar === " ") {
				segment = segment.slice(0, -1);
			}
			rebuilt += segment;

			cursor = start === 0 && nextChar === " " ? end + 1 : end;
			match = hashtagPattern.exec(line);
		}

		const cleaned = `${rebuilt}${line.slice(cursor)}`
			.replace(/^(\s*-\s)\s+/gm, "$1")
			.replace(/\s+([),.;:!?])/gm, "$1")
			.trimEnd();

		// If a line becomes only a bullet marker after hashtag removal,
		// drop the entire line.
		if (/^\s*-\s*$/.test(cleaned)) {
			continue;
		}

		// If hashtags were the only content left on this line, drop it.
		if (hadHashtagToken && cleaned.trim() === "") {
			continue;
		}

		outputLines.push(cleaned);
	}

	return outputLines.join(BLOCK_DELIMITER);
}

function removeDoubleBraces(input: string) {
	const lines = input.split(BLOCK_DELIMITER);
	const outputLines: string[] = [];
	const roamBraceRefPattern =
		/\{\{\s*(?:\[\[[^\]]+\]\]|\(\([^)]+\)\))(?:\s*:[\s\S]*?)?\s*\}\}+/gm;
	const hasRoamBraceRef = /\{\{\s*(?:\[\[|\(\()/;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const hadRoamBraceRef = hasRoamBraceRef.test(line);
		const cleaned = line
			// Remove Roam ref-style brace commands entirely (e.g. {{[[kanban]]}}, {{[[video]]: ...}}).
			.replace(roamBraceRefPattern, "")
			// For any {{label: ...}}, drop the label prefix and keep only content.
			.replace(/\{\{\s*[^{}:\n]+?\s*:\s*([\s\S]*?)\s*\}\}+/gm, "$1")
			// If malformed/unclosed, still strip the {{label: prefix.
			.replace(/\{\{\s*[^{}:\n]+?\s*:\s*/gm, "")
			// Generic brace removal fallback.
			.replace(/\{\{([^\{\}]+)\}\}/gm, "$1")
			.replace(/^(\s*-\s)\s+/gm, "$1")
			.trimEnd();

		if (
			hadRoamBraceRef &&
			(cleaned.trim() === "" || /^\s*-\s*$/.test(cleaned))
		) {
			continue;
		}

		outputLines.push(cleaned);
	}

	return outputLines.join(BLOCK_DELIMITER);
}

function removeNamespaces(input: string): string {
	return input
		.split(BLOCK_DELIMITER)
		.map(function (line) {
			return line.replace(
				/\[\[([^\]]+)\]\]/gm,
				function (_match, inner: string) {
					const lastSegment = inner.split("/").pop();
					return typeof lastSegment === "string" && lastSegment.length > 0
						? `[[${lastSegment}]]`
						: `[[${inner}]]`;
				}
			);
		})
		.join(BLOCK_DELIMITER);
}

function removeBlocksWithQueries(input: string): string {
	const datalogQueryPattern = /^\s*(?:-\s*|\d+\.\s*)?:q\b/i;
	const result = input
		.split(BLOCK_DELIMITER)
		.filter(function (line) {
			const normalized = line.toLowerCase();
			return (
				/\{\{\s*query\s*:/i.test(line) === false &&
				/\{\{\s*\[\[\s*query\s*\]\]\s*(?::|\}\})/i.test(line) === false &&
				normalized.includes("{{[[query]]:") === false &&
				!datalogQueryPattern.test(line)
			);
		})
		.join(BLOCK_DELIMITER);

	return result;
}

function removeDoubleBrackets(input: string): string {
	const result = input
		.split(BLOCK_DELIMITER)
		.map(function (line) {
			return line
				.replace(/\[([^\[\]]+)\]\((\[\[|\(\()([^\[\]]+)(\]\]|\)\))\)/gm, "$1")
				.replace(/\[\[([^\[\]]+)\]\]/gm, "$1")
				.replace(/\(\(([^\(\)]+)\)\)/gm, "$1");
		})
		.join(BLOCK_DELIMITER);

	const matches = [
		...result.matchAll(/\[([^\[\]]+)\]\((\[\[|\(\()([^\[\]]+)(\]\]|\)\))\)/gm),
		...result.matchAll(/\[\[([^\[\]]+)\]\]/gm),
		...result.matchAll(/\(\(([^\(\)]+)\)\)/gm),
	];
	if (matches.length > 0) {
		return removeDoubleBrackets(result);
	}
	return result;
}

function removeFormatting(input: string) {
	return input
		.split(BLOCK_DELIMITER)
		.map(function (line) {
			return line
				.replace(/\*\*(.+?)\*\*/gm, "$1")
				.replace(/\_\_(.+?)\_\_/gm, "$1")
				.replace(/\^\^(.+?)\^\^/gm, "$1")
				.replace(/\~\~(.+?)\~\~/gm, "$1");
		})
		.join(BLOCK_DELIMITER);
}

function removeTodoOnlyLines(input: string) {
	return input
		.split(BLOCK_DELIMITER)
		.filter(function (line) {
			// Drop lines that are only a bullet/task marker with no content.
			return (
				!/^\s*-\s*(?:\[(?:\s|x|X)\]|☐|☑︎)?\s*$/.test(line) && line.trim() !== ""
			);
		})
		.join(BLOCK_DELIMITER);
}

function removeCalloutMarkers(input: string) {
	const lines = input.split(BLOCK_DELIMITER);
	const outputLines: string[] = [];
	const calloutPrefixPattern = /^(\s*-\s*)?\[\[>\]\]\s*\[\[![^\]]+\]\]\s*/;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const hadCalloutPrefix = calloutPrefixPattern.test(line);
		const cleaned = line
			.replace(calloutPrefixPattern, function (_match, bulletPrefix?: string) {
				return bulletPrefix ?? "";
			})
			.replace(/^(\s*-\s)\s+/gm, "$1")
			.trimEnd();

		// If this line was only a callout marker, drop the empty bullet line.
		if (
			hadCalloutPrefix &&
			(/^\s*-\s*$/.test(cleaned) || cleaned.trim() === "")
		) {
			continue;
		}

		outputLines.push(cleaned);
	}

	return outputLines.join(BLOCK_DELIMITER);
}

function findFenceRunLength(line: string, start: number, fenceChar: string): number {
	let index = start;
	while (index < line.length && line[index] === fenceChar) {
		index++;
	}
	return index - start;
}

function findNextFenceStart(line: string, start: number): number {
	for (let i = start; i < line.length; i++) {
		const char = line[i];
		if (char !== "`" && char !== "~") {
			continue;
		}
		if (findFenceRunLength(line, i, char) >= 3) {
			return i;
		}
	}
	return -1;
}

function findClosingFenceStart(
	line: string,
	start: number,
	fenceChar: string,
	minFenceLength: number
): number {
	for (let i = start; i < line.length; i++) {
		if (line[i] !== fenceChar) {
			continue;
		}
		if (findFenceRunLength(line, i, fenceChar) >= minFenceLength) {
			return i;
		}
	}
	return -1;
}

function stripFencedCodeSegmentsFromLine(
	line: string,
	state: { inFence: boolean; fenceChar: string; fenceLength: number }
): string {
	let output = "";
	let cursor = 0;

	while (cursor < line.length) {
		if (!state.inFence) {
			const fenceStart = findNextFenceStart(line, cursor);
			if (fenceStart < 0) {
				output += line.slice(cursor);
				break;
			}

			output += line.slice(cursor, fenceStart);
			const fenceChar = line[fenceStart];
			const fenceLength = findFenceRunLength(line, fenceStart, fenceChar);
			state.inFence = true;
			state.fenceChar = fenceChar;
			state.fenceLength = fenceLength;
			cursor = fenceStart + fenceLength;
			continue;
		}

		const closingFenceStart = findClosingFenceStart(
			line,
			cursor,
			state.fenceChar,
			state.fenceLength
		);
		if (closingFenceStart < 0) {
			cursor = line.length;
			break;
		}

		const closingFenceLength = findFenceRunLength(
			line,
			closingFenceStart,
			state.fenceChar
		);
		state.inFence = false;
		state.fenceChar = "";
		state.fenceLength = 0;
		cursor = closingFenceStart + closingFenceLength;
	}

	return output;
}

function removeCodeBlocks(input: string) {
	const lines = input.split(BLOCK_DELIMITER);
	const outputLines: string[] = [];
	const fenceState = {
		inFence: false,
		fenceChar: "",
		fenceLength: 0,
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		let cleaned = stripFencedCodeSegmentsFromLine(line, fenceState);

		cleaned = cleaned.replace(/^(\s*-\s)\s+/gm, "$1").trimEnd();
		if (cleaned.trim() === "" || /^\s*(?:[-*+]|\d+\.)?\s*$/.test(cleaned)) {
			continue;
		}

		outputLines.push(cleaned);
	}

	return outputLines.join(BLOCK_DELIMITER);
}
