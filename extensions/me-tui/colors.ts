import type { Theme, ThemeBg, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { ColorLevel } from "./types.ts";

const RESET = "\x1b[0m";

const FOREGROUND_TOKENS = new Set<string>([
	"accent",
	"border",
	"borderAccent",
	"borderMuted",
	"success",
	"error",
	"warning",
	"muted",
	"dim",
	"text",
	"thinkingText",
	"scrollbarTrack",
	"scrollbarThumb",
	"searchMatchText",
	"userMessageText",
	"customMessageText",
	"customMessageLabel",
	"toolTitle",
	"toolOutput",
	"mdHeading",
	"mdLink",
	"mdLinkUrl",
	"mdCode",
	"mdCodeBlock",
	"mdCodeBlockBorder",
	"mdQuote",
	"mdQuoteBorder",
	"mdHr",
	"mdListBullet",
	"toolDiffAdded",
	"toolDiffRemoved",
	"toolDiffContext",
	"syntaxComment",
	"syntaxKeyword",
	"syntaxFunction",
	"syntaxVariable",
	"syntaxString",
	"syntaxNumber",
	"syntaxType",
	"syntaxOperator",
	"syntaxPunctuation",
	"thinkingOff",
	"thinkingMinimal",
	"thinkingLow",
	"thinkingMedium",
	"thinkingHigh",
	"thinkingXhigh",
	"thinkingMax",
	"bashMode",
]);

const BACKGROUND_TOKENS = new Set<string>([
	"selectedBg",
	"searchMatchBg",
	"userMessageBg",
	"customMessageBg",
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
]);

const NAMED_RGB: Record<string, [number, number, number]> = {
	black: [0, 0, 0],
	red: [205, 49, 49],
	green: [13, 188, 121],
	yellow: [229, 229, 16],
	blue: [36, 114, 200],
	magenta: [188, 63, 188],
	cyan: [17, 168, 205],
	white: [229, 229, 229],
	gray: [102, 102, 102],
	grey: [102, 102, 102],
	brightblack: [118, 118, 118],
	brightred: [241, 76, 76],
	brightgreen: [35, 209, 139],
	brightyellow: [245, 245, 67],
	brightblue: [59, 142, 234],
	brightmagenta: [214, 112, 214],
	brightcyan: [41, 184, 219],
	brightwhite: [255, 255, 255],
	orange: [255, 165, 0],
	purple: [155, 89, 182],
	pink: [255, 105, 180],
	teal: [0, 128, 128],
	lime: [50, 205, 50],
	navy: [0, 0, 128],
	silver: [192, 192, 192],
};

export function themeColorTokens(background = false): string[] {
	return [...(background ? BACKGROUND_TOKENS : FOREGROUND_TOKENS)];
}

export const NAMED_COLOR_SPECS: string[] = Object.keys(NAMED_RGB);

/** The eight basic named colors, in picker order. */
export const BASE_COLOR_SPECS: string[] = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

/**
 * Named colors in picker order: the eight basics, then the bright set, then the extras. The bright
 * colors carry most of the "bold" impression on a dark terminal, so they sit right after the basics
 * instead of behind the theme tokens.
 */
export const NAMED_COLOR_ORDER: string[] = [
	...BASE_COLOR_SPECS,
	...NAMED_COLOR_SPECS.filter((spec) => spec.startsWith("bright")),
	...NAMED_COLOR_SPECS.filter((spec) => !spec.startsWith("bright") && !BASE_COLOR_SPECS.includes(spec)),
];

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

export type ParsedColor =
	| { kind: "theme"; token: string }
	| { kind: "rgb"; rgb: Rgb }
	| undefined;

export function isThemeColor(spec: string | undefined): spec is ThemeColor {
	return typeof spec === "string" && FOREGROUND_TOKENS.has(spec);
}

export function isThemeBackground(spec: string | undefined): spec is ThemeBg {
	return typeof spec === "string" && BACKGROUND_TOKENS.has(spec);
}

export function parseColorSpec(spec: string | undefined): ParsedColor {
	if (!spec) return undefined;
	const value = spec.trim();
	if (!value) return undefined;
	if (FOREGROUND_TOKENS.has(value) || BACKGROUND_TOKENS.has(value)) {
		return { kind: "theme", token: value };
	}
	const hex = parseHex(value);
	if (hex) return { kind: "rgb", rgb: hex };
	const rgbMatch = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(value);
	if (rgbMatch) {
		return {
			kind: "rgb",
			rgb: {
				r: clampByte(Number(rgbMatch[1])),
				g: clampByte(Number(rgbMatch[2])),
				b: clampByte(Number(rgbMatch[3])),
			},
		};
	}
	const named = NAMED_RGB[value.toLowerCase().replace(/[-_\s]/g, "")];
	if (named) return { kind: "rgb", rgb: { r: named[0], g: named[1], b: named[2] } };
	const ansi = /^ansi:(\d{1,3})$/i.exec(value);
	if (ansi) {
		const index = Math.min(255, Math.max(0, Number(ansi[1])));
		return { kind: "rgb", rgb: ansi256ToRgb(index) };
	}
	return undefined;
}

export function isValidColorSpec(spec: string): boolean {
	return parseColorSpec(spec) !== undefined;
}

export function parseHex(value: string): Rgb | undefined {
	const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
	if (!match) return undefined;
	const hex = match[1];
	if (hex.length === 3) {
		return {
			r: parseInt(hex[0] + hex[0], 16),
			g: parseInt(hex[1] + hex[1], 16),
			b: parseInt(hex[2] + hex[2], 16),
		};
	}
	return {
		r: parseInt(hex.slice(0, 2), 16),
		g: parseInt(hex.slice(2, 4), 16),
		b: parseInt(hex.slice(4, 6), 16),
	};
}

function clampByte(value: number): number {
	return Math.min(255, Math.max(0, Math.round(value)));
}

export function brightenRgb(rgb: Rgb, amount = 0.45): Rgb {
	const ratio = Math.max(0, Math.min(1, amount));
	return {
		r: clampByte(rgb.r + (255 - rgb.r) * ratio),
		g: clampByte(rgb.g + (255 - rgb.g) * ratio),
		b: clampByte(rgb.b + (255 - rgb.b) * ratio),
	};
}

/** Matches a single foreground sequence anywhere in an escape string. */
const FOREGROUND_SEQUENCE = /\x1b\[(?:38;2;\d+;\d+;\d+|38;5;\d+|3[0-7]|9[0-7])m/;

export function brightenAnsi(ansi: string, amount: number, level: "ansi16" | "ansi256" | "truecolor"): string {
	if (!ansi) return ansi;
	const match = FOREGROUND_SEQUENCE.exec(ansi);
	if (!match) return ansi;
	// Theme tokens may come back as a color plus extra attributes (dim tokens append SGR 2);
	// only the color is lifted, the rest of the sequence is preserved.
	return (
		ansi.slice(0, match.index) +
		brightenSequence(match[0], amount, level) +
		ansi.slice(match.index + match[0].length)
	);
}

function brightenSequence(sequence: string, amount: number, level: "ansi16" | "ansi256" | "truecolor"): string {
	const trueColor = /^\x1b\[38;2;(\d+);(\d+);(\d+)m$/.exec(sequence);
	if (trueColor) {
		return rgbForeground(
			brightenRgb({ r: Number(trueColor[1]), g: Number(trueColor[2]), b: Number(trueColor[3]) }, amount),
			level,
		);
	}
	const palette = /^\x1b\[38;5;(\d+)m$/.exec(sequence);
	if (palette) return rgbForeground(brightenRgb(ansi256ToRgb(Number(palette[1])), amount), level);
	const basic = /^\x1b\[(3[0-7]|9[0-7])m$/.exec(sequence);
	if (basic) {
		const code = Number(basic[1]);
		return code >= 90 ? sequence : "\x1b[" + (code + 60) + "m";
	}
	return sequence;
}

export function brightenAnsiText(
	text: string,
	amount: number,
	level: "ansi16" | "ansi256" | "truecolor",
): string {
	if (!text) return text;
	return text.replace(
		/\x1b\[(?:38;2;\d+;\d+;\d+|38;5;\d+|3[0-7]|9[0-7])m/g,
		(sequence) => brightenAnsi(sequence, amount, level),
	);
}

export function colorLevel(level: ColorLevel, theme: Theme): "ansi16" | "ansi256" | "truecolor" {
	if (level === "auto") return theme.getColorMode() === "truecolor" ? "truecolor" : "ansi256";
	return level;
}

export function fgAnsi(spec: string | undefined, theme: Theme, level: ColorLevel): string {
	const parsed = parseColorSpec(spec);
	if (!parsed) return "";
	if (parsed.kind === "theme") {
		if (!isThemeColor(parsed.token)) return "";
		return theme.getFgAnsi(parsed.token);
	}
	return rgbForeground(parsed.rgb, colorLevel(level, theme));
}

export function bgAnsi(spec: string | undefined, theme: Theme, level: ColorLevel): string {
	const parsed = parseColorSpec(spec);
	if (!parsed) return "";
	if (parsed.kind === "theme") {
		if (!isThemeBackground(parsed.token)) return "";
		return theme.getBgAnsi(parsed.token);
	}
	return rgbBackground(parsed.rgb, colorLevel(level, theme));
}

export function paint(
	text: string,
	options: {
		fg?: string;
		bg?: string;
		bold?: boolean;
		dim?: boolean;
		theme: Theme;
		level: ColorLevel;
	},
): string {
	if (!text) return text;
	let open = "";
	if (options.fg) open += fgAnsi(options.fg, options.theme, options.level);
	if (options.bg) open += bgAnsi(options.bg, options.theme, options.level);
	if (options.bold) open += "\x1b[1m";
	if (options.dim) open += "\x1b[2m";
	if (!open) return text;
	return open + text + RESET;
}

export function paintRgb(text: string, fg: Rgb | undefined, bg: Rgb | undefined, bold = false): string {
	let open = "";
	if (fg) open += rgbForeground(fg, "truecolor");
	if (bg) open += rgbBackground(bg, "truecolor");
	if (bold) open += "\x1b[1m";
	if (!open) return text;
	return open + text + RESET;
}

export function rgbForeground(rgb: Rgb, level: "ansi16" | "ansi256" | "truecolor"): string {
	if (level === "truecolor") return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m`;
	if (level === "ansi256") return `\x1b[38;5;${rgbToAnsi256(rgb)}m`;
	return `\x1b[${ansi16Code(rgbToAnsi16(rgb), false)}m`;
}

export function rgbBackground(rgb: Rgb, level: "ansi16" | "ansi256" | "truecolor"): string {
	if (level === "truecolor") return `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m`;
	if (level === "ansi256") return `\x1b[48;5;${rgbToAnsi256(rgb)}m`;
	return `\x1b[${ansi16Code(rgbToAnsi16(rgb), true)}m`;
}

function ansi16Code(index: number, background: boolean): number {
	if (index < 8) return (background ? 40 : 30) + index;
	return (background ? 100 : 90) + (index - 8);
}

export function rgbToAnsi256(rgb: Rgb): number {
	const r = Math.round((rgb.r / 255) * 5);
	const g = Math.round((rgb.g / 255) * 5);
	const b = Math.round((rgb.b / 255) * 5);
	const cube = 16 + 36 * r + 6 * g + b;
	const average = (rgb.r + rgb.g + rgb.b) / 3;
	if (Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) < 10) {
		if (average < 8) return 16;
		if (average > 248) return 231;
		return 232 + Math.round(((average - 8) / 247) * 24);
	}
	return cube;
}

const ANSI16_PALETTE: Rgb[] = [
	{ r: 0, g: 0, b: 0 },
	{ r: 128, g: 0, b: 0 },
	{ r: 0, g: 128, b: 0 },
	{ r: 128, g: 128, b: 0 },
	{ r: 0, g: 0, b: 128 },
	{ r: 128, g: 0, b: 128 },
	{ r: 0, g: 128, b: 128 },
	{ r: 192, g: 192, b: 192 },
	{ r: 128, g: 128, b: 128 },
	{ r: 255, g: 0, b: 0 },
	{ r: 0, g: 255, b: 0 },
	{ r: 255, g: 255, b: 0 },
	{ r: 0, g: 0, b: 255 },
	{ r: 255, g: 0, b: 255 },
	{ r: 0, g: 255, b: 255 },
	{ r: 255, g: 255, b: 255 },
];

export function rgbToAnsi16(rgb: Rgb): number {
	let best = 0;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (let index = 0; index < ANSI16_PALETTE.length; index += 1) {
		const color = ANSI16_PALETTE[index];
		const distance =
			(color.r - rgb.r) ** 2 * 0.3 + (color.g - rgb.g) ** 2 * 0.59 + (color.b - rgb.b) ** 2 * 0.11;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = index;
		}
	}
	return best;
}

export function ansi256ToRgb(index: number): Rgb {
	if (index < 16) return ANSI16_PALETTE[index];
	if (index < 232) {
		const value = index - 16;
		const r = Math.floor(value / 36);
		const g = Math.floor((value % 36) / 6);
		const b = value % 6;
		const steps = [0, 95, 135, 175, 215, 255];
		return { r: steps[r], g: steps[g], b: steps[b] };
	}
	const gray = 8 + (index - 232) * 10;
	return { r: gray, g: gray, b: gray };
}

export function contrastColor(background: Rgb): Rgb {
	const luminance = (0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b) / 255;
	return luminance > 0.6 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
}

export const POWERLINE_THEMES: Record<string, string[]> = {
	default: ["#005f87", "#0087af", "#00afaf", "#5faf5f", "#d7af5f", "#d75f5f"],
	"tokyo-night": ["#7aa2f7", "#bb9af7", "#7dcfff", "#9ece6a", "#e0af68", "#f7768e"],
	dracula: ["#6272a4", "#bd93f9", "#ff79c6", "#50fa7b", "#f1fa8c", "#ffb86c"],
	nord: ["#5e81ac", "#81a1c1", "#88c0d0", "#8fbcbb", "#a3be8c", "#ebcb8b"],
	gruvbox: ["#458588", "#689d6a", "#98971a", "#d79921", "#d65d0e", "#b16286"],
	catppuccin: ["#89b4fa", "#cba6f7", "#f5c2e7", "#a6e3a1", "#f9e2af", "#fab387"],
	solarized: ["#268bd2", "#2aa198", "#859900", "#b58900", "#cb4b16", "#d33682"],
};

export const POWERLINE_THEME_NAMES = Object.keys(POWERLINE_THEMES);

export function powerlinePalette(theme: string | undefined): Rgb[] {
	const colors = POWERLINE_THEMES[theme ?? "default"] ?? POWERLINE_THEMES.default;
	return colors.map((color) => parseHex(color) ?? { r: 0, g: 0, b: 0 });
}

export function powerlineColorAt(theme: string | undefined, index: number): Rgb {
	const palette = powerlinePalette(theme);
	return palette[((index % palette.length) + palette.length) % palette.length];
}
