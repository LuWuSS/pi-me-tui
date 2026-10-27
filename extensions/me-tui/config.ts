import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type {
	ColorLevel,
	CurrentScope,
	FlexMode,
	GlobalOverrides,
	IconMode,
	Language,
	LineAlign,
	MeTuiConfig,
	NumberFormat,
	PaddingSide,
	PowerlineConfig,
	WidgetItem,
} from "./types.ts";
import { getWidget } from "./registry.ts";
import { clamp, createWidgetId, deepClone, isPlainObject, safeNumber, sanitizeSingleLine } from "./utils.ts";

export const CONFIG_VERSION = 1 as const;
export const MAX_LINES = 4;
/** Default lift applied to the label when bold is on, so prefixes change even where CJK bold is not synthesized. */
export const DEFAULT_BOLD_LIFT = 15;
/** Default glow strength. */
export const DEFAULT_GLOW_STRENGTH = 30;

function item(id: string, type: string, extra: Partial<WidgetItem> = {}): WidgetItem {
	return { id, type, ...extra };
}

export const DEFAULT_CONFIG: MeTuiConfig = {
	version: CONFIG_VERSION,
	enabled: true,
	language: "zh",
	icons: "auto",
	colorLevel: "auto",
	lines: [
		[
			item("provider", "provider", { color: "brightgreen", bold: false, rawValue: true }),
			item("model", "model", { color: "brightyellow", rawValue: true }),
			item("context-window-mvq15pvs-1", "context-window", { color: "brightyellow", rawValue: true }),
			item("thinking", "thinking", { color: "lime", rawValue: true }),
			item("git-branch", "git-branch", { color: "orange", rawValue: true }),
			item("git-changes", "git-changes", { color: "warning", rawValue: true }),
			item("l1-flex-left", "flex"),
			item("tokens-input", "tokens-input", {
				color: "brightgreen",
				labelOverride: "本轮：",
				rawValue: false,
				hideEmpty: true,
				fixedWidth: 15,
			}),
			item("tokens-output", "tokens-output", { color: "sky", rawValue: true, hideEmpty: true, fixedWidth: 10 }),
			item("tokens-total", "tokens-total", { color: "brightmagenta", rawValue: true, hideEmpty: true, fixedWidth: 10 }),
			item("tokens-cached", "tokens-cached", { color: "brightred", rawValue: true, hideEmpty: true, fixedWidth: 10 }),
			item("tokens-cache-hit-rate", "tokens-cache-hit-rate", { color: "sky", rawValue: true, hideEmpty: true, fixedWidth: 9 }),
			item("speed-input", "speed-input", { color: "coral", rawValue: true, fixedWidth: 13 }),
			item("speed-output", "speed-output", { color: "violet", rawValue: true, fixedWidth: 13 }),
			item("speed-total", "speed-total", { color: "gold", rawValue: true, fixedWidth: 13 }),
		],
		[
			item("context-length", "context-length", { color: "pink", rawValue: true }),
			item("context-bar", "context-bar", { color: "brightgreen", rawValue: true }),
			item("compaction-count", "compaction-count", { color: "sky", rawValue: false }),
			item("l2-flex-left", "flex"),
			item("tokens-total-input", "tokens-total-input", {
				color: "brightgreen",
				labelOverride: "总计：",
				rawValue: false,
				hideEmpty: true,
				fixedWidth: 15,
			}),
			item("tokens-total-output", "tokens-total-output", { color: "sky", rawValue: true, hideEmpty: true, fixedWidth: 10 }),
			item("tokens-total-mvhsl7uy-1", "tokens-total", { color: "brightmagenta", rawValue: true, hideEmpty: true, fixedWidth: 10 }),
			item("tokens-total-cached", "tokens-total-cached", { color: "brightred", rawValue: true, hideEmpty: true, fixedWidth: 10 }),
			item("tokens-total-cache-hit-rate", "tokens-total-cache-hit-rate", { color: "sky", rawValue: true, hideEmpty: true, fixedWidth: 9 }),
			item("speed-total-input", "speed-total-input", { color: "coral", rawValue: true, fixedWidth: 13 }),
			item("speed-total-output", "speed-total-output", { color: "violet", rawValue: true, fixedWidth: 13 }),
			item("speed-total-all", "speed-total-all", { color: "gold", rawValue: true, fixedWidth: 13 }),
		],
		[
			item("session-clock", "session-clock", { color: "gold", rawValue: true }),
			item("round-duration", "round-duration", { color: "brightblue", labelOverride: "单" }),
			item("total-round-duration", "total-round-duration", { color: "orange", labelOverride: "总", bold: false }),
			item("conversation-rounds", "conversation-rounds", { color: "brightyellow", rawValue: false }),
			item("model-calls", "model-calls", { color: "violet" }),
			item("flex-mvjbopxb-2", "flex"),
			item("session-name", "session-name", { color: "brightcyan" }),
			item("flex-mvjbnl30-1", "flex"),
			item("skills-mvq2sf8g-b", "skills", { color: "gold", hideEmpty: true }),
			item("memory", "memory", { color: "success" }),
			item("cwd-mvq2tvn8-d", "cwd", { color: "sky" }),
		],
	],
	lineAligns: ["flex", "flex", "flex", "flex"],
	flexMode: "full",
	compactThreshold: 60,
	defaultPaddingSide: "left",
	powerline: {
		enabled: false,
		theme: "default",
		separators: ["\ue0b0"],
		separatorInvertBackground: [false],
		startCaps: [],
		endCaps: [],
		autoAlign: true,
		continueThemeAcrossLines: false,
	},
	overrides: { bold: true, glow: true, boldLift: 0, glowStrength: 5 },
	gitCacheTtlSeconds: 5,
	customCommandCacheTtlSeconds: 0,
	terminalWidthCacheTtlSeconds: 5,
	refreshIntervalMs: 1000,
	currentScope: "agent",
};

