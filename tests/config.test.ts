import assert from "node:assert/strict";
import test from "node:test";
import {
	addItem,
	addLine,
	configHasType,
	defaultConfig,
	getConfigPath,
	MAX_LINES,
	moveItem,
	normalizeConfig,
	removeItem,
	removeLine,
	replaceItem,
	updateItem,
} from "../extensions/me-tui/config.ts";

test("defaultConfig has three Chinese-friendly lines", () => {
	const config = defaultConfig();
	assert.equal(config.language, "zh");
	assert.equal(config.lines.length, 3);
	assert.equal(
		config.lines[0].map((item) => item.type).join(","),
		"provider,model,context-window,thinking,git-branch,git-changes,flex,tokens-input,tokens-output,tokens-total,tokens-cached,tokens-cache-hit-rate,speed-input,speed-output,speed-total",
	);
	assert.equal(
		config.lines[1].map((item) => item.type).join(","),
		"context-length,context-bar,compaction-count,flex,tokens-total-input,tokens-total-output,tokens-total,tokens-total-cached,tokens-total-cache-hit-rate,speed-total-input,speed-total-output,speed-total-all",
	);
	assert.equal(
		config.lines[2].map((item) => item.type).join(","),
		"session-clock,round-duration,total-round-duration,conversation-rounds,model-calls,flex,session-name,flex,skills,memory,cwd",
	);
	assert.equal(config.lines[0][0].color, "brightgreen");
	assert.equal(config.lines[0][0].bold, false);
	assert.equal(config.lines[0][1].color, "brightyellow");
	assert.equal(config.lines[0][7].rawValue, false);
	assert.equal(config.lines[0][7].labelOverride, "本轮：");
	assert.equal(config.lines[0][7].fixedWidth, 15);
	assert.equal(config.lines[1][4].labelOverride, "总计：");
	assert.equal(config.lines[1][0].type, "context-length");
	assert.equal(config.lines[1][0].color, "pink");
	assert.equal(config.lines[2].at(-1)?.type, "cwd");
	assert.deepEqual(config.overrides, { bold: true, glow: true, boldLift: 0, glowStrength: 5 });
	assert.equal(config.powerline.autoAlign, true);
	assert.equal(config.icons, "auto");
	assert.equal(config.refreshIntervalMs, 1000);
});

test("normalizeConfig repairs malformed values", () => {
	const config = normalizeConfig({
		language: "fr",
		icons: "unknown",
		colorLevel: "millions",
		flexMode: "broken",
		defaultPaddingSide: "middle",
		compactThreshold: 900,
		github: true,
		lines: [
			[
				{ id: "m", type: "model", color: "#fff", maxWidth: 900, metadata: { link: true, count: 3 } },
				{ type: "custom-symbol", customSymbol: "🚀extra" },
				"not-an-item",
			],
			[],
			[{ type: "separator", character: "|" }],
		],
		powerline: { enabled: true, separators: [], theme: "nord" },
	});
	assert.equal(config.language, "zh");
	assert.equal(config.icons, "auto");
	assert.equal(config.colorLevel, "auto");
	assert.equal(config.flexMode, "full");
	assert.equal(config.defaultPaddingSide, "left");
	assert.equal(config.compactThreshold, 100);
	assert.equal(config.lines.length, 2);
	assert.equal(config.lines[0][0].maxWidth, 500);
	assert.equal(config.lines[0][0].metadata?.link, "true");
	assert.equal(config.lines[0][1].customSymbol, "🚀");
	assert.equal(config.powerline.enabled, true);
	assert.equal(config.powerline.theme, "nord");
	assert.deepEqual(config.powerline.separators, ["\ue0b0"]);
});

test("normalizeConfig drops unknown widget types", () => {
	const config = normalizeConfig({
		lines: [[{ type: "git-pr" }, { type: "custom-text", customText: "kept" }]],
	});
	assert.equal(config.lines.length, 1);
	assert.equal(config.lines[0].length, 1);
	assert.equal(config.lines[0][0].type, "custom-text");
});

test("normalizeConfig falls back when lines are empty or invalid", () => {
	const config = normalizeConfig({ lines: "nope" });
	assert.deepEqual(config.lines, defaultConfig().lines);
	const empty = normalizeConfig({ lines: [] });
	assert.deepEqual(empty.lines, defaultConfig().lines);
});

