/// <reference types="roamjs-components/types" />
import { cleanupDOM, setupDOM } from "./dom";
import {
	applyFormatterSettings,
	formatter_init,
	getCurrentFormatterSettings,
	render,
} from "./formatter";
import { iterateThroughTree } from "./utils";
import {
	exportWithReferencesToClipboard,
	getBacklinksSectionMarkdown,
} from "./referencesExport";
import { showToast } from "./notifications";

const CONTEXT_MENU_COMMAND_LABEL = "Export";
const COMMAND_PALETTE_COMMAND_LABEL = "Export";
const CONTEXT_MENU_EXPORT_WITH_REFERENCES_LABEL = "Export with References";
const COMMAND_PALETTE_EXPORT_WITH_REFERENCES_LABEL = "Export with References";
const COMMAND_PALETTE_EXPORT_PAGE_WITH_REFERENCES_LABEL =
	"Export Page with References";

export const BLOCK_DELIMITER = String.fromCharCode(30); // record separator

type ModalCloseHandlers = {
	onCloseButtonClick: () => void;
	onWindowClick: (event: MouseEvent) => void;
	onWindowKeydown: (event: KeyboardEvent) => void;
	onWindowKeydownCapture: (event: KeyboardEvent) => void;
};

type BacklinksScope = "target" | "page";
type BacklinksCacheEntry = {
	sectionInput: string;
	error?: string;
	errorNotified?: boolean;
};
type ExportModalContext = {
	targetUid: string;
	baseText: string;
	backlinksCache: Partial<Record<BacklinksScope, BacklinksCacheEntry>>;
};

let modalCloseHandlers: ModalCloseHandlers | null = null;
let previousBodyOverflow: string | null = null;
let latestCommandRequestId = 0;
let exportModalContext: ExportModalContext | null = null;
let settingsFormChangeHandler: ((event: Event) => void) | null = null;

function trimTrailingDelimiters(input: string): string {
	let output = input;
	while (output.endsWith(BLOCK_DELIMITER)) {
		output = output.slice(0, -1);
	}
	return output;
}

function markdownToDelimiterInput(markdown: string): string {
	const normalized = markdown.replace(/\r\n/g, "\n").trimEnd();
	if (normalized.length === 0) {
		return "";
	}
	return normalized.split("\n").join(BLOCK_DELIMITER);
}

function combineInputSections(baseInput: string, extraInput: string): string {
	const normalizedBase = trimTrailingDelimiters(baseInput);
	const normalizedExtra = trimTrailingDelimiters(extraInput);

	if (normalizedBase.length === 0) {
		return normalizedExtra;
	}
	if (normalizedExtra.length === 0) {
		return normalizedBase;
	}

	return `${normalizedBase}${BLOCK_DELIMITER}${normalizedExtra}`;
}

function applyCurrentFormatterSettingsToMarkdown(markdown: string): string {
	const normalized = markdown.replace(/\r\n/g, "\n").trimEnd();
	if (normalized.length === 0) {
		return "";
	}

	const input = normalized.split("\n").join(BLOCK_DELIMITER);
	const settings = getCurrentFormatterSettings();
	const formatted = applyFormatterSettings(input, settings);
	const plainText = formatted.replaceAll(BLOCK_DELIMITER, "\n").trimEnd();
	return `${plainText}\n`;
}

function getBacklinksUiState(): { includeBacklinks: boolean; scope: BacklinksScope } {
	const includeBacklinksElement = document.getElementById(
		"rgef_include_backlinks"
	) as HTMLInputElement | null;
	const backlinksScopeElement = document.getElementById(
		"rgef_backlinks_scope"
	) as HTMLSelectElement | null;

	return {
		includeBacklinks: includeBacklinksElement?.checked ?? false,
		scope: backlinksScopeElement?.value === "page" ? "page" : "target",
	};
}

