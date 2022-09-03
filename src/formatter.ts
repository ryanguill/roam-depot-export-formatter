const { Remarkable } = require("remarkable");
var md = new Remarkable({ breaks: true });

md.inline.ruler.enable(["ins", "mark", "sub", "sup"]);

// @ts-ignore
window.setSelectValue = setSelectValue;
function setSelectValue(
	id: string,
	value: string | null,
	set_to_default: boolean = false
) {
	const $target = document.getElementById(id) as HTMLSelectElement;

	if ($target === null) {
		//dont recognize this id
		return;
	}

	console.log({ id, value, set_to_default, found: $target !== null });

	const options = [...$target.options];

	if (!!set_to_default) {
		value = $target.dataset.default?.toString() ?? "";
	}
	let currentValue = $target.value;
	let maxIterations = value === null ? 1 : options.length;
	let iterationCount = 0;
	let newSelectedIndex;

	while (currentValue !== value) {
		iterationCount += 1;
		const selectedIndex = $target.selectedIndex;

		newSelectedIndex = selectedIndex + 1;
		if (newSelectedIndex > options.length - 1) {
			newSelectedIndex = 0;
		}
		$target.selectedIndex = newSelectedIndex;
		currentValue = $target.value;
		if (iterationCount >= maxIterations) {
			//we looped around and didnt find the target value, so stop
			break;
		}
	}

	$target.closest("div.rgef_setting")?.classList.remove("rgef_selected");
	$target.closest("div.rgef_setting")?.classList.remove("rgef_all");
	$target.closest("div.rgef_setting")?.classList.remove("rgef_zero");
	$target.closest("div.rgef_setting")?.classList.remove("rgef_one");
	$target.closest("div.rgef_setting")?.classList.remove("rgef_two");
	$target.closest("div.rgef_setting")?.classList.remove("rgef_three");
	if (currentValue === "true") {
		$target.closest("div.rgef_setting")?.classList.add("rgef_selected");
	} else if (currentValue === "999") {
		$target.closest("div.rgef_setting")?.classList.add("rgef_all");
	} else if (currentValue === "0") {
		$target.closest("div.rgef_setting")?.classList.add("rgef_zero");
	} else if (currentValue === "1") {
		$target.closest("div.rgef_setting")?.classList.add("rgef_one");
	} else if (currentValue === "2") {
		$target.closest("div.rgef_setting")?.classList.add("rgef_two");
	} else if (currentValue === "3") {
		$target.closest("div.rgef_setting")?.classList.add("rgef_three");
	}
}

function addEventListener(
	selector: string,
	eventName: string,
	eventHandler: (e: Event) => any
) {
	const el = [...document.querySelectorAll(selector)];

	el.forEach((e: Element) => e.addEventListener(eventName, eventHandler));
}

export function formatter_init() {
	addEventListener("label.rgef_toggle-on-click", "click", function (e) {
		const $target = (e.target as Element)?.querySelector("select");
		if (!$target) {
			return;
		}
		const id = $target.getAttribute("id");
		if (id === null) {
			return;
		}
		setSelectValue(id, null);
		saveSettingsToLocalStorage();

		render();
	});

	addEventListener("#rgef_input", "change", render);
	addEventListener("#rgef_input", "keyup", render);

	addEventListener(".rgef_reset-options", "click", function () {
		[...document.querySelectorAll(".rgef_hidden-select-setting")].forEach(
			function (ele) {
				const id = ele.getAttribute("id");
				if (id) {
					setSelectValue(id, null, true);
				}
			}
		);
		saveSettingsToLocalStorage();
		render();
	});

	render();
}

function saveSettingsToLocalStorage() {
	const settings = getSettingsFromDom();
	localStorage.setItem("rgef_settings", JSON.stringify(settings));
}

function loadSettingsFromLocalStorage() {
	const storedValue = localStorage.getItem("rgef_settings");
	if (storedValue) {
		const settings = JSON.parse(storedValue);
		for (let key of Object.keys(settings)) {
			// TODO: theres certainly a better way to do this, just getting it to work for now during the port
			let value = settings[key];
			if (value === true) {
				value = "true";
			} else if (value === false) {
				value = "false";
			}
			setSelectValue(`rgef_${key}`, value);
		}
	}
}

