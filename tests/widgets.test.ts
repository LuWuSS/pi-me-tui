import assert from "node:assert/strict";
import test from "node:test";
import { allWidgets, createItem, getWidget, widgetsInCategory } from "../extensions/me-tui/registry.ts";
import type { WidgetItem } from "../extensions/me-tui/types.ts";
import { resolveIcons } from "../extensions/me-tui/icons.ts";
import { stripAnsi } from "../extensions/me-tui/utils.ts";
import { finalizeBucket } from "../extensions/me-tui/usage.ts";
import { bucket, renderContext } from "./helpers.ts";

const icons = renderContext().icons;

function renderWith(item: WidgetItem, rc: ReturnType<typeof renderContext>): string | null {
	const definition = getWidget(item.type);
	assert.ok(definition, `missing widget ${item.type}`);
	return definition.render(item, rc);
}

function renderItem(item: WidgetItem, overrides: Parameters<typeof renderContext>[0] = {}): string | null {
	return renderWith(item, renderContext(overrides));
}

test("registry exposes all 58 widgets in nine categories", () => {
	assert.equal(allWidgets().length, 58);
	assert.equal(new Set(allWidgets().map((widget) => widget.type)).size, 58);
	const total = [
		"core",
		"git",
		"token",
		"speed",
		"context",
		"session",
		"env",
		"custom",
		"layout",
	].reduce((sum, category) => sum + widgetsInCategory(category as never).length, 0);
	assert.equal(total, 58);
	assert.equal(widgetsInCategory("git").length, 19);
	assert.equal(widgetsInCategory("token").length, 9);
	assert.equal(widgetsInCategory("speed").length, 6);
	assert.equal(widgetsInCategory("context").length, 5);
	assert.equal(widgetsInCategory("session").length, 7);
	assert.equal(widgetsInCategory("custom").length, 4);
});

test("createItem applies defaults and unique ids", () => {
	const first = createItem("custom-command");
	const second = createItem("custom-command");
	assert.equal(first.timeoutMs, 1000);
	assert.equal(first.preserveColors, false);
	assert.notEqual(first.id, second.id);
});

test("core widgets render provider, model, and thinking", () => {
	assert.equal(renderItem({ id: "p", type: "provider" }), `${icons.provider} Anthropic`);
	assert.equal(renderItem({ id: "m", type: "model" }), `${icons.model} Claude Sonnet`);
	assert.equal(renderItem({ id: "t", type: "thinking" }), `${icons.thinking} 中`);
	assert.equal(
		renderItem({ id: "t", type: "thinking" }, { language: "en", ctx: { ...renderContext().ctx, thinkingLevel: "xhigh" } as never }),
		`${icons.thinking} xhigh`,
	);
});

test("git widgets read branch, remotes, counts, and worktree data", () => {
	const rc = renderContext();
	assert.equal(stripAnsi(renderItem({ id: "b", type: "git-branch" }) ?? ""), `${icons.branch} main`);
	assert.equal(renderItem({ id: "o", type: "git-origin" }), `${icons.origin} acme/pi-me-tui`);
	assert.equal(renderItem({ id: "o", type: "git-origin", metadata: { part: "owner" } }), `${icons.origin} acme`);
	assert.equal(renderItem({ id: "u", type: "git-upstream" }), `${icons.upstream} upstream/pi-me-tui`);
	assert.equal(renderItem({ id: "f", type: "git-fork" }), `${icons.fork} fork`);
	assert.equal(renderItem({ id: "r", type: "git-root" }), `${icons.root} pi-me-tui`);
	assert.equal(renderItem({ id: "a", type: "git-ahead-behind" }), "↑2↓1");
	assert.equal(renderItem({ id: "s", type: "git-sha" }), `${icons.sha} abc1234`);
	assert.equal(renderItem({ id: "c", type: "git-changes" }), "(+42,-7)");
	assert.equal(renderItem({ id: "i", type: "git-insertions" }), "+42");
	assert.equal(renderItem({ id: "d", type: "git-deletions" }), "-7");
	assert.equal(renderItem({ id: "w", type: "git-worktree-mode" }), "main");
	assert.equal(renderItem({ id: "w", type: "git-worktree-name" }), "main");
	assert.equal(renderItem({ id: "w", type: "git-worktree-branch" }), "main");
	assert.equal(renderItem({ id: "w", type: "git-worktree" }), `${icons.worktree} main:main`);
	assert.equal(renderItem({ id: "s", type: "git-staged" }), "+2");
	assert.equal(renderItem({ id: "u", type: "git-unstaged" }), "*1");
	assert.equal(renderItem({ id: "u", type: "git-untracked" }), "?3");
	assert.equal(renderItem({ id: "c", type: "git-conflicts" }), null);
	assert.equal(renderItem({ id: "c", type: "git-conflicts", cleanText: "clean" }), "clean");
});

