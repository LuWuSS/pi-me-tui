import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionEntry,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { allItems, configHasType, defaultConfig, ensureConfigExists, loadConfig, saveConfig } from "./config.ts";
import type { MeTuiConfig, WidgetRenderContext } from "./types.ts";
import { runCustomCommand, shouldRefreshCustomCommand } from "./custom-command.ts";
import { installFooter } from "./footer.ts";
import type { FooterHandle } from "./footer.ts";
import { emptyGitInfo, readGitInfo } from "./git.ts";
import { resolveIcons } from "./icons.ts";
import { registerSettingsCommand } from "./settings/command.ts";
import { renderAllLines } from "./render.ts";
import {
	createInitialState,
	detectSkillFromInput,
	detectToolInvocation,
	recordSkill,
} from "./state.ts";
import { getUsageSnapshot, invalidateUsageCache } from "./usage.ts";
import { deepClone } from "./utils.ts";

let config: MeTuiConfig = defaultConfig();
let state = createInitialState();
let lastCtx: ExtensionContext | undefined;
let active = false;
let footer: FooterHandle | undefined;
let requestRender: (() => void) | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let gitRefreshing = false;
let customRefreshing = false;
let generation = 0;
let skillNames = new Set<string>();
const ttftByTimestamp = new Map<number, number>();

function isTuiContext(ctx: ExtensionContext): boolean {
	try {
		return ctx.hasUI && (ctx.mode === undefined || ctx.mode === "tui");
	} catch {
		return false;
	}
}

function entryTime(entry: SessionEntry | undefined): number {
	if (!entry) return Date.now();
	const raw = entry.timestamp as string | number;
	if (typeof raw === "number") return Number.isFinite(raw) ? raw : Date.now();
	const parsed = Date.parse(raw);
	return Number.isFinite(parsed) ? parsed : Date.now();
}

function refreshSkillNames(pi: ExtensionAPI): void {
	try {
		const names = new Set<string>();
		for (const command of pi.getCommands()) {
			if (command.source !== "skill") continue;
			names.add(command.name);
			if (command.name.startsWith("skill:")) names.add(command.name.slice("skill:".length));
		}
		skillNames = names;
	} catch {
		skillNames = new Set();
	}
}

function gitOptions() {
	return {
		readStats: configHasType(config, "git-changes", "git-insertions", "git-deletions"),
		readOrigin: configHasType(config, "git-origin", "git-branch", "git-fork"),
		readUpstream: configHasType(config, "git-upstream", "git-fork"),
		readWorktree: configHasType(
			config,
			"git-worktree",
			"git-worktree-mode",
			"git-worktree-name",
			"git-worktree-branch",
		),
	};
}

function needsGit(): boolean {
	return configHasType(
		config,
		"git-branch",
		"git-changes",
		"git-insertions",
		"git-deletions",
		"git-status",
		"git-staged",
		"git-unstaged",
		"git-untracked",
		"git-conflicts",
		"git-ahead-behind",
		"git-sha",
		"git-origin",
		"git-upstream",
		"git-fork",
		"git-root",
		"git-worktree",
		"git-worktree-mode",
		"git-worktree-name",
		"git-worktree-branch",
	);
}

async function refreshGit(force = false): Promise<void> {
	const ctx = lastCtx;
	if (!ctx) return;
	if (!needsGit()) {
		state.gitUpdatedAt = Date.now();
		state.git = emptyGitInfo();
		requestRender?.();
		return;
	}
	const ttl = Math.max(0, config.gitCacheTtlSeconds) * 1000;
	const now = Date.now();
	if (!force && ttl > 0 && now - state.gitUpdatedAt < ttl) return;
	if (gitRefreshing) return;
	gitRefreshing = true;
	const startedGeneration = generation;
	try {
		const info = await readGitInfo(ctx.cwd, gitOptions());
		if (startedGeneration !== generation) return;
		state.git = info;
		state.gitUpdatedAt = Date.now();
		requestRender?.();
	} catch {
		state.gitUpdatedAt = Date.now();
	} finally {
		gitRefreshing = false;
	}
}

