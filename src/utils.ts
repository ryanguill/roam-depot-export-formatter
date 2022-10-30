import resolveRefs from "roamjs-components/dom/resolveRefs";
import { BLOCK_DELIMITER } from "./index";

export function getElementValue(selector: string): string | null {
	const element = document.querySelector(selector) as any;
	if (element) {
		return element.value;
	} else {
		return null;
	}
}

export function setElementValue(selector: string, value: string): void {
	const element = document.querySelector(selector) as any;
	if (element) {
		element.value = value;
	}
}

export function addEventListener(
	selector: string,
	eventName: string,
	eventHandler: (e: Event) => any
) {
	const el = [...document.querySelectorAll(selector)];

	el.forEach((e: Element) => e.addEventListener(eventName, eventHandler));
}

export function htmlToElement(html: string) {
	var template = document.createElement("template");
	html = html.trim(); // Never return a text node of whitespace as the result
	template.innerHTML = html;
	return template.content.firstChild;
}

export function setSettingDefault(
	extensionAPI: any,
	settingId: string,
	settingDefault: any
) {
	const storedSetting = extensionAPI.settings.get(settingId);
	if (storedSetting === null) {
		extensionAPI.settings.set(settingId, settingDefault);
		return settingDefault;
	}
	return storedSetting;
}

/*
	these next few funtions are taken and adapted from https://github.com/dvargas92495/roamjs-workbench
	Credit Dave Vargas @dvargas92495
*/
export type BlockInfo = {
	title: string;
	string: string;
	uid: string;
	heading: number;
	order: number;
	open: boolean;
	"view-type": string;
	"text-align": string;
	children: BlockInfo[];
	parents: BlockInfo[];
};

function getBlockInfoByUID(
	uid: string,
	withChildren: boolean = false,
	withParents: boolean = false
) {
	try {
		let q = `[:find (pull ?page
                   [:node/title :block/string :block/uid :block/heading :block/props 
                    :entity/attrs :block/open :block/text-align :children/view-type
                    :block/order
                    ${withChildren ? "{:block/children ...}" : ""}
                    ${withParents ? "{:block/parents ...}" : ""}
                   ])
                :where [?page :block/uid "${uid}"]  ]`;
		var results = window.roamAlphaAPI.q(q);
		if (results.length == 0) return null;
		return results as [BlockInfo][];
	} catch (e) {
		return null;
	}
}

export async function iterateThroughTree(uid: string, flatten = false) {
	const results = await getBlockInfoByUID(uid, true);
	return walkDocumentStructureAndFormat(
		results[0][0],
		0,
		async function pureText_TabIndented(
			blockText: string,
			nodeCurrent: BlockInfo,
			level = 0
		) {
			if (nodeCurrent?.title) return "";
			const leadingSpaces = "\t".repeat(level);
			return (
				blockText
					.split("\n")
					.map(function (line, index) {
						if (line.trim().length === 0) {
							line = " ";
						}
						if (index === 0) {
							return leadingSpaces + "- " + line;
						}
						return leadingSpaces + "  " + line;
					})
					.join("\n") + BLOCK_DELIMITER
			);
		},
		null,
		flatten
	);
}

async function walkDocumentStructureAndFormat(
	nodeCurrent: BlockInfo,
	level: number,
	outputFunction: (
		t: string,
		n: BlockInfo,
		l: number,
		p: BlockInfo,
		f: boolean
	) => Promise<string>,
	parent: BlockInfo,
	flatten: boolean
): Promise<string> {
	const mainText =
		typeof nodeCurrent.title !== "undefined"
			? await outputFunction(nodeCurrent.title, nodeCurrent, 0, parent, flatten)
			: typeof nodeCurrent.string !== "undefined"
			? await Promise.resolve(nodeCurrent.string).then(async (blockText) => {
					const embeds = await Promise.all(
						Array.from(
							blockText.matchAll(
								/\{\{(?:\[\[)embed(?:\]\])\:\s*\(\((.{9})\)\)\s*\}\}/g
							)
						).map(async (e) => {
							const uid = e[1];
							const node = getBlockInfoByUID(uid, true)[0][0];
							const output = await walkDocumentStructureAndFormat(
								node,
								level,
								outputFunction,
								parent,
								flatten
							);
							return {
								output,
								index: e.index,
								length: e[0].length,
							};
						})
					);
					const { text } = embeds.reduce(
						(p, c) => ({
							text: `${p.text.slice(0, c.index + p.offset)}${
								c.output
							}${p.text.slice(c.index + c.length + p.offset)}`,
							offset: p.offset + c.output.length - c.length,
						}),
						{ text: blockText, offset: 0 }
					);
					return outputFunction(
						resolveRefs(text),
						nodeCurrent,
						level,
						parent,
						flatten
					);
			  })
			: "";

	const childrenText =
		typeof nodeCurrent.children != "undefined"
			? await Promise.all(
					sortObjectsByOrder(nodeCurrent.children).map((orderedNode) =>
						walkDocumentStructureAndFormat(
							orderedNode,
							level + 1,
							outputFunction,
							nodeCurrent,
							flatten
						)
					)
			  ).then((children) => children.join(""))
			: "";
	return `${mainText}${childrenText}`;
}

export const sortObjectsByOrder = <T extends { order: number }>(o: T[]) => {
	return o.sort(function (a, b) {
		return a.order - b.order;
	});
};