function applyModalInputFromContext(requestId: number) {
	if (requestId !== latestCommandRequestId) {
		return;
	}

	const modal = document.getElementById("rgef_modal");
	if (!(modal instanceof HTMLElement)) {
		return;
	}

	const inputElement = modal.querySelector("#rgef_input");
	if (!(inputElement instanceof HTMLTextAreaElement)) {
		return;
	}

	const context = exportModalContext;
	if (!context) {
		inputElement.value = "";
		render();
		return;
	}

	let nextInputValue = context.baseText;
	const uiState = getBacklinksUiState();
	if (uiState.includeBacklinks && context.targetUid.length > 0) {
		let cacheEntry = context.backlinksCache[uiState.scope];
		if (!cacheEntry) {
			const backlinksSectionResult = getBacklinksSectionMarkdown(
				context.targetUid,
				{
					forcePage: uiState.scope === "page",
				}
			);

			if (!backlinksSectionResult.success) {
				cacheEntry = {
					sectionInput: "",
					error:
						backlinksSectionResult.error ?? "Could not load backlinks section.",
				};
			} else {
				cacheEntry = {
					sectionInput: markdownToDelimiterInput(
						backlinksSectionResult.section ?? ""
					),
				};
			}
			context.backlinksCache[uiState.scope] = cacheEntry;
		}

		if (cacheEntry.error) {
			if (!cacheEntry.errorNotified) {
				cacheEntry.errorNotified = true;
				showToast(cacheEntry.error, "error");
			}
		} else {
			nextInputValue = combineInputSections(
				nextInputValue,
				cacheEntry.sectionInput
			);
		}
	}

	if (requestId !== latestCommandRequestId) {
		return;
	}

	inputElement.value = nextInputValue;
	render();
}

function ensureSettingsChangeListeners() {
	if (settingsFormChangeHandler) {
		return;
	}

	const settingsForm = document.getElementById("rgef_settings-form");
	if (!(settingsForm instanceof HTMLFormElement)) {
		return;
	}

	settingsFormChangeHandler = function (event: Event) {
		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}

		if (
			target.id !== "rgef_include_backlinks" &&
			target.id !== "rgef_backlinks_scope"
		) {
			return;
		}

		const requestId = ++latestCommandRequestId;
		applyModalInputFromContext(requestId);
	};

	settingsForm.addEventListener("change", settingsFormChangeHandler);
}

function cleanupSettingsChangeListeners() {
	if (!settingsFormChangeHandler) {
		return;
	}

	const settingsForm = document.getElementById("rgef_settings-form");
	if (settingsForm instanceof HTMLFormElement) {
		settingsForm.removeEventListener("change", settingsFormChangeHandler);
	}

	settingsFormChangeHandler = null;
}

function getBlockUidFromContext(block: any): string {
	const candidates = [
		block?.["block-uid"],
		block?.blockUid,
		block?.["block_uid"],
	];
	for (let i = 0; i < candidates.length; i++) {
		const candidate = candidates[i];
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}

	try {
		const focusedUid = getFocusedBlockUid();
		if (focusedUid) {
			return focusedUid;
		}
		const fallbackUid = getCurrentBlockAlternative();
		return fallbackUid ?? "";
	} catch (_error) {
		return "";
	}
}

function getFocusedBlockUid(): string | null {
	try {
		const focused = (window as any)?.roamAlphaAPI?.ui?.getFocusedBlock?.();
		const focusedUid =
			focused?.["block-uid"] ?? focused?.blockUid ?? focused?.uid ?? "";
		if (typeof focusedUid === "string" && focusedUid.trim().length > 0) {
			return focusedUid.trim();
		}
	} catch (_error) {}

	return null;
}

function getCurrentBlockAlternative(): string | null {
	if (typeof document === "undefined") {
		return null;
	}

	const activeElement = document.activeElement;
	if (activeElement) {
		let element: Element | null = activeElement;
		let attempts = 0;

		while (element && attempts < 12) {
			const uid =
				element.getAttribute("data-uid") ??
				element.getAttribute("data-block-uid");
			if (typeof uid === "string" && uid.trim().length > 0) {
				return uid.trim();
			}
			element = element.parentElement;
			attempts++;
		}
	}

	const highlightedBlocks = document.querySelectorAll(
		'[data-uid].block-highlight-blue, [data-uid].rm-block__focus, .rm-block--focused [data-uid]'
	);
	if (highlightedBlocks.length > 0) {
		const firstHighlightedUid = highlightedBlocks[0].getAttribute("data-uid");
		if (
			typeof firstHighlightedUid === "string" &&
			firstHighlightedUid.trim().length > 0
		) {
			return firstHighlightedUid.trim();
		}
	}

	const selection = window.getSelection();
	if (selection && selection.rangeCount > 0) {
		const range = selection.getRangeAt(0);
		const container = range.commonAncestorContainer;
		const blockElement =
			(container.nodeType === Node.TEXT_NODE
				? container.parentElement
				: (container as Element))?.closest?.("[data-uid]") ?? null;

		if (blockElement) {
			const uid = blockElement.getAttribute("data-uid");
			if (typeof uid === "string" && uid.trim().length > 0) {
				return uid.trim();
			}
		}
	}

	return null;
}

async function getCurrentPageOrBlockUid(): Promise<string | null> {
	try {
		const uid = await (window as any)?.roamAlphaAPI?.ui?.mainWindow?.getOpenPageOrBlockUid?.();
		if (typeof uid === "string" && uid.trim().length > 0) {
			return uid.trim();
		}
	} catch (_error) {}

	return null;
}