async function refreshCustomCommands(force = false): Promise<void> {
	const ctx = lastCtx;
	if (!ctx) return;
	const items = allItems(config).filter((item) => item.type === "custom-command" && item.command?.trim());
	const ids = new Set(items.map((item) => item.id));
	for (const id of state.customCommands.keys()) {
		if (!ids.has(id)) state.customCommands.delete(id);
	}
	const ttl = Math.max(0, config.customCommandCacheTtlSeconds);
	if (customRefreshing) return;
	customRefreshing = true;
	const startedGeneration = generation;
	try {
		const now = Date.now();
		await Promise.all(
			items.map(async (item) => {
				const cached = state.customCommands.get(item.id);
				if (!force && !shouldRefreshCustomCommand(cached, ttl, now)) return;
				const value = await runCustomCommand(ctx, item);
				if (startedGeneration !== generation) return;
				state.customCommands.set(item.id, value);
			}),
		);
		requestRender?.();
	} finally {
		customRefreshing = false;
	}
}

function refreshUsage(ctx: ExtensionContext): void {
	state.usage = getUsageSnapshot(ctx, ttftByTimestamp);
}

function updateCompactionCount(ctx: ExtensionContext): void {
	state.compactions = ctx.sessionManager.getEntries().filter((entry) => entry.type === "compaction").length;
}

function refreshTerminalWidth(force = false): void {
	const now = Date.now();
	const ttl = Math.max(0, config.terminalWidthCacheTtlSeconds) * 1000;
	if (!force && ttl > 0 && now - state.terminalWidthUpdatedAt < ttl) return;
	const columns = process.stdout.columns;
	if (!columns || columns <= 0) return;
	state.terminalWidth = columns;
	state.terminalWidthUpdatedAt = now;
}

function updateSessionStart(ctx: ExtensionContext): void {
	state.sessionStart = entryTime(ctx.sessionManager.getEntries()[0]);
}

async function refreshAll(ctx: ExtensionContext, forceCustom = false): Promise<void> {
	refreshUsage(ctx);
	updateSessionStart(ctx);
	updateCompactionCount(ctx);
	refreshTerminalWidth();
	requestRender?.();
	await Promise.all([refreshGit(true), refreshCustomCommands(forceCustom)]);
}

function startRefreshTimer(): void {
	stopRefreshTimer();
	const interval = Math.max(200, Math.min(60_000, config.refreshIntervalMs));
	refreshTimer = setInterval(() => {
		if (!active || !lastCtx) return;
		refreshTerminalWidth();
		void refreshGit(false);
		void refreshCustomCommands(false);
		requestRender?.();
	}, interval);
	refreshTimer.unref?.();
}

function stopRefreshTimer(): void {
	if (refreshTimer) {
		clearInterval(refreshTimer);
		refreshTimer = undefined;
	}
}

function createContext(theme: Theme, width: number): WidgetRenderContext {
	if (!lastCtx) throw new Error("me-tui: footer rendered without context");
	if (!state.terminalWidth) state.terminalWidth = width;
	return {
		pi: piApi,
		ctx: lastCtx,
		theme,
		config,
		state,
		width,
		icons: resolveIcons(config.icons),
		language: config.language,
		colorLevel: config.colorLevel,
		now: Date.now(),
	};
}

let piApi: ExtensionAPI;

function applyUi(ctx: ExtensionContext, force = false): void {
	if (!isTuiContext(ctx)) return;
	lastCtx = ctx;
	if (!config.enabled) {
		uninstallUi(ctx);
		return;
	}
	if (active && !force) return;
	if (footer) {
		footer.cleanup();
		footer = undefined;
	}
	footer = installFooter(ctx, {
		getConfig: () => config,
		createContext,
		setRequestRender(request) {
			requestRender = request;
		},
		refreshGit(forceRefresh) {
			void refreshGit(forceRefresh);
		},
	});
	active = true;
	startRefreshTimer();
	void refreshAll(ctx);
}

function uninstallUi(ctx: ExtensionContext): void {
	stopRefreshTimer();
	footer?.cleanup();
	footer = undefined;
	active = false;
	requestRender = undefined;
	if (isTuiContext(ctx)) {
		try {
			ctx.ui.setFooter(undefined);
		} catch {
			// ignore
		}
	}
}

function applyConfig(next: MeTuiConfig): void {
	const previous = config;
	config = deepClone(next);
	if (!saveConfig(config)) {
		try {
			lastCtx?.ui.notify("me-tui: 无法写入配置文件 / failed to write config file", "warning");
		} catch {
			// ignore
		}
	}
	if (previous.enabled !== config.enabled) {
		if (config.enabled) {
			if (lastCtx) applyUi(lastCtx, true);
		} else if (lastCtx) {
			uninstallUi(lastCtx);
		}
	} else if (lastCtx && config.enabled) {
		if (previous.refreshIntervalMs !== config.refreshIntervalMs) startRefreshTimer();
		requestRender?.();
		void refreshGit(true);
	}
	state.customCommands.clear();
	if (lastCtx && config.enabled) {
		void refreshCustomCommands(true);
		requestRender?.();
	}
}

