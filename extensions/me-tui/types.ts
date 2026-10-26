import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-ai";
import type { IconSet } from "./icons.ts";

export type Language = "zh" | "en";
export type IconMode = "auto" | "nerd" | "unicode" | "ascii";
export type ColorLevel = "auto" | "ansi16" | "ansi256" | "truecolor";
export type FlexMode = "full" | "full-minus-40" | "full-until-compact";
export type PaddingSide = "both" | "left" | "right";
export type NumberFormat = "compact" | "full" | "comma";
export type CurrentScope = "agent" | "turn";
export type WidgetCategory = "core" | "git" | "token" | "speed" | "context" | "session" | "env" | "custom" | "layout";

export interface LocalizedText {
	zh: string;
	en: string;
}

export type LineAlign = "flex" | "left" | "center" | "right";

export interface WidgetItem {
	id: string;
	type: string;
	color?: string;
	backgroundColor?: string;
	bold?: boolean;
	dim?: boolean;
	glow?: boolean;
	rawValue?: boolean;
	labelOverride?: string;
	character?: string;
	customText?: string;
	customSymbol?: string;
	command?: string;
	maxWidth?: number;
	timeoutMs?: number;
	numberFormat?: NumberFormat;
	hideEmpty?: boolean;
	cleanText?: string;
	preserveColors?: boolean;
	metadata?: Record<string, string>;
}

export interface PowerlineConfig {
	enabled: boolean;
	theme?: string;
	separators: string[];
	separatorInvertBackground: boolean[];
	startCaps: string[];
	endCaps: string[];
	autoAlign: boolean;
	continueThemeAcrossLines: boolean;
}

export interface GlobalOverrides {
	fg?: string;
	bg?: string;
	bold?: boolean;
	dim?: boolean;
	glow?: boolean;
	/** Extra lift applied to the label when bold is on, 0-100. 0 keeps the color untouched. */
	boldLift?: number;
	/** Glow strength, 1-100. */
	glowStrength?: number;
}

export interface MeTuiConfig {
	version: 1;
	enabled: boolean;
	language: Language;
	icons: IconMode;
	colorLevel: ColorLevel;
	lines: WidgetItem[][];
	lineAligns: LineAlign[];
	flexMode: FlexMode;
	compactThreshold: number;
	defaultPaddingSide: PaddingSide;
	powerline: PowerlineConfig;
	overrides: GlobalOverrides;
	gitCacheTtlSeconds: number;
	customCommandCacheTtlSeconds: number;
	terminalWidthCacheTtlSeconds: number;
	refreshIntervalMs: number;
	currentScope: CurrentScope;
}

export interface GitWorktreeInfo {
	mode: "main" | "linked" | "bare";
	name: string;
	branch?: string;
	path?: string;
	isMain: boolean;
}

export interface GitInfo {
	isRepo: boolean;
	root: string;
	rootName: string;
	branch: string;
	sha: string;
	ahead: number;
	behind: number;
	hasUpstream: boolean;
	upstreamName: string;
	originOwner: string;
	originRepo: string;
	originWebUrl: string;
	upstreamOwner: string;
	upstreamRepo: string;
	isFork: boolean;
	staged: number;
	unstaged: number;
	untracked: number;
	conflicted: number;
	modified: number;
	deleted: number;
	renamed: number;
	added: number;
	insertions: number;
	deletions: number;
	worktree: GitWorktreeInfo;
}

export interface UsageTiming {
	/** Prompt tokens (input + cacheRead + cacheWrite) for responses with a TTFT sample. */
	prefillTokens: number;
	/** Sum of TTFT samples, in milliseconds. */
	prefillMs: number;
	/** Output tokens for responses with decode timing. */
	decodeTokens: number;
	/** Sum of (durationMs - TTFT) samples, in milliseconds. */
	decodeMs: number;
	/** Total tokens (prompt + output) for responses with durationMs. */
	totalTokens: number;
	/** Sum of durationMs samples, in milliseconds. */
	totalMs: number;
}

export interface UsageBucket {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	durationMs: number;
	messageCount: number;
	firstTimestamp?: number;
	lastTimestamp?: number;
	cacheHitRate?: number;
	timing: UsageTiming;
}

export interface SessionStats {
	/** Number of completed conversation rounds (user message followed by at least one assistant reply). */
	rounds: number;
	/** Number of assistant messages, i.e. model calls. */
	modelCalls: number;
	/** Duration of the most recent round, in milliseconds. */
	currentRoundMs: number;
	/** Sum of all round durations, in milliseconds. */
	totalRoundMs: number;
}

export interface UsageSnapshot {
	current: UsageBucket;
	turn: UsageBucket;
	total: UsageBucket;
	stats: SessionStats;
}

export interface SkillInvocation {
	kind: "skill" | "mcp" | "tool";
	name: string;
	server?: string;
	timestamp: number;
}

export interface CustomCommandValue {
	text: string;
	at: number;
	failed?: boolean;
}

export interface MeTuiState {
	git: GitInfo;
	usage: UsageSnapshot;
	sessionStart: number;
	terminalWidth: number;
	terminalWidthUpdatedAt: number;
	skills: SkillInvocation[];
	skillTotal: number;
	compactions: number;
	customCommands: Map<string, CustomCommandValue>;
	gitUpdatedAt: number;
}

export interface WidgetRenderContext {
	pi: ExtensionAPI;
	ctx: ExtensionContext;
	theme: Theme;
	config: MeTuiConfig;
	state: MeTuiState;
	width: number;
	icons: IconSet;
	language: Language;
	colorLevel: ColorLevel;
	now: number;
}

export interface OptionValue {
	value: string;
	label: LocalizedText;
}

export interface WidgetOption {
	key: string;
	kind: "boolean" | "enum" | "number" | "text" | "color";
	label: LocalizedText;
	description?: LocalizedText;
	field: string;
	values?: OptionValue[];
	min?: number;
	max?: number;
	step?: number;
	placeholder?: LocalizedText;
}

export interface WidgetDefinition {
	type: string;
	category: WidgetCategory;
	name: LocalizedText;
	description: LocalizedText;
	defaultColor: string;
	defaultLabel?: LocalizedText;
	supportsLabel: boolean;
	supportsRawValue: boolean;
	priority: number;
	defaultItem?: Partial<WidgetItem>;
	options?: WidgetOption[];
	render: (item: WidgetItem, rc: WidgetRenderContext) => string | null;
}

export interface ModelMeta {
	provider: string;
	model: string;
	thinking?: ThinkingLevel;
	reasoning: boolean;
}