function setBodyScrollLocked(isLocked: boolean) {
	if (!document.body) {
		return;
	}

	if (isLocked) {
		if (previousBodyOverflow === null) {
			previousBodyOverflow = document.body.style.overflow;
		}
		document.body.style.overflow = "hidden";
		return;
	}

	if (previousBodyOverflow !== null) {
		document.body.style.overflow = previousBodyOverflow;
		previousBodyOverflow = null;
	}
}

function hideModal(modal: HTMLElement) {
	modal.style.display = "none";
	setBodyScrollLocked(false);
}

function ensureModalCloseListeners() {
	if (modalCloseHandlers) {
		return;
	}

	const modal = document.getElementById("rgef_modal");
	const closeButton = modal?.querySelector(".rgef_close");

	if (!(modal instanceof HTMLElement) || !(closeButton instanceof HTMLElement)) {
		return;
	}

	const onCloseButtonClick = function () {
		hideModal(modal);
	};

	const onWindowClick = function (event: MouseEvent) {
		if (event.target === modal) {
			hideModal(modal);
		}
	};

	const onWindowKeydown = function (event: KeyboardEvent) {
		if (event.key === "Escape" && modal.style.display !== "none") {
			hideModal(modal);
		}
	};

	const onWindowKeydownCapture = function (event: KeyboardEvent) {
		if (event.key === "Escape") {
			return;
		}

		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}

		if (!target.closest("#rgef_modal")) {
			return;
		}

		const isTextEditorTarget =
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLInputElement ||
			target.isContentEditable;

		if (!isTextEditorTarget) {
			return;
		}

		const lowerKey = event.key.toLowerCase();
		const hasMod = event.metaKey || event.ctrlKey;
		if (hasMod && lowerKey === "z") {
			event.preventDefault();
			try {
				document.execCommand(event.shiftKey ? "redo" : "undo");
			} catch (_error) {}
			event.stopImmediatePropagation();
			event.stopPropagation();
			return;
		}

		// Keep native editing shortcuts inside modal fields by blocking
		// Roam/global hotkey handlers from receiving these key events.
		event.stopImmediatePropagation();
		event.stopPropagation();
	};

	closeButton.addEventListener("click", onCloseButtonClick);
	window.addEventListener("click", onWindowClick);
	window.addEventListener("keydown", onWindowKeydownCapture, true);
	window.addEventListener("keydown", onWindowKeydown);

	modalCloseHandlers = {
		onCloseButtonClick,
		onWindowClick,
		onWindowKeydown,
		onWindowKeydownCapture,
	};
}

function cleanupModalCloseListeners() {
	if (!modalCloseHandlers) {
		return;
	}

	const modal = document.getElementById("rgef_modal");
	const closeButton = modal?.querySelector(".rgef_close");

	if (closeButton instanceof HTMLElement) {
		closeButton.removeEventListener(
			"click",
			modalCloseHandlers.onCloseButtonClick
		);
	}

	window.removeEventListener("click", modalCloseHandlers.onWindowClick);
	window.removeEventListener(
		"keydown",
		modalCloseHandlers.onWindowKeydownCapture,
		true
	);
	window.removeEventListener("keydown", modalCloseHandlers.onWindowKeydown);
	modalCloseHandlers = null;
}

async function commandCallback(block: any) {
	/*
    example block
    {
      "block-uid": "GV4vXZcxO",
      "page-uid": "09-02-2022",
      "window-id": "yvZiV2dlFhYyJp4ymQdMzVIIZF82-body-outline-09-02-2022",
      "read-only?": false,
      "block-string": "test",
      "heading": null
    }
  */

	const requestId = ++latestCommandRequestId;
	const blockUid = getBlockUidFromContext(block);
	const fallbackUid = await getCurrentPageOrBlockUid();
	const targetUid = blockUid || fallbackUid || "";
	exportModalContext = {
		targetUid,
		baseText: "",
		backlinksCache: {},
	};

	ensureModalCloseListeners();

	const modal = document.getElementById("rgef_modal");
	if (!(modal instanceof HTMLElement)) {
		return;
	}

	modal.style.display = "flex";
	setBodyScrollLocked(true);

	const input = modal.querySelector("#rgef_input");
	if (input instanceof HTMLTextAreaElement) {
		// Clear immediately so prior export content does not linger while loading.
		input.value = "";
	}
	render();

	try {
		const text = targetUid ? await iterateThroughTree(targetUid) : "";

		// Ignore stale async responses from older exports.
		if (requestId !== latestCommandRequestId) {
			return;
		}

		exportModalContext = {
			targetUid,
			baseText: text,
			backlinksCache:
				exportModalContext?.targetUid === targetUid
					? exportModalContext.backlinksCache
					: {},
		};
		applyModalInputFromContext(requestId);
	} catch (error) {
		// Keep UI stable on failed fetches and avoid stale content.
		if (requestId !== latestCommandRequestId) {
			return;
		}
		console.error("Could not load export formatter content.", error);
	}
}