function getElementValue(selector: string): string | null {
	const element = document.querySelector(selector) as any;
	if (element) {
		return element.value;
	} else {
		return null;
	}
}

function setElementValue(selector: string, value: string): void {
	const element = document.querySelector(selector) as any;
	if (element) {
		element.value = value;
	}
}

interface settings {
	ignore_parent_node: boolean;
	flatten_indentation: number;
	remove_bullets: boolean;
	remove_double_brackets: boolean;
	remove_double_braces: boolean;
	remove_formatting: boolean;
	add_line_breaks: number;
	remove_colon_from_attributes: boolean;
	remove_quotes: boolean;
	remove_hashtag_marks: boolean;
	remove_todos: boolean;
	remove_namespaces: boolean;
}

function getSettingsFromDom(): settings {
	return {
		ignore_parent_node: getElementValue("#rgef_ignore_parent_node") === "true",
		flatten_indentation: Number(getElementValue("#rgef_flatten_indentation")),
		remove_bullets: getElementValue("#rgef_remove_bullets") === "true",
		remove_double_brackets:
			getElementValue("#rgef_remove_double_brackets") === "true",
		remove_double_braces:
			getElementValue("#rgef_remove_double_braces") === "true",
		remove_formatting: getElementValue("#rgef_remove_formatting") === "true",
		add_line_breaks: Number(getElementValue("#rgef_add_line_breaks")),
		remove_colon_from_attributes:
			getElementValue("#rgef_remove_colon_from_attributes") === "true",
		remove_quotes: getElementValue("#rgef_remove_quotes") === "true",
		remove_hashtag_marks:
			getElementValue("#rgef_remove_hashtag_marks") === "true",
		remove_todos: getElementValue("#rgef_remove_todos") === "true",
		remove_namespaces: getElementValue("#rgef_remove_namespaces") === "true",
	};
}

