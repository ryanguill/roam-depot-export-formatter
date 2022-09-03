import "roamjs-components/types";
import { cleanupDOM, setupDOM } from "./dom";
import { render } from "./formatter";

import { iterateThroughTree, htmlToElement } from "./utils";

const EXTENSION_NAME = "export-formatter";
const CONTEXT_MENU_COMMAND_LABEL = "Export Formatter";

function log(...args: any[]) {
	console.log(EXTENSION_NAME, ...args);
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

	const text = await iterateThroughTree(block["block-uid"]);

	var modal = document.getElementById("rgef_modal");
	modal.style.display = "block";

	(modal.querySelector("#rgef_input") as HTMLTextAreaElement).value = text;
	var span = document.getElementsByClassName("rgef_close")[0] as any;
	span.onclick = function () {
		modal.style.display = "none";
	};
	window.onclick = function (event) {
		if (event.target == modal) {
			modal.style.display = "none";
		}
	};
	render();
}

async function onload({ extensionAPI }: { extensionAPI: any }) {
	// try and add an item to the context menu
	console.log("onload");
	console.log(window);

	await window.roamAlphaAPI.ui.blockContextMenu.addCommand({
		label: CONTEXT_MENU_COMMAND_LABEL,
		callback: commandCallback,
	});

	setupDOM();
}

async function onunload() {
	console.log("onunload");

	await window.roamAlphaAPI.ui.blockContextMenu.removeCommand({
		label: CONTEXT_MENU_COMMAND_LABEL,
	});

	cleanupDOM();
}

export default {
	onload,
	onunload,
};