export function defaultConfig(): MeTuiConfig {
	return deepClone(DEFAULT_CONFIG);
}

export function getConfigPath(): string {
	return join(getAgentDir(), "me-tui.json");
}

export function ensureConfigExists(onError?: (message: string) => void): MeTuiConfig {
	if (existsSync(getConfigPath())) return loadConfig(onError);
	const config = defaultConfig();
	saveConfig(config);
	return config;
}

export function loadConfig(onError?: (message: string) => void): MeTuiConfig {
	try {
		const raw = readFileSync(getConfigPath(), "utf8");
		return normalizeConfig(JSON.parse(raw));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		onError?.(`me-tui: failed to load config (${message}); using defaults`);
		return defaultConfig();
	}
}

export function saveConfig(config: MeTuiConfig): boolean {
	try {
		const path = getConfigPath();
		mkdirSync(dirname(path), { recursive: true });
		const temp = `${path}.${process.pid}.tmp`;
		writeFileSync(temp, JSON.stringify(config, null, 2) + "\n", "utf8");
		renameSync(temp, path);
		return true;
	} catch {
		return false;
	}
}

export function normalizeConfig(input: unknown): MeTuiConfig {
	const source = isPlainObject(input) ? input : {};
	const defaults = defaultConfig();
	return {
		version: CONFIG_VERSION,
		enabled: booleanValue(source.enabled, defaults.enabled),
		language: languageValue(source.language),
		icons: iconValue(source.icons),
		colorLevel: colorLevelValue(source.colorLevel),
		lines: normalizeLines(source.lines, defaults.lines),
		lineAligns: normalizeLineAligns(source.lineAligns, defaults.lineAligns),
		flexMode: flexModeValue(source.flexMode),
		compactThreshold: clampNumber(source.compactThreshold, 1, 100, defaults.compactThreshold),
		defaultPaddingSide: paddingValue(source.defaultPaddingSide),
		powerline: normalizePowerline(source.powerline),
		overrides: normalizeOverrides(source.overrides),
		gitCacheTtlSeconds: clampNumber(source.gitCacheTtlSeconds, 0, 3600, defaults.gitCacheTtlSeconds),
		customCommandCacheTtlSeconds: clampNumber(
			source.customCommandCacheTtlSeconds,
			0,
			3600,
			defaults.customCommandCacheTtlSeconds,
		),
		terminalWidthCacheTtlSeconds: clampNumber(
			source.terminalWidthCacheTtlSeconds,
			0,
			3600,
			defaults.terminalWidthCacheTtlSeconds,
		),
		refreshIntervalMs: clampNumber(source.refreshIntervalMs, 250, 60_000, defaults.refreshIntervalMs),
		currentScope: currentScopeValue(source.currentScope),
	};
}