test("token and speed widgets use current and total scopes", () => {
	assert.equal(renderItem({ id: "i", type: "tokens-input" }), `${icons.input} 1.3k`);
	assert.equal(renderItem({ id: "o", type: "tokens-output" }), `${icons.output} 800`);
	assert.equal(renderItem({ id: "c", type: "tokens-cached" }), `${icons.cache} 300`);
	assert.equal(renderItem({ id: "h", type: "tokens-cache-hit-rate" }), `${icons.cacheHit} 17.6%`);
	assert.equal(renderItem({ id: "t", type: "tokens-total", metadata: { scope: "total" } }), `${icons.total} 23.3k`);
	assert.equal(renderItem({ id: "s", type: "speed-input" }), `${icons.speedInput} 3.2kt/s`);
	assert.equal(renderItem({ id: "s", type: "speed-output" }), `${icons.speedOutput} 400t/s`);
	assert.equal(renderItem({ id: "s", type: "speed-output", metadata: { scope: "total" } }), `${icons.speedOutput} 400t/s`);
	assert.equal(renderItem({ id: "s", type: "speed-total" }), `${icons.speedTotal} 960t/s`);
});

test("input and output speed fall back to duration after a resumed session", () => {
	const rc = renderContext();
	rc.state.usage.current = finalizeBucket(bucket({
		input: 100,
		output: 50,
		totalTokens: 150,
		durationMs: 2000,
		messageCount: 1,
		timing: { totalTokens: 150, totalMs: 2000 },
	}));
	assert.equal(renderWith({ id: "i", type: "speed-input" }, rc), `${icons.speedInput} 50t/s`);
	assert.equal(renderWith({ id: "o", type: "speed-output" }, rc), `${icons.speedOutput} 25t/s`);
	assert.equal(renderWith({ id: "t", type: "speed-total" }, rc), `${icons.speedTotal} 75t/s`);
});

test("session total widgets respect hideEmpty at zero", () => {
	const rc = renderContext();
	rc.state.usage = {
		current: bucket({}),
		turn: bucket({}),
		total: bucket({}),
		stats: { rounds: 0, modelCalls: 0, currentRoundMs: 0, totalRoundMs: 0 },
	};
	assert.equal(renderWith({ id: "a", type: "tokens-total-input", hideEmpty: true }, rc), null);
	assert.equal(renderWith({ id: "b", type: "tokens-total-output", hideEmpty: true }, rc), null);
	assert.equal(renderWith({ id: "c", type: "tokens-total", hideEmpty: true }, rc), null);
	assert.equal(renderWith({ id: "d", type: "tokens-total-input" }, rc), `${icons.input} 0`);
});

test("context widgets derive percentage, usable percentage, and bars", () => {
	assert.equal(renderItem({ id: "l", type: "context-length" }), `${icons.context} 25k`);
	assert.equal(renderItem({ id: "p", type: "context-percent" }), `${icons.context} 12.5%`);
	assert.equal(renderItem({ id: "u", type: "context-percent-usable" }), `${icons.context} 84.4%`);
	const bar = renderItem({ id: "b", type: "context-bar" });
	assert.match(bar ?? "", /^\[█+░+\] 12\.5%$/);
	const short = renderItem({ id: "b", type: "context-bar", metadata: { mode: "progress-short", width: "4" } });
	assert.match(short ?? "", /^\[█░+\] 12\.5%$/);
	const slider = renderItem({ id: "b", type: "context-bar", metadata: { mode: "slider-only", width: "5" } });
	assert.equal(slider?.startsWith("▰"), true);
});

