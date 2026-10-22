import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { MeTuiConfig, MeTuiState, UsageBucket, UsageTiming, WidgetRenderContext } from "../extensions/me-tui/types.ts";
import { defaultConfig } from "../extensions/me-tui/config.ts";
import { emptyGitInfo } from "../extensions/me-tui/git.ts";
import { resolveIcons } from "../extensions/me-tui/icons.ts";
import { createInitialState } from "../extensions/me-tui/state.ts";

const identity = (text: string): string => text;

export function fakeTheme(): Theme {
	return {
		fg: (_color: string, text: string) => text,
		bg: (_color: string, text: string) => text,
		bold: identity,
		dim: identity,
		italic: identity,
		underline: identity,
		inverse: identity,
		strikethrough: identity,
		style: (_text: string) => _text,
		getFgAnsi: () => "",
		getBgAnsi: () => "",
		getColorMode: () => "truecolor",
		getThinkingBorderColor: () => "",
		colors: {},
	} as unknown as Theme;
}

export function bucket(
	values: Partial<Omit<UsageBucket, "timing">> & { timing?: Partial<UsageTiming> } = {},
): UsageBucket {
	const { timing, ...rest } = values;
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		durationMs: 0,
		messageCount: 0,
		...rest,
		timing: {
			prefillTokens: 0,
			prefillMs: 0,
			decodeTokens: 0,
			decodeMs: 0,
			totalTokens: 0,
			totalMs: 0,
			...(timing ?? {}),
		},
	};
}

export function fakeState(now = Date.now()): MeTuiState {
	const state = createInitialState(now - 125_000);
	state.git = {
		...emptyGitInfo(),
		isRepo: true,
		root: "C:/work/pi-me-tui",
		rootName: "pi-me-tui",
		branch: "main",
		sha: "abc1234",
		ahead: 2,
		behind: 1,
		hasUpstream: true,
		upstreamName: "origin/main",
		originOwner: "acme",
		originRepo: "pi-me-tui",
		originWebUrl: "https://github.com/acme/pi-me-tui",
		upstreamOwner: "upstream",
		upstreamRepo: "pi-me-tui",
		isFork: true,
		staged: 2,
		unstaged: 1,
		untracked: 3,
		conflicted: 0,
		modified: 3,
		insertions: 42,
		deletions: 7,
		worktree: { mode: "main", name: "main", branch: "main", isMain: true },
	};
	state.usage = {
		stats: { rounds: 2, modelCalls: 3, currentRoundMs: 15_000, totalRoundMs: 125_000 },
		current: bucket({
			input: 1300,
			output: 800,
			cacheRead: 300,
			cacheWrite: 100,
			totalTokens: 2400,
			durationMs: 2500,
			messageCount: 2,
			cacheHitRate: 17.6,
			timing: {
				prefillTokens: 1600,
				prefillMs: 500,
				decodeTokens: 800,
				decodeMs: 2000,
				totalTokens: 2400,
				totalMs: 2500,
			},
		}),
		turn: bucket({
			input: 700,
			output: 400,
			cacheRead: 100,
			cacheWrite: 50,
			totalTokens: 1200,
			durationMs: 1000,
			messageCount: 1,
			cacheHitRate: 11.8,
			timing: {
				prefillTokens: 800,
				prefillMs: 250,
				decodeTokens: 400,
				decodeMs: 750,
				totalTokens: 1200,
				totalMs: 1000,
			},
		}),
		total: bucket({
			input: 12_300,
			output: 8000,
			cacheRead: 3000,
			cacheWrite: 1000,
			totalTokens: 23_300,
			durationMs: 20_000,
			messageCount: 8,
			cacheHitRate: 18.4,
			timing: {
				prefillTokens: 16_300,
				prefillMs: 5000,
				decodeTokens: 8000,
				decodeMs: 15_000,
				totalTokens: 23_300,
				totalMs: 20_000,
			},
		}),
	};
	state.skills = [{ kind: "skill", name: "review", timestamp: now - 5000 }];
	state.skillTotal = 1;
	return state;
}

export function fakeContext(now = Date.now()): ExtensionContext {
	const context = {
		cwd: "C:/work/pi-me-tui",
		model: {
			provider: "anthropic",
			name: "Claude Sonnet",
			id: "claude-sonnet",
			reasoning: true,
			contextWindow: 200_000,
		},
		thinkingLevel: "medium",
		getContextUsage: () => ({ tokens: 25_000, contextWindow: 200_000, percent: 12.5 }),
		sessionManager: {
			getSessionName: () => "demo",
			getSessionId: () => "session-1",
			getEntries: () => [],
		},
	} as unknown as ExtensionContext;
	return context;
}

export function fakePi(): ExtensionAPI {
	return {
		getThinkingLevel: () => "medium",
		getSessionName: () => "demo",
		getCommands: () => [],
		getAllTools: () => [],
	} as unknown as ExtensionAPI;
}

export function renderContext(
	overrides: Partial<WidgetRenderContext> & { config?: MeTuiConfig; now?: number } = {},
): WidgetRenderContext {
	const now = overrides.now ?? Date.now();
	return {
		pi: overrides.pi ?? fakePi(),
		ctx: overrides.ctx ?? fakeContext(now),
		theme: overrides.theme ?? fakeTheme(),
		config: overrides.config ?? defaultConfig(),
		state: overrides.state ?? fakeState(now),
		width: overrides.width ?? 120,
		icons: overrides.icons ?? resolveIcons("unicode"),
		language: overrides.language ?? "zh",
		colorLevel: overrides.colorLevel ?? "ansi16",
		now,
	};
}