function normalizeLines(input: unknown, fallback: WidgetItem[][]): WidgetItem[][] {
	if (!Array.isArray(input)) return deepClone(fallback);
	const ids = new Set<string>();
	const lines: WidgetItem[][] = [];
	for (const rawLine of input.slice(0, MAX_LINES)) {
		if (!Array.isArray(rawLine)) continue;
		const line: WidgetItem[] = [];
		for (const rawItem of rawLine) {
			if (!isPlainObject(rawItem)) continue;
			const type = typeof rawItem.type === "string" ? rawItem.type.trim() : "";
			if (!type || !getWidget(type)) continue;
			const id = typeof rawItem.id === "string" && rawItem.id.trim() ? rawItem.id.trim() : createWidgetId(type);
			const safeId = ids.has(id) ? createWidgetId(type) : id;
			ids.add(safeId);
			const normalized: WidgetItem = { id: safeId, type };
			copyOptionalString(rawItem, normalized, "color");
			copyOptionalString(rawItem, normalized, "backgroundColor");
			copyOptionalString(rawItem, normalized, "labelOverride");
			copyOptionalString(rawItem, normalized, "character");
			copyOptionalString(rawItem, normalized, "customText");
			copyOptionalString(rawItem, normalized, "customSymbol");
			copyOptionalString(rawItem, normalized, "command");
			copyOptionalString(rawItem, normalized, "cleanText");
			copyOptionalBoolean(rawItem, normalized, "bold");
			copyOptionalBoolean(rawItem, normalized, "dim");
			copyOptionalBoolean(rawItem, normalized, "glow");
			copyOptionalBoolean(rawItem, normalized, "rawValue");
			copyOptionalBoolean(rawItem, normalized, "hideEmpty");
			copyOptionalBoolean(rawItem, normalized, "preserveColors");
			if (typeof rawItem.maxWidth === "number" && rawItem.maxWidth > 0) {
				normalized.maxWidth = clamp(Math.round(rawItem.maxWidth), 1, 500);
			}
			if (typeof rawItem.fixedWidth === "number" && rawItem.fixedWidth > 0) {
				normalized.fixedWidth = clamp(Math.round(rawItem.fixedWidth), 1, 500);
			}
			if (typeof rawItem.timeoutMs === "number") {
				normalized.timeoutMs = clamp(Math.round(rawItem.timeoutMs), 100, 60_000);
			}
			if (isNumberFormat(rawItem.numberFormat)) normalized.numberFormat = rawItem.numberFormat;
			if (isPlainObject(rawItem.metadata)) {
				const metadata: Record<string, string> = {};
				for (const [key, value] of Object.entries(rawItem.metadata)) {
					if (typeof value === "string") metadata[key] = value;
					else if (typeof value === "number" || typeof value === "boolean") metadata[key] = String(value);
				}
				if (Object.keys(metadata).length > 0) normalized.metadata = metadata;
			}
			if (type === "custom-symbol" && normalized.customSymbol) {
				normalized.customSymbol = Array.from(normalized.customSymbol)[0] ?? normalized.customSymbol;
			}
			if (type === "separator" && normalized.character) {
				normalized.character = sanitizeSingleLine(normalized.character);
			}
			line.push(normalized);
		}
		if (line.length > 0) lines.push(line);
	}
	return lines.length > 0 ? lines : deepClone(fallback);
}