test("session, env, custom, and layout widgets render", () => {
	const rc = renderContext();
	const state = rc.state;
	state.customCommands.set("c", { text: "hello command", at: Date.now() });
	state.skills.push({ kind: "mcp", server: "github", name: "search", timestamp: Date.now() });
	state.skillTotal = 2;
	assert.equal(renderWith({ id: "c", type: "session-clock" }, rc), `${icons.clock} 2m`);
	assert.equal(renderWith({ id: "n", type: "session-name" }, rc), `${icons.session} demo`);
	assert.match(renderWith({ id: "s", type: "skills" }, rc) ?? "", /github\/search/);
	assert.equal(renderWith({ id: "s", type: "skills", metadata: { mode: "count" } }, rc), `${icons.skills} 2`);
	assert.equal(renderWith({ id: "r", type: "conversation-rounds" }, rc), `${icons.rounds} 2`);
	assert.equal(renderWith({ id: "mc", type: "model-calls" }, rc), `${icons.calls} 3`);
	assert.equal(renderWith({ id: "rd", type: "round-duration" }, rc), `${icons.roundDuration} 15s`);
	assert.equal(renderWith({ id: "td", type: "total-round-duration" }, rc), `${icons.totalDuration} 2m`);
	assert.match(renderWith({ id: "c", type: "cwd" }, rc) ?? "", /pi-me-tui/);
	assert.match(renderWith({ id: "m", type: "memory" }, rc) ?? "", /\//);
	assert.equal(renderWith({ id: "t", type: "custom-text", customText: "hello" }, rc), "hello");
	assert.equal(renderWith({ id: "c", type: "custom-command" }, rc), `${icons.command} hello command`);
	assert.equal(renderWith({ id: "s", type: "custom-symbol", customSymbol: "🚀" }, rc), "🚀");
	assert.equal(
		renderWith({ id: "l", type: "link", metadata: { url: "https://example.com", text: "Example" } }, rc),
		`\x1b]8;;https://example.com\x1b\\${icons.link} Example\x1b]8;;\x1b\\`,
	);
	assert.equal(renderWith({ id: "x", type: "link", metadata: { url: "javascript:alert(1)" } }, rc), null);
	assert.equal(renderWith({ id: "sep", type: "separator", character: "|" }, rc), "|");
	assert.equal(renderWith({ id: "f", type: "flex" }, rc), "");
});

test("current token widgets hide zero values unless hideEmpty is disabled", () => {
	const rc = renderContext();
	rc.state.usage = {
		current: bucket({}),
		turn: bucket({}),
		total: bucket({}),
		stats: { rounds: 0, modelCalls: 0, currentRoundMs: 0, totalRoundMs: 0 },
	};
	assert.equal(renderWith({ id: "i", type: "tokens-input" }, rc), null);
	assert.equal(renderWith({ id: "i", type: "tokens-input", hideEmpty: false }, rc), `${icons.input} 0`);
	assert.equal(renderWith({ id: "t", type: "tokens-total" }, rc), `${icons.total} 0`);
});

test("missing data hides widgets instead of crashing", () => {
	const rc = renderContext();
	rc.state.git = { ...rc.state.git, isRepo: false };
	assert.equal(renderWith({ id: "b", type: "git-branch" }, rc), null);
	rc.ctx = { ...rc.ctx, model: undefined, getContextUsage: () => undefined } as never;
	assert.equal(renderWith({ id: "m", type: "model" }, rc), null);
	assert.equal(renderWith({ id: "p", type: "provider" }, rc), null);
	assert.equal(renderWith({ id: "c", type: "context-bar" }, rc), null);
});

test("compaction widget shows the session compaction count", () => {
	const rc = renderContext();
	rc.state.compactions = 3;
	const item = createItem("compaction-count");
	assert.match(stripAnsi(renderWith(item, rc) ?? ""), /3/);
});
test("cache widgets show zero once there is usage even with hide-empty on", () => {
	const state = renderContext().state;
	state.usage.current = bucket({ input: 500, output: 100, cacheRead: 0, cacheWrite: 50, messageCount: 3, totalTokens: 600, durationMs: 1000 });
	state.usage.total = bucket({ input: 5000, output: 1000, cacheRead: 0, cacheWrite: 500, messageCount: 10, totalTokens: 6000, durationMs: 10_000 });
	const overrides = { state };
	assert.equal(renderItem({ id: "c", type: "tokens-cached", hideEmpty: true }, overrides), `${icons.cache} 0`);
	assert.equal(renderItem({ id: "h", type: "tokens-cache-hit-rate", hideEmpty: true }, overrides), `${icons.cacheHit} 0%`);
	assert.equal(renderItem({ id: "tc", type: "tokens-total-cached", hideEmpty: true }, overrides), `${icons.cache} 0`);
	assert.equal(renderItem({ id: "th", type: "tokens-total-cache-hit-rate", hideEmpty: true }, overrides), `${icons.cacheHit} 0%`);
});

test("cache widgets hide before any usage with hide-empty and show zero otherwise", () => {
	const state = renderContext().state;
	state.usage.current = bucket({ messageCount: 0 });
	state.usage.total = bucket({ messageCount: 0 });
	const overrides = { state };
	assert.equal(renderItem({ id: "c", type: "tokens-cached", hideEmpty: true }, overrides), null);
	assert.equal(renderItem({ id: "c2", type: "tokens-cached", hideEmpty: false }, overrides), `${icons.cache} 0`);
	assert.equal(renderItem({ id: "h", type: "tokens-cache-hit-rate", hideEmpty: true }, overrides), null);
	assert.equal(renderItem({ id: "h2", type: "tokens-cache-hit-rate", hideEmpty: false }, overrides), `${icons.cacheHit} 0%`);
});

test("speed icons stay distinct from token icons", () => {
	const unicode = resolveIcons("unicode");
	const tokenIcons = renderContext().icons;
	assert.notEqual(unicode.speedInput, tokenIcons.input);
	assert.notEqual(unicode.speedOutput, tokenIcons.output);
	assert.notEqual(unicode.speedTotal, tokenIcons.total);
	assert.notEqual(unicode.speedInput, tokenIcons.input);
	assert.notEqual(unicode.speedOutput, tokenIcons.output);
	assert.notEqual(unicode.speedTotal, tokenIcons.total);
	assert.ok(unicode.speedInput.includes("/s"));
	assert.ok(unicode.speedOutput.includes("/s"));
	assert.ok(unicode.speedTotal.includes("/s"));
});
