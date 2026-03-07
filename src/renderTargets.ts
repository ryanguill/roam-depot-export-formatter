import { BLOCK_DELIMITER } from "./index";

export const RENDER_TARGET_VALUES = [
	"word",
	"google_docs",
	"notion",
	"email",
	"github",
	"llm",
	"slack",
	"whatsapp",
	"telegram",
	"signal",
	"imessage",
	"google_chat",
	"line",
	"wechat",
	"matrix",
	"messaging",
	"excel",
	"google_sheets",
	"latex",
	"terminal",
] as const;

export type RenderTarget = (typeof RENDER_TARGET_VALUES)[number];

export const DEFAULT_RENDER_TARGET: RenderTarget = "whatsapp";
export const DEFAULT_RENDER_TARGET_GROUP = "documents";

export const RENDER_TARGET_LABELS: Record<RenderTarget, string> = {
	word: "Word",
	google_docs: "Google Docs",
	notion: "Notion",
	email: "Email",
	github: "GitHub",
	llm: "LLM",
	slack: "Slack",
	whatsapp: "WhatsApp",
	telegram: "Telegram",
	signal: "Signal",
	imessage: "iMessage",
	google_chat: "Google Chat",
	line: "LINE",
	wechat: "WeChat",
	matrix: "Matrix",
	messaging: "Messaging",
	excel: "Excel",
	google_sheets: "Google Sheets",
	latex: "LaTeX",
	terminal: "Terminal",
};

export const RENDER_TARGET_GROUPS = [
	{
		id: "documents",
		label: "Documents",
		targets: ["word", "google_docs", "notion"] as const,
	},
	{
		id: "email",
		label: "Email",
		targets: ["email"] as const,
	},
	{
		id: "messaging",
		label: "Messaging",
		targets: [
			"google_chat",
			"imessage",
			"line",
			"matrix",
			"messaging",
			"signal",
			"slack",
			"telegram",
			"wechat",
			"whatsapp",
		] as const,
	},
	{
		id: "spreadsheets",
		label: "Spreadsheets",
		targets: ["excel", "google_sheets"] as const,
	},
	{
		id: "technical",
		label: "Technical",
		targets: ["github", "llm", "latex", "terminal"] as const,
	},
] as const;

export type RenderTargetGroup = (typeof RENDER_TARGET_GROUPS)[number]["id"];

function mapLines(input: string, transformer: (line: string) => string): string {
	return input
		.split(BLOCK_DELIMITER)
		.map((line) => transformer(line))
		.join(BLOCK_DELIMITER);
}

type FenceChar = "`" | "~";
type FenceState = {
	inFence: boolean;
	fenceChar: FenceChar | "";
	fenceLength: number;
};
type FenceMapOptions = {
	normalizeBacktickFenceRunsToTriple?: boolean;
};

function findFenceRunLength(
	line: string,
	start: number,
	fenceChar: FenceChar
): number {
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
		if (findFenceRunLength(line, i, char as FenceChar) >= 3) {
			return i;
		}
	}
	return -1;
}