async function commandPaletteCallback() {
	const fallbackUid = getFocusedBlockUid() ?? getCurrentBlockAlternative();
	await commandCallback(
		fallbackUid ? { "block-uid": fallbackUid } : ({} as Record<string, never>)
	);
}

async function exportWithReferencesCommand(blockContext?: any) {
	const contextUid = blockContext ? getBlockUidFromContext(blockContext) : "";
	const paletteFallbackUid =
		getFocusedBlockUid() ?? getCurrentBlockAlternative();
	const pageFallbackUid = await getCurrentPageOrBlockUid();
	const uid = contextUid || paletteFallbackUid || pageFallbackUid || "";

	if (!uid) {
		showToast("Could not find a page or block to export.", "error");
		return;
	}

	try {
		const result = await exportWithReferencesToClipboard(uid, {
			transformMarkdown: applyCurrentFormatterSettingsToMarkdown,
		});
		if (result.success) {
			showToast("Export with references copied to clipboard.");
			return;
		}

		showToast(result.error ?? "Failed to export with references.", "error");
	} catch (error) {
		console.error("Could not export with references.", error);
		showToast("Unexpected error while exporting with references.", "error");
	}
}

async function exportPageWithReferencesCommand() {
	const pageOrBlockUid = await getCurrentPageOrBlockUid();
	if (!pageOrBlockUid) {
		showToast("Could not determine the current page.", "error");
		return;
	}

	try {
		const result = await exportWithReferencesToClipboard(pageOrBlockUid, {
			forcePage: true,
			transformMarkdown: applyCurrentFormatterSettingsToMarkdown,
		});

		if (result.success) {
			showToast("Page export with references copied to clipboard.");
			return;
		}

		showToast(
			result.error ?? "Failed to export current page with references.",
			"error"
		);
	} catch (error) {
		console.error("Could not export page with references.", error);
		showToast(
			"Unexpected error while exporting current page with references.",
			"error"
		);
	}
}

async function onload({ extensionAPI }: { extensionAPI: any }) {
	//console.log("onload");

	await window.roamAlphaAPI.ui.blockContextMenu.addCommand({
		label: CONTEXT_MENU_COMMAND_LABEL,
		callback: commandCallback,
	});
	await window.roamAlphaAPI.ui.blockContextMenu.addCommand({
		label: CONTEXT_MENU_EXPORT_WITH_REFERENCES_LABEL,
		callback: exportWithReferencesCommand,
	});
	window.roamAlphaAPI.ui.commandPalette.addCommand({
		label: COMMAND_PALETTE_COMMAND_LABEL,
		callback: commandPaletteCallback,
	});
	window.roamAlphaAPI.ui.commandPalette.addCommand({
		label: COMMAND_PALETTE_EXPORT_WITH_REFERENCES_LABEL,
		callback: function () {
			void exportWithReferencesCommand();
		},
	});
	window.roamAlphaAPI.ui.commandPalette.addCommand({
		label: COMMAND_PALETTE_EXPORT_PAGE_WITH_REFERENCES_LABEL,
		callback: function () {
			void exportPageWithReferencesCommand();
		},
	});

	setupDOM();
	ensureModalCloseListeners();
	formatter_init();
	ensureSettingsChangeListeners();
}

async function onunload() {
	//console.log("onunload");

	await window.roamAlphaAPI.ui.blockContextMenu.removeCommand({
		label: CONTEXT_MENU_COMMAND_LABEL,
	});
	await window.roamAlphaAPI.ui.blockContextMenu.removeCommand({
		label: CONTEXT_MENU_EXPORT_WITH_REFERENCES_LABEL,
	});
	window.roamAlphaAPI.ui.commandPalette.removeCommand({
		label: COMMAND_PALETTE_COMMAND_LABEL,
	});
	window.roamAlphaAPI.ui.commandPalette.removeCommand({
		label: COMMAND_PALETTE_EXPORT_WITH_REFERENCES_LABEL,
	});
	window.roamAlphaAPI.ui.commandPalette.removeCommand({
		label: COMMAND_PALETTE_EXPORT_PAGE_WITH_REFERENCES_LABEL,
	});

	cleanupModalCloseListeners();
	cleanupSettingsChangeListeners();
	setBodyScrollLocked(false);
	cleanupDOM();
}

export default {
	onload,
	onunload,
};
