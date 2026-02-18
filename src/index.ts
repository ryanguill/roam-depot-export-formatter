/// <reference types="roamjs-components/types" />
import { cleanupDOM, setupDOM } from "./dom";
import { formatter_init, render } from "./formatter";

import { iterateThroughTree } from "./utils";

const CONTEXT_MENU_COMMAND_LABEL = "Export Formatter";

export const BLOCK_DELIMITER = String.fromCharCode(30); // record separator

type ModalCloseHandlers = {
	onCloseButtonClick: () => void;
	onWindowClick: (event: MouseEvent) => void;
	onWindowKeydown: (event: KeyboardEvent) => void;
	onWindowKeydownCapture: (event: KeyboardEvent) => void;
};

let modalCloseHandlers: ModalCloseHandlers | null = null;
let previousBodyOverflow: string | null = null;
let latestCommandRequestId = 0;

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
		const focused = (window as any)?.roamAlphaAPI?.ui?.getFocusedBlock?.();
		const focusedUid =
			focused?.["block-uid"] ?? focused?.blockUid ?? focused?.uid ?? "";
		return typeof focusedUid === "string" ? focusedUid.trim() : "";
	} catch (_error) {
		return "";
	}
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
		const text = blockUid ? await iterateThroughTree(blockUid) : "";

		// Ignore stale async responses from older exports.
		if (requestId !== latestCommandRequestId) {
			return;
		}

		const latestInput = modal.querySelector("#rgef_input");
		if (latestInput instanceof HTMLTextAreaElement) {
			latestInput.value = text;
		}

		render();
	} catch (error) {
		// Keep UI stable on failed fetches and avoid stale content.
		if (requestId !== latestCommandRequestId) {
			return;
		}
		console.error("Could not load export formatter content.", error);
	}
}

async function onload({ extensionAPI }: { extensionAPI: any }) {
	//console.log("onload");

	await window.roamAlphaAPI.ui.blockContextMenu.addCommand({
		label: CONTEXT_MENU_COMMAND_LABEL,
		callback: commandCallback,
	});

	setupDOM();
	ensureModalCloseListeners();
	formatter_init();
}

async function onunload() {
	//console.log("onunload");

	await window.roamAlphaAPI.ui.blockContextMenu.removeCommand({
		label: CONTEXT_MENU_COMMAND_LABEL,
	});

	cleanupModalCloseListeners();
	setBodyScrollLocked(false);
	cleanupDOM();
}

export default {
	onload,
	onunload,
};