function findClosingFenceStart(
	line: string,
	start: number,
	fenceChar: FenceChar,
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

function normalizeFenceRun(
	fenceChar: FenceChar,
	fenceLength: number,
	options: FenceMapOptions
): string {
	if (options.normalizeBacktickFenceRunsToTriple && fenceChar === "`") {
		return "```";
	}
	return fenceChar.repeat(fenceLength);
}

function mapLineOutsideCodeFences(
	line: string,
	state: FenceState,
	transformer: (line: string) => string,
	options: FenceMapOptions
): string {
	let output = "";
	let cursor = 0;

	while (cursor < line.length) {
		if (!state.inFence) {
			const fenceStart = findNextFenceStart(line, cursor);
			if (fenceStart < 0) {
				output += transformer(line.slice(cursor));
				break;
			}

			output += transformer(line.slice(cursor, fenceStart));
			const fenceChar = line[fenceStart] as FenceChar;
			const fenceLength = findFenceRunLength(line, fenceStart, fenceChar);
			output += normalizeFenceRun(fenceChar, fenceLength, options);
			state.inFence = true;
			state.fenceChar = fenceChar;
			state.fenceLength = fenceLength;
			cursor = fenceStart + fenceLength;
			continue;
		}

		const closingFenceStart = findClosingFenceStart(
			line,
			cursor,
			state.fenceChar as FenceChar,
			state.fenceLength
		);
		if (closingFenceStart < 0) {
			output += line.slice(cursor);
			break;
		}

		output += line.slice(cursor, closingFenceStart);
		const closingFenceLength = findFenceRunLength(
			line,
			closingFenceStart,
			state.fenceChar as FenceChar
		);
		output += normalizeFenceRun(
			state.fenceChar as FenceChar,
			closingFenceLength,
			options
		);
		state.inFence = false;
		state.fenceChar = "";
		state.fenceLength = 0;
		cursor = closingFenceStart + closingFenceLength;
	}

	return output;
}

function mapLinesOutsideCodeFences(
	input: string,
	transformer: (line: string) => string,
	options: FenceMapOptions = {}
): string {
	const lines = input.split(BLOCK_DELIMITER);
	const outputLines: string[] = [];
	const fenceState: FenceState = {
		inFence: false,
		fenceChar: "",
		fenceLength: 0,
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		outputLines.push(
			mapLineOutsideCodeFences(line, fenceState, transformer, options)
		);
	}

	return outputLines.join(BLOCK_DELIMITER);
}

function normalizeMarkdownLinksForMessaging(line: string): string {
	return line.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");
}

function normalizeQuotePrefixForSlack(line: string): string {
	return line.replace(/^(\s*)(?:[-*+]|\d+\.)\s+>\s*/g, "$1> ");
}

function normalizeQuotePrefixForTelegram(line: string): string {
	return line.replace(/^(\s*)(?:[-*+]|\d+\.)\s+>\s*/g, "$1> ");
}

function normalizeQuotePrefixForWhatsApp(line: string): string {
	return line.replace(/^(\s*)(?:[-*+]|\d+\.)\s+>\s*/g, "$1> ");
}

function normalizeQuotePrefixForMarkdownTargets(line: string): string {
	return line.replace(/^(\s*)(?:[-*+]|\d+\.)\s+>\s*/g, "$1> ");
}

function mapNonInlineCodeSegments(
	line: string,
	transformer: (segment: string) => string
): string {
	return line
		.split(/(`[^`\n]*`)/g)
		.map((segment, index) => (index % 2 === 1 ? segment : transformer(segment)))
		.join("");
}

function convertSingleStarItalicsToUnderscore(segment: string): string {
	return segment.replace(
		/(^|[\s([{>"'])\*([^*\n]+?)\*(?=$|[\s)\]}<"'.,!?;:])/g,
		"$1_$2_"
	);
}

function convertSingleStarItalicsToDoubleUnderscore(segment: string): string {
	return segment.replace(
		/(^|[\s([{>"'])\*([^*\n]+?)\*(?=$|[\s)\]}<"'.,!?;:])/g,
		"$1__$2__"
	);
}

function normalizeMarkdownLinksForSlackComposer(segment: string): string {
	return segment.replace(
		/\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/g,
		(_match, label: string, url: string) => {
			const normalizedLabel = label.trim().replace(/\s+/g, " ");

			if (
				normalizedLabel.length === 0 ||
				/[|<>]/.test(normalizedLabel) ||
				/[|<>]/.test(url)
			) {
				return normalizedLabel.length === 0 ? url : `${normalizedLabel} (${url})`;
			}

			return `<${url}|${normalizedLabel}>`;
		}
	);
}

function convertMarkdownInlineForSlack(segment: string): string {
	return normalizeMarkdownLinksForSlackComposer(
		convertSingleStarItalicsToUnderscore(segment)
			.replace(/\*\*(.+?)\*\*/g, "*$1*")
			.replace(/__(.+?)__/g, "*$1*")
			.replace(/~~(.+?)~~/g, "~$1~")
	);
}

function convertMarkdownLinksForWhatsApp(segment: string): string {
	return segment.replace(
		/\[([^\]]*)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/g,
		(_match, label: string, url: string) => {
			const normalizedLabel = label.trim().replace(/\s+/g, " ");

			return normalizedLabel.length === 0 ? url : `${normalizedLabel} (${url})`;
		}
	);
}

function convertMarkdownInlineForWhatsApp(segment: string): string {
	return convertMarkdownLinksForWhatsApp(
		convertSingleStarItalicsToUnderscore(segment)
			.replace(/\*\*(.+?)\*\*/g, "*$1*")
			.replace(/__(.+?)__/g, "*$1*")
			.replace(/~~(.+?)~~/g, "~$1~")
	);
}

function convertMarkdownLinksForTelegram(segment: string): string {
	return segment.replace(
		/\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/g,
		(_match, label: string, url: string) => `${label.trim()} (${url})`
	);
}

function convertMarkdownInlineForTelegram(segment: string): string {
	return convertMarkdownLinksForTelegram(
		convertSingleStarItalicsToDoubleUnderscore(segment)
	);
}

function applySlackProfile(input: string): string {
	return mapLinesOutsideCodeFences(
		input,
		(line) =>
			mapNonInlineCodeSegments(
				normalizeQuotePrefixForSlack(line),
				convertMarkdownInlineForSlack
			),
		{ normalizeBacktickFenceRunsToTriple: true }
	);
}

function applyMessagingFamilyProfile(input: string): string {
	return mapLinesOutsideCodeFences(
		input,
		(line) =>
			mapNonInlineCodeSegments(line, (segment) =>
				normalizeMarkdownLinksForMessaging(segment)
					.replace(/\*\*(.+?)\*\*/g, "*$1*")
					.replace(/~~(.+?)~~/g, "~$1~")
			),
		{ normalizeBacktickFenceRunsToTriple: true }
	);
}

function stripUnsupportedMarkdownWrappersForPlainText(line: string): string {
	return line
		.replace(/\*\*(.+?)\*\*/g, "$1")
		.replace(/__(.+?)__/g, "$1")
		.replace(/~~(.+?)~~/g, "$1")
		.replace(
			/(^|[\s([{>"'])\*([^*\n]+?)\*(?=$|[\s)\]}<"'.,!?;:])/g,
			"$1$2"
		)
		.replace(
			/(^|[\s([{>"'])_([^_\n]+?)_(?=$|[\s)\]}<"'.,!?;:])/g,
			"$1$2"
		)
		.replace(
			/(^|[\s([{>"'])~([^~\n]+?)~(?=$|[\s)\]}<"'.,!?;:])/g,
			"$1$2"
		);
}

function normalizeMarkdownLinksForPlainTextMessaging(segment: string): string {
	return segment.replace(
		/\[([^\]]*)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/g,
		(_match, label: string, url: string) => {
			const normalizedLabel = label.trim().replace(/\s+/g, " ");

			if (normalizedLabel.length === 0 || normalizedLabel === url) {
				return url;
			}

			return `${normalizedLabel} (${url})`;
		}
	);
}

function applyPlainTextMessagingProfile(
	input: string,
	options: FenceMapOptions = {}
): string {
	return mapLinesOutsideCodeFences(
		input,
		(line) =>
			mapNonInlineCodeSegments(line, (segment) =>
				stripUnsupportedMarkdownWrappersForPlainText(
					normalizeMarkdownLinksForPlainTextMessaging(segment)
				)
			),
		options
	);
}

function applyWhatsAppProfile(input: string): string {
	return mapLinesOutsideCodeFences(
		input,
		(line) =>
			mapNonInlineCodeSegments(
				normalizeQuotePrefixForWhatsApp(line),
				convertMarkdownInlineForWhatsApp
			),
		{ normalizeBacktickFenceRunsToTriple: true }
	);
}

function applyTelegramProfile(input: string): string {
	return mapLinesOutsideCodeFences(
		input,
		(line) =>
			mapNonInlineCodeSegments(
				normalizeQuotePrefixForTelegram(line),
				convertMarkdownInlineForTelegram
			),
		{ normalizeBacktickFenceRunsToTriple: true }
	);
}

function applySignalProfile(input: string): string {
	return applyPlainTextMessagingProfile(input, {
		normalizeBacktickFenceRunsToTriple: true,
	});
}

function applyWordOrNotionProfile(input: string): string {
	return mapLinesOutsideCodeFences(input, (line) =>
		normalizeQuotePrefixForMarkdownTargets(line)
	);
}

function convertMarkdownLinksForLatex(segment: string): string {
	return segment.replace(
		/\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/g,
		(_match, label: string, url: string) => `${label} (\\url{${url}})`
	);
}

function applyLatexProfile(input: string): string {
	return mapLinesOutsideCodeFences(input, (line) =>
		mapNonInlineCodeSegments(
			normalizeQuotePrefixForMarkdownTargets(line),
			convertMarkdownLinksForLatex
		)
	);
}

export function applyRenderTargetProfile(
	input: string,
	target: RenderTarget
): string {
	switch (target) {
		case "slack":
			return applySlackProfile(input);
		case "whatsapp":
			return applyWhatsAppProfile(input);
		case "telegram":
			return applyTelegramProfile(input);
		case "google_chat":
		case "line":
		case "wechat":
		case "matrix":
		case "messaging":
			return applyMessagingFamilyProfile(input);
		case "signal":
			return applySignalProfile(input);
		case "imessage":
			return applyPlainTextMessagingProfile(input);
		case "excel":
		case "google_sheets":
		case "terminal":
			return applyPlainTextMessagingProfile(input);
		case "latex":
			return applyLatexProfile(input);
		case "email":
		case "word":
		case "google_docs":
		case "notion":
			return applyWordOrNotionProfile(input);
		case "github":
		case "llm":
			return input;
		default:
			return input;
	}
}

export function shouldPreferRichCopy(target: RenderTarget): boolean {
	return (
		target === "word" ||
		target === "google_docs" ||
		target === "notion" ||
		target === "email"
	);
}

export function shouldPreviewAsPlainText(target: RenderTarget): boolean {
	return (
		target === "slack" ||
		target === "whatsapp" ||
		target === "telegram" ||
		target === "google_chat" ||
		target === "line" ||
		target === "wechat" ||
		target === "matrix" ||
		target === "messaging" ||
		target === "excel" ||
		target === "google_sheets" ||
		target === "latex" ||
		target === "terminal" ||
		target === "signal" ||
		target === "imessage"
	);
}

export function isRenderTarget(value: unknown): value is RenderTarget {
	return (
		typeof value === "string" &&
		(RENDER_TARGET_VALUES as readonly string[]).includes(value)
	);
}

export function isRenderTargetGroup(value: unknown): value is RenderTargetGroup {
	return (
		typeof value === "string" &&
		RENDER_TARGET_GROUPS.some((group) => group.id === value)
	);
}

export function getRenderTargetLabel(target: RenderTarget): string {
	return RENDER_TARGET_LABELS[target] ?? target;
}

export function getTargetsForGroup(group: RenderTargetGroup): RenderTarget[] {
	const match = RENDER_TARGET_GROUPS.find((entry) => entry.id === group);
	return match ? [...match.targets] : [DEFAULT_RENDER_TARGET];
}

export function findGroupForTarget(target: RenderTarget): RenderTargetGroup {
	const match = RENDER_TARGET_GROUPS.find((entry) =>
		(entry.targets as readonly RenderTarget[]).includes(target)
	);
	return match ? match.id : DEFAULT_RENDER_TARGET_GROUP;
}