function normalizePowerline(input: unknown): PowerlineConfig {
	const source = isPlainObject(input) ? input : {};
	const defaults = DEFAULT_CONFIG.powerline;
	const separators = stringArray(source.separators, defaults.separators);
	const invert = booleanArray(source.separatorInvertBackground, defaults.separatorInvertBackground);
	return {
		enabled: booleanValue(source.enabled, defaults.enabled),
		theme: typeof source.theme === "string" && source.theme.trim() ? source.theme.trim() : defaults.theme,
		separators: separators.length > 0 ? separators.slice(0, 8) : defaults.separators,
		separatorInvertBackground: invert.slice(0, 8),
		startCaps: stringArray(source.startCaps, defaults.startCaps).slice(0, 4),
		endCaps: stringArray(source.endCaps, defaults.endCaps).slice(0, 4),
		autoAlign: booleanValue(source.autoAlign, defaults.autoAlign),
		continueThemeAcrossLines: booleanValue(source.continueThemeAcrossLines, defaults.continueThemeAcrossLines),
	};
}

function normalizeLineAligns(input: unknown, fallback: LineAlign[]): LineAlign[] {
	const source = Array.isArray(input) ? input : fallback;
	return Array.from({ length: MAX_LINES }, (_value, index) => lineAlignValue(source[index]));
}

function lineAlignValue(value: unknown): LineAlign {
	return value === "left" || value === "center" || value === "right" ? value : "flex";
}

function normalizeOverrides(input: unknown): GlobalOverrides {
	if (!isPlainObject(input)) return {};
	const result: GlobalOverrides = {};
	if (typeof input.fg === "string" && input.fg.trim()) result.fg = input.fg.trim();
	if (typeof input.bg === "string" && input.bg.trim()) result.bg = input.bg.trim();
	if (input.bold === true) result.bold = true;
	if (input.dim === true) result.dim = true;
	if (input.glow === true) result.glow = true;
	if (typeof input.boldLift === "number" && Number.isFinite(input.boldLift)) {
		result.boldLift = Math.round(clamp(input.boldLift, 0, 100));
	}
	if (typeof input.glowStrength === "number" && Number.isFinite(input.glowStrength)) {
		result.glowStrength = Math.round(clamp(input.glowStrength, 1, 100));
	}
	return result;
}

function copyOptionalString(source: Record<string, unknown>, target: WidgetItem, key: keyof WidgetItem): void {
	const value = source[key];
	if (typeof value === "string") {
		(target as unknown as Record<string, unknown>)[key] = value;
	}
}

function copyOptionalBoolean(source: Record<string, unknown>, target: WidgetItem, key: keyof WidgetItem): void {
	const value = source[key];
	if (typeof value === "boolean") {
		(target as unknown as Record<string, unknown>)[key] = value;
	}
}

function booleanValue(input: unknown, fallback: boolean): boolean {
	return typeof input === "boolean" ? input : fallback;
}

function clampNumber(input: unknown, min: number, max: number, fallback: number): number {
	return typeof input === "number" ? clamp(Math.round(input), min, max) : fallback;
}

function languageValue(input: unknown): Language {
	return input === "en" ? "en" : "zh";
}

function iconValue(input: unknown): IconMode {
	return input === "auto" || input === "nerd" || input === "ascii" || input === "unicode" ? input : "auto";
}

function colorLevelValue(input: unknown): ColorLevel {
	return input === "ansi16" || input === "ansi256" || input === "truecolor" || input === "auto" ? input : "auto";
}

function flexModeValue(input: unknown): FlexMode {
	return input === "full-minus-40" || input === "full-until-compact" || input === "full" ? input : "full";
}

function paddingValue(input: unknown): PaddingSide {
	return input === "left" || input === "right" || input === "both" ? input : "left";
}

function currentScopeValue(input: unknown): CurrentScope {
	return input === "turn" ? "turn" : "agent";
}

function isNumberFormat(input: unknown): input is NumberFormat {
	return input === "compact" || input === "full" || input === "comma";
}

function stringArray(input: unknown, fallback: string[]): string[] {
	if (!Array.isArray(input)) return [...fallback];
	return input.filter((value): value is string => typeof value === "string");
}

function booleanArray(input: unknown, fallback: boolean[]): boolean[] {
	if (!Array.isArray(input)) return [...fallback];
	return input.filter((value): value is boolean => typeof value === "boolean");
}