export function render() {
	loadSettingsFromLocalStorage();
	const settings = getSettingsFromDom();
	if (isNaN(settings.add_line_breaks)) {
		settings.add_line_breaks = 0;
	}

	//console.log(settings);

	const input = getElementValue("#rgef_input") ?? "";
	let result = input;

	if (settings.ignore_parent_node) {
		result = ignoreParentNode(result);
	}

	result = addLineBreaksBeforeParagraphs(result, settings.add_line_breaks);

	if (settings.flatten_indentation) {
		result = flattenIndentation(result, settings.flatten_indentation);
	}

	if (settings.remove_bullets) {
		result = removeBullets(result);
	}

	if (settings.remove_double_braces) {
		result = removeDoubleBraces(result);
	}

	if (settings.remove_todos) {
		result = removeTodos(result);
	}

	result = convertTodoAndDone(result);

	if (settings.remove_namespaces) {
		result = removeNamespaces(result);
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

	if (settings.remove_hashtag_marks) {
		//result = removeHashtagMarks(result);
		result = removeHashtags(result);
	}

	if (settings.remove_formatting) {
		result = removeFormatting(result);
	}

	setElementValue("#rgef_output", result);

	const rendered_output_element = document.getElementById(
		"rgef_rendered-output"
	);

	if (rendered_output_element) {
		rendered_output_element.innerHTML =
			md.render(convertForMarkdown(result), { gfm: true }) + `<br />`;
	}
}

function convertForMarkdown(input: string) {
	return input
		.split("\n")
		.map(function (line) {
			return line.replace(/__/gm, `_`);
		})
		.map(function (line) {
			return line.replace(/\^\^(.+)\^\^/gm, `==$1==`);
		})
		.map(function (line) {
			return line.replace(/\b(.+\:\:)/gm, `**$1**`);
		})
		.map(function (line) {
			if (line.trim().startsWith("- ")) {
				return line;
			} else {
				return line.replace(/\s\s\s\s/gm, "&nbsp;&nbsp;&nbsp;&nbsp;");
			}
		})
		.join("\n");
}

function convertTodoAndDone(input: string) {
	return input
		.split("\n")
		.map(function (line) {
			return line.replace("{{[[TODO]]}}", "☐").replace("{{[[DONE]]}}", "☑︎");
		})
		.join("\n");
}

function removeTodos(input: string) {
	return input
		.split("\n")
		.map(function (line) {
			return line
				.replace(/\{\{\[\[TODO\]\]\}\}\s?/, "")
				.replace(/\{\{\[\[DONE\]\]\}\}\s?/, "");
		})
		.join("\n");
}

function addLineBreaksBeforeParagraphs(
	input: string,
	numberOfLineBreaks: number
) {
	return input
		.split("\n")
		.map(function (line, index) {
			//dont add line breaks before the first paragraph
			if (index > 0 && numberOfLineBreaks > 0 && line.trimStart() === line) {
				return "\n".repeat(numberOfLineBreaks) + line;
			}
			return line;
		})
		.join("\n");
}

function ignoreParentNode(input: string) {
	return flattenIndentation(input.split("\n").slice(1).join("\n"), 1);
}

function flattenIndentation(input: string, flatten_indentation: number) {
	if (flatten_indentation > 5) {
		return input
			.split("\n")
			.map(function (line) {
				return line.trimStart();
			})
			.join("\n");
	} else {
		let output = input;
		for (let idx = 0; idx < flatten_indentation; idx++) {
			output = output
				.split("\n")
				.map(function (line) {
					return line.replace(/^\t(.+)/gm, "$1");
				})
				.join("\n");
		}
		return output;
	}
}

function removeBullets(input: string) {
	return input
		.split("\n")
		.map(function (line) {
			return line.replace(/^(\s*)-\s/gm, "$1");
		})
		.join("\n");
}

function removeColonFromAttributes(input: string) {
	return input
		.split("\n")
		.map(function (line) {
			return line.replace(/\b(.+)\:\:/gm, "$1:");
		})
		.join("\n");
}

function removeQuotes(input: string) {
	return input
		.split("\n")
		.map(function (line) {
			return line.replace(/\"(.+)\"/gm, "$1");
		})
		.join("\n");
}

function removeHashtagMarks(input: string): string {
	const regexp = /\#(.+)\b/gm;
	const result = input
		.split("\n")
		.map(function (line) {
			return line.replace(regexp, "$1");
		})
		.join("\n");

	const matches = [...result.matchAll(regexp)];
	if (matches.length > 0) {
		return removeHashtagMarks(result);
	}
	return result;
}

function removeHashtags(input: string) {
	const regexp = /(#(?:\[\[)?.+?)\s/gm; //this is close, but not quite right, doesnt work for #[[something else]]
	const result = input
		.split("\n")
		.map(function (line) {
			return line.replace(regexp, "");
		})
		.join("\n");

	const matches = [...result.matchAll(regexp)];
	if (matches.length > 0) {
		return removeHashtagMarks(result);
	}
	return result;
}

function removeDoubleBraces(input: string) {
	return input
		.split("\n")
		.map(function (line) {
			return line.replace(/\{\{([^\{\}]+)\}\}/gm, "$1");
		})
		.join("\n");
}

function removeNamespaces(input: string): string {
	const result = input
		.split("\n")
		.map(function (line) {
			return line.replace(/\[\[(.+?)\/(.+?)\]\]/gm, "[[$2]]");
		})
		.join("\n");

	const matches = [...result.matchAll(/\[\[(.+?)\/(.+?)\]\]/gm)];
	if (matches.length > 0) {
		return removeNamespaces(result);
	}
	return result;
}

function removeDoubleBrackets(input: string): string {
	const result = input
		.split("\n")
		.map(function (line) {
			return line
				.replace(/\[([^\[\]]+)\]\((\[\[|\(\()([^\[\]]+)(\]\]|\)\))\)/gm, "$1")
				.replace(/\[\[([^\[\]]+)\]\]/gm, "$1")
				.replace(/\(\(([^\(\)]+)\)\)/gm, "$1");
		})
		.join("\n");

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
		.split("\n")
		.map(function (line) {
			return line
				.replace(/\*\*(.+?)\*\*/gm, "$1")
				.replace(/\_\_(.+?)\_\_/gm, "$1")
				.replace(/\^\^(.+?)\^\^/gm, "$1");
		})
		.join("\n");
}
