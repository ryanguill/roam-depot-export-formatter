import "roamjs-components/types";
import { cleanupDOM, setupDOM } from "./dom";
import { formatter_init, render } from "./formatter";

import { iterateThroughTree } from "./utils";

const CONTEXT_MENU_COMMAND_LABEL = "Export Formatter";

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
	console.log("onload");

	await window.roamAlphaAPI.ui.blockContextMenu.addCommand({
		label: CONTEXT_MENU_COMMAND_LABEL,
		callback: commandCallback,
	});

	setupDOM();
	formatter_init();
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