export function allItems(config: MeTuiConfig): WidgetItem[] {
	return config.lines.flat();
}

export function findItem(config: MeTuiConfig, id: string): { line: number; index: number; item: WidgetItem } | undefined {
	for (let line = 0; line < config.lines.length; line += 1) {
		const index = config.lines[line].findIndex((entry) => entry.id === id);
		if (index >= 0) return { line, index, item: config.lines[line][index] };
	}
	return undefined;
}

export function addItem(config: MeTuiConfig, line: number, itemToAdd: WidgetItem, afterId?: string): MeTuiConfig {
	const next = deepClone(config);
	const target = next.lines[clamp(line, 0, next.lines.length - 1)];
	const index = afterId ? target.findIndex((entry) => entry.id === afterId) : -1;
	if (index >= 0) target.splice(index + 1, 0, itemToAdd);
	else target.push(itemToAdd);
	return next;
}

export function replaceItem(config: MeTuiConfig, line: number, id: string, itemToAdd: WidgetItem): MeTuiConfig {
	const next = deepClone(config);
	const target = next.lines[line];
	if (!target) return next;
	const index = target.findIndex((entry) => entry.id === id);
	if (index < 0) return next;
	target[index] = itemToAdd;
	return next;
}

export function removeItem(config: MeTuiConfig, line: number, id: string): MeTuiConfig {
	const next = deepClone(config);
	const target = next.lines[line];
	if (!target) return next;
	const index = target.findIndex((entry) => entry.id === id);
	if (index >= 0) target.splice(index, 1);
	return next;
}

export function updateItem(config: MeTuiConfig, line: number, id: string, patch: Partial<WidgetItem>): MeTuiConfig {
	const next = deepClone(config);
	const target = next.lines[line];
	if (!target) return next;
	const index = target.findIndex((entry) => entry.id === id);
	if (index < 0) return next;
	target[index] = { ...target[index], ...patch, id: target[index].id, type: target[index].type };
	return next;
}

export function updateLineAlign(config: MeTuiConfig, line: number, align: LineAlign): MeTuiConfig {
	const next = deepClone(config);
	const aligns = [...(next.lineAligns ?? [])];
	for (let index = 0; index < MAX_LINES; index += 1) {
		if (!aligns[index]) aligns[index] = "flex";
	}
	aligns[Math.max(0, Math.min(MAX_LINES - 1, line))] = align;
	next.lineAligns = aligns;
	return next;
}

export function moveItem(config: MeTuiConfig, line: number, from: number, to: number): MeTuiConfig {
	const next = deepClone(config);
	const target = next.lines[line];
	if (!target) return next;
	if (from < 0 || from >= target.length) return next;
	const clampedTo = clamp(to, 0, target.length - 1);
	const [entry] = target.splice(from, 1);
	target.splice(clampedTo, 0, entry);
	return next;
}

export function addLine(config: MeTuiConfig): MeTuiConfig {
	if (config.lines.length >= MAX_LINES) return deepClone(config);
	const next = deepClone(config);
	next.lines.push([]);
	return next;
}

export function removeLine(config: MeTuiConfig, line: number): MeTuiConfig {
	if (config.lines.length <= 1) return deepClone(config);
	const next = deepClone(config);
	next.lines.splice(line, 1);
	return next;
}

export function lineCount(config: MeTuiConfig): number {
	return config.lines.length;
}

export function itemCount(config: MeTuiConfig): number {
	return allItems(config).length;
}

export function countTypes(config: MeTuiConfig): Map<string, number> {
	const counts = new Map<string, number>();
	for (const item of allItems(config)) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
	return counts;
}

export function configHasType(config: MeTuiConfig, ...types: string[]): boolean {
	const wanted = new Set(types);
	return allItems(config).some((item) => wanted.has(item.type));
}

export function configWithEnabled(config: MeTuiConfig, enabled: boolean): MeTuiConfig {
	const next = deepClone(config);
	next.enabled = enabled;
	return next;
}

export function numberOrFallback(value: unknown, fallback: number): number {
	return safeNumber(value, fallback);
}