test("config path and pure item edit helpers", () => {
	assert.match(getConfigPath(), /me-tui\.json$/);
	const base = defaultConfig();
	const added = addItem(base, 0, { id: "extra", type: "custom-text", customText: "hi" });
	assert.equal(added.lines[0].at(-1)?.id, "extra");
	assert.equal(base.lines[0].some((item) => item.id === "extra"), false);

	const updated = updateItem(added, 0, "extra", { customText: "bye", type: "ignored" });
	const updatedItem = updated.lines[0].find((item) => item.id === "extra");
	assert.equal(updatedItem?.customText, "bye");
	assert.equal(updatedItem?.type, "custom-text");

	const removed = removeItem(updated, 0, "extra");
	assert.equal(removed.lines[0].some((item) => item.id === "extra"), false);

	const noSeparators = {
		...base,
		lines: [base.lines[0].filter((item) => item.type !== "separator" && item.type !== "flex")],
	};
	const moved = moveItem(noSeparators, 0, 0, 2);
	assert.equal(moved.lines[0][2].id, "provider");
	assert.equal(moved.lines[0][0].id, "model");
});

test("line helpers clamp at the four-line limit", () => {
	let config = defaultConfig();
	assert.equal(config.lines.length, 3);
	config = addLine(config);
	assert.equal(config.lines.length, 4);
	config = addLine(config);
	assert.equal(config.lines.length, MAX_LINES);
	config = removeLine(config, 0);
	assert.equal(config.lines.length, 3);
	assert.equal(removeLine(config, 0).lines.length, 2);
});

test("configHasType detects widgets across lines", () => {
	const config = defaultConfig();
	assert.equal(configHasType(config, "git-branch"), true);
	assert.equal(configHasType(config, "git-pr"), false);
	assert.equal(configHasType(config, "git-pr", "cwd"), true);
});

test("normalizeConfig drops zero or negative maxWidth instead of clamping to one column", () => {
	const normalized = normalizeConfig({
		lines: [
			[
				{ id: "provider", type: "provider", maxWidth: 0 },
				{ id: "model", type: "model", maxWidth: -3 },
				{ id: "cwd", type: "cwd", maxWidth: 12 },
			],
		],
	});
	assert.equal(normalized.lines[0][0].maxWidth, undefined);
	assert.equal(normalized.lines[0][1].maxWidth, undefined);
	assert.equal(normalized.lines[0][2].maxWidth, 12);
});

test("normalizeConfig treats fixedWidth 0 as auto and clamps positives", () => {
	const normalized = normalizeConfig({
		lines: [
			[
				{ id: "provider", type: "provider", fixedWidth: 0 },
				{ id: "model", type: "model", fixedWidth: -3 },
				{ id: "cwd", type: "cwd", fixedWidth: 12.4 },
				{ id: "tokens-total", type: "tokens-total", fixedWidth: 900 },
			],
		],
	});
	assert.equal(normalized.lines[0][0].fixedWidth, undefined);
	assert.equal(normalized.lines[0][1].fixedWidth, undefined);
	assert.equal(normalized.lines[0][2].fixedWidth, 12);
	assert.equal(normalized.lines[0][3].fixedWidth, 500);
});


test("normalizeConfig drops disabled overrides so per-item styles still work", () => {
	const config = normalizeConfig({ overrides: { bold: false, dim: false, glow: false } });
	assert.deepEqual(config.overrides, {});
});

test("normalizeConfig clamps the bold lift and glow strength", () => {
	const config = normalizeConfig({ overrides: { boldLift: 250, glowStrength: 0 } });
	assert.equal(config.overrides.boldLift, 100);
	assert.equal(config.overrides.glowStrength, 1);
	const rounded = normalizeConfig({ overrides: { boldLift: 12.6, glowStrength: 42.4 } });
	assert.equal(rounded.overrides.boldLift, 13);
	assert.equal(rounded.overrides.glowStrength, 42);
});


test("replaceItem swaps the widget type in place", () => {
	const config = defaultConfig();
	const oldId = config.lines[0][1].id;
	const next = replaceItem(config, 0, oldId, { id: "new-flex", type: "flex" });
	assert.equal(next.lines[0][1].id, "new-flex");
	assert.equal(next.lines[0][1].type, "flex");
	assert.equal(config.lines[0][1].type, "model");
});

test("addItem inserts after a given widget id and appends without one", () => {
	const config = defaultConfig();
	const first = config.lines[0][0];
	const added = { id: "new-item", type: "provider" } as (typeof config.lines)[number][number];
	const inserted = addItem(config, 0, added, first.id);
	assert.equal(inserted.lines[0][1].id, "new-item");
	assert.equal(inserted.lines[0][0].id, first.id);
	const appended = addItem(config, 0, added);
	assert.equal(appended.lines[0].at(-1)?.id, "new-item");
});