export default function (pi: ExtensionAPI): void {
	piApi = pi;

	pi.on("session_start", async (_event, ctx) => {
		generation += 1;
		lastCtx = ctx;
		invalidateUsageCache();
		ttftByTimestamp.clear();
		skillNames = new Set();
		refreshSkillNames(pi);
		try {
			config = ensureConfigExists();
		} catch {
			config = loadConfig((message) => {
				try {
					ctx.ui.notify(message);
				} catch {
					// ignore
				}
			});
		}
		state = createInitialState(Date.now());
		refreshTerminalWidth(true);
		updateSessionStart(ctx);
		refreshUsage(ctx);
		applyUi(ctx, true);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		generation += 1;
		uninstallUi(ctx);
		ttftByTimestamp.clear();
		lastCtx = undefined;
		state = createInitialState();
	});

	pi.on("session_tree", async (_event, ctx) => {
		if (!isTuiContext(ctx)) return;
		lastCtx = ctx;
		updateSessionStart(ctx);
		refreshUsage(ctx);
		requestRender?.();
	});

	pi.on("agent_start", async (_event, ctx) => {
		if (!isTuiContext(ctx)) return;
		refreshUsage(ctx);
		requestRender?.();
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (!isTuiContext(ctx)) return;
		refreshUsage(ctx);
		requestRender?.();
		void refreshCustomCommands(true);
		void refreshGit(false);
	});

	pi.on("turn_start", async (_event, ctx) => {
		if (!isTuiContext(ctx)) return;
		refreshUsage(ctx);
		requestRender?.();
	});

	pi.on("turn_end", async (_event, ctx) => {
		if (!isTuiContext(ctx)) return;
		refreshUsage(ctx);
		requestRender?.();
		void refreshCustomCommands(true);
	});

	pi.on("message_update", async (event, ctx) => {
		if (!isTuiContext(ctx)) return;
		const update = event.assistantMessageEvent;
		if (
			update.type !== "text_start" &&
			update.type !== "thinking_start" &&
			update.type !== "toolcall_start"
		) {
			return;
		}
		const timestamp = update.partial.timestamp;
		if (!Number.isFinite(timestamp) || ttftByTimestamp.has(timestamp)) return;
		ttftByTimestamp.set(timestamp, Math.max(0, Date.now() - timestamp));
	});

	pi.on("message_end", async (_event, ctx) => {
		if (!isTuiContext(ctx)) return;
		refreshUsage(ctx);
		requestRender?.();
	});

	pi.on("session_compact", async (_event, ctx) => {
		if (!isTuiContext(ctx)) return;
		refreshUsage(ctx);
		updateCompactionCount(ctx);
		requestRender?.();
	});

	pi.on("model_select", async (_event, ctx) => {
		if (!isTuiContext(ctx)) return;
		requestRender?.();
	});

	pi.on("thinking_level_select", async (_event, ctx) => {
		if (!isTuiContext(ctx)) return;
		requestRender?.();
	});

	pi.on("input", async (event, ctx) => {
		if (!isTuiContext(ctx)) return;
		const name = detectSkillFromInput(event.text, skillNames);
		if (!name) return;
		recordSkill(state, { kind: "skill", name, timestamp: Date.now() });
		requestRender?.();
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		if (!isTuiContext(ctx)) return;
		const invocation = detectToolInvocation(event.toolName);
		if (!invocation) return;
		recordSkill(state, invocation);
		requestRender?.();
	});

	registerSettingsCommand(pi, {
		getConfig: () => config,
		onChange: applyConfig,
		onBeforeOpen(ctx: ExtensionCommandContext) {
			if (isTuiContext(ctx)) {
				lastCtx = ctx;
				applyUi(ctx, true);
			}
		},
		preview(cfg, theme, width) {
			if (!lastCtx) return [];
			try {
				const rc = createContext(theme, width);
				return renderAllLines(
					cfg,
					{
						...rc,
						config: cfg,
						icons: resolveIcons(cfg.icons),
						language: cfg.language,
						colorLevel: cfg.colorLevel,
					},
					width,
				);
			} catch {
				return [];
			}
		},
		onOverlayClosed(ctx: ExtensionCommandContext) {
			if (isTuiContext(ctx)) {
				lastCtx = ctx;
				if (config.enabled) applyUi(ctx, true);
				else uninstallUi(ctx);
			}
		},
	});
}
