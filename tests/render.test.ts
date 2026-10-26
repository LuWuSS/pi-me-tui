import assert from "node:assert/strict";
import test from "node:test";
import { defaultConfig } from "../extensions/me-tui/config.ts";
import { renderAllLines, renderLine } from "../extensions/me-tui/render.ts";
import type { MeTuiConfig, WidgetItem } from "../extensions/me-tui/types.ts";
import { visibleWidth } from "@earendil-works/pi-tui";
import { stripAnsi } from "../extensions/me-tui/utils.ts";
import { rgbBackground, rgbForeground , brightenAnsi, brightenAnsiText } from "../extensions/me-tui/colors.ts";
import { bucket, fakeTheme, renderContext } from "./helpers.ts";

test("default config renders three lines with core, token, and session data", () => {
	const config = defaultConfig();
	const lines = renderAllLines(config, renderContext({ config }), 320).map(stripAnsi);
	assert.equal(lines.length, 3);
	assert.match(lines[0], /供应商: .*Anthropic/);
	assert.match(lines[0], /模型: .*Claude Sonnet/);
	assert.match(lines[0], /思考: .*medium/);
	assert.match(lines[0], /分支: .*main/);
	assert.match(lines[0], /\(\+42,-7\)/);
	assert.equal(lines[0].includes("变更:"), false);
	assert.match(lines[0], /1\.3k/);
	assert.match(lines[0], /本轮  ：/);
	assert.equal(lines[0].includes("本次输入:"), false);
	assert.match(lines[0], /17\.6%/);
	assert.match(lines[1], /\[█+░+\] 12\.5%/);
	assert.match(lines[1], /压缩: .*0/);
	assert.match(lines[1], /1\.17kt\/s/);
	assert.match(lines[2], /时钟: .*2m/);
	assert.match(lines[2], /会话: .*demo/);
	assert.match(lines[2], /技能: .*skill:review/);
	assert.match(lines[2], /目录: .*pi-me-tui/);
});

test("rendered lines respect the requested width with ANSI colors", () => {
	const config = defaultConfig();
	config.overrides.fg = "#ff0000";
	const lines = renderAllLines(config, renderContext({ config }), 120);
	assert.equal(lines.length, 3);
	for (const line of lines) assert.ok(visibleWidth(line) <= 120);
	assert.ok(/\x1b\[(3[0-7]|9[0-7]|38;)/.test(lines[0]));
	assert.equal(stripAnsi(lines[0]).includes("│…"), false);
});

test("stress mode keeps long lines within the terminal width", () => {
	const config = defaultConfig();
	config.lines[0].unshift({ id: "long", type: "custom-text", customText: "x".repeat(200) });
	const line = renderAllLines(config, renderContext({ config }), 60)[0];
	assert.ok(visibleWidth(line) <= 60);
	assert.ok(stripAnsi(line).length > 0);
});

test("separators next to hidden widgets are dropped and never doubled", () => {
	const config = defaultConfig();
	config.lines = [
		[
			{ id: "a", type: "custom-text", customText: "A" },
			{ id: "s1", type: "separator", character: "|" },
			{ id: "empty", type: "tokens-input" },
			{ id: "s2", type: "separator", character: "|" },
			{ id: "b", type: "custom-text", customText: "B" },
		],
	];
	const rc = renderContext({ config });
	rc.state.usage = {
		current: bucket({}),
		turn: bucket({}),
		total: bucket({}),
		stats: { rounds: 0, modelCalls: 0, currentRoundMs: 0, totalRoundMs: 0 },
	};
	const line = stripAnsi(renderAllLines(config, rc, 120)[0]);
	assert.equal((line.match(/\|/g) ?? []).length, 1);
	assert.equal(line.includes("| |"), false);

	const config2 = defaultConfig();
	config2.lines = [
		[
			{ id: "empty", type: "tokens-input" },
			{ id: "s", type: "separator", character: "|" },
			{ id: "b", type: "custom-text", customText: "B" },
		],
	];
	const rc2 = renderContext({ config: config2 });
	rc2.state.usage = {
		current: bucket({}),
		turn: bucket({}),
		total: bucket({}),
		stats: { rounds: 0, modelCalls: 0, currentRoundMs: 0, totalRoundMs: 0 },
	};
	assert.equal(stripAnsi(renderAllLines(config2, rc2, 120)[0]).trim(), "B");
});

test("powerline mode adds separators and hides plain flex padding", () => {
	const config = defaultConfig();
	config.powerline.enabled = true;
	config.powerline.theme = "tokyo-night";
	const lines = renderAllLines(config, renderContext({ config }), 100);
	assert.equal(lines.length, 3);
	assert.ok(lines[0].includes("\ue0b0"));
	assert.match(stripAnsi(lines[0]), /分支: .*main/);
});

test("narrow widths keep high-priority stats and drop the rest", () => {
	const config = defaultConfig();
	const wide = stripAnsi(renderAllLines(config, renderContext({ config }), 320)[1]);
	const narrow = stripAnsi(renderAllLines(config, renderContext({ config }), 100)[1]);
	assert.match(wide, /12\.3k/);
	assert.match(wide, /t\/s/);
	assert.match(narrow, /上下文: .*25k/);
	assert.match(narrow, /压缩: .*0/);
	assert.ok(visibleWidth(narrow) <= 100);
});

test("full-minus-40 keeps the rendered line inside the reduced width", () => {
	const config = defaultConfig();
	config.flexMode = "full-minus-40";
	const line = stripAnsi(renderAllLines(config, renderContext({ config }), 120)[0]);
	assert.ok(visibleWidth(line) <= 80);
});

test("separator and custom text render as literal items", () => {
	const config = defaultConfig();
	config.lines = [
		[
			{ id: "a", type: "custom-text", customText: "left" },
			{ id: "s", type: "separator", character: "|" },
			{ id: "b", type: "custom-text", customText: "right" },
		],
	];
	const line = stripAnsi(renderAllLines(config, renderContext({ config }), 120)[0]);
	assert.equal(line.trim(), "left |  right");
});

test("renderLine handles an empty line and flex-only line", () => {
	const rc = renderContext();
	const empty = renderLine([], rc);
	assert.equal(empty, "");
	const onlyFlex = renderLine([{ id: "f", type: "flex" } as WidgetItem], rc);
	assert.equal(stripAnsi(onlyFlex).trim(), "");
});

test("enabled=false returns no lines", () => {
	const config: MeTuiConfig = { ...defaultConfig(), enabled: false };
	assert.deepEqual(renderAllLines(config, renderContext({ config }), 120), []);
});

test("bold restyles the label and an ANSI-colored value", () => {
	const config = defaultConfig();
	config.lines = [[{ id: "git-branch", type: "git-branch", bold: true }]];
	const line = renderAllLines(config, renderContext({ config }), 100)[0];
	assert.ok(line.includes("\x1b[1m分支: "), JSON.stringify(line));
	assert.ok(line.split("\x1b[1m").length - 1 >= 2, "the linked value should also be bold");
});

test("glow lifts the label and the value by the configured strength", () => {
	const config = defaultConfig();
	config.lines = [[{ id: "provider", type: "provider", color: "#3366ff", glow: true }]];
	const line = renderAllLines(config, renderContext({ config, colorLevel: "truecolor" }), 100)[0];
	const glow = "\x1b[38;2;112;148;255m";
	assert.ok(line.includes(glow), JSON.stringify(line));
	assert.equal(line.includes("\x1b[38;2;51;102;255m"), false);
	assert.ok(line.split(glow).length - 1 >= 2, "the label and value should both glow");
	assert.equal(line.includes("\x1b[1m"), false, "glow must not imply bold");
});

test("glow strength is configurable", () => {
	const config = defaultConfig();
	config.lines = [[{ id: "provider", type: "provider", color: "#3366ff", glow: true }]];
	config.overrides.glowStrength = 100;
	const line = renderAllLines(config, renderContext({ config, colorLevel: "truecolor" }), 100)[0];
	assert.ok(line.includes("\x1b[38;2;255;255;255m"), JSON.stringify(line));
});

test("glow keeps the value's own ANSI styling", () => {
	const config = defaultConfig();
	config.lines = [[{ id: "git-branch", type: "git-branch", glow: true }]];
	const line = renderAllLines(config, renderContext({ config }), 100)[0];
	assert.ok(line.includes("\x1b]8;;https://github.com/acme/pi-me-tui/tree/main"), JSON.stringify(line));
});

test("bold stays visible when glow is already on", () => {
	const config = defaultConfig();
	config.lines = [[{ id: "provider", type: "provider", color: "#3366ff" }]];
	config.overrides.glow = true;
	const glowOnly = renderAllLines(config, renderContext({ config, colorLevel: "truecolor" }), 100)[0];
	config.overrides.bold = true;
	const both = renderAllLines(config, renderContext({ config, colorLevel: "truecolor" }), 100)[0];
	assert.equal(glowOnly.includes("\x1b[1m"), false, "glow alone is not bold");
	assert.ok(both.includes("\x1b[1m"), "bold still applies on top of glow");
	assert.ok(both.split("\x1b[1m").length - 1 >= 2, "label and value both gain the bold attribute");
	assert.ok(both.includes("\x1b[38;2;143;171;255m"), "the label lifts further on top of glow");
	assert.ok(both.includes("\x1b[38;2;112;148;255m"), "the value keeps the glow color");
	assert.equal(stripAnsi(both), stripAnsi(glowOnly), "bold must not change the rendered text");
});

test("line alignment applies left, center, and right per line", () => {
	const config = defaultConfig();
	config.lines = [[{ id: "provider", type: "provider" }]];
	const rc = renderContext({ config });
	const content = stripAnsi(renderAllLines(config, rc, 60)[0]).trimEnd();
	const gap = 60 - visibleWidth(content);
	assert.ok(gap > 4);
	config.lineAligns = ["left", "flex", "flex", "flex"];
	assert.equal(stripAnsi(renderAllLines(config, rc, 60)[0]).trimEnd(), content);
	config.lineAligns = ["center", "flex", "flex", "flex"];
	assert.equal(stripAnsi(renderAllLines(config, rc, 60)[0]).trimEnd(), " ".repeat(Math.floor(gap / 2)) + content);
	config.lineAligns = ["right", "flex", "flex", "flex"];
	assert.equal(stripAnsi(renderAllLines(config, rc, 60)[0]).trimEnd(), " ".repeat(gap) + content);
});

test("ansi16 rgb colors map to real foreground and background codes", () => {
	assert.equal(rgbForeground({ r: 255, g: 0, b: 0 }, "ansi16"), "\x1b[91m");
	assert.equal(rgbBackground({ r: 255, g: 0, b: 0 }, "ansi16"), "\x1b[101m");
});

test("bold adds the attribute and lifts only the label", () => {
	const config = defaultConfig();
	config.lines = [[{ id: "provider", type: "provider", color: "#3366ff" }]];
	config.overrides.bold = true;
	const line = renderAllLines(config, renderContext({ config, colorLevel: "truecolor" }), 100)[0];
	assert.ok(line.includes("\x1b[38;2;82;125;255m\x1b[1m供应商: "), JSON.stringify(line));
	assert.ok(line.includes("\x1b[38;2;51;102;255m\x1b[1m◈"), "the value keeps its exact color");
	assert.ok(line.split("\x1b[1m").length - 1 >= 2, "label and value both gain the bold attribute");
});

test("bold lift 0 keeps every color untouched", () => {
	const config = defaultConfig();
	config.lines = [[{ id: "provider", type: "provider", color: "#3366ff" }]];
	config.overrides.bold = true;
	config.overrides.boldLift = 0;
	const line = renderAllLines(config, renderContext({ config, colorLevel: "truecolor" }), 100)[0];
	assert.ok(line.split("\x1b[38;2;51;102;255m").length - 1 >= 2, JSON.stringify(line));
	assert.ok(line.includes("\x1b[1m"));
});

test("bold drops the faint attribute that theme dim tokens append", () => {
	const theme = {
		...fakeTheme(),
		getFgAnsi: (color: string) => (color === "muted" ? "\x1b[38;2;120;120;130m\x1b[2m" : ""),
	} as ReturnType<typeof fakeTheme>;
	const config = defaultConfig();
	config.lines = [[{ id: "provider", type: "provider", color: "muted" }]];
	config.overrides.bold = true;
	config.overrides.boldLift = 0;
	const line = renderAllLines(config, renderContext({ config, theme, colorLevel: "truecolor" }), 100)[0];
	assert.equal(line.includes("\x1b[2m"), false, JSON.stringify(line));
	assert.ok(line.includes("\x1b[1m供应商: "), JSON.stringify(line));
});

test("glow brightens theme-token colors too", () => {
	const theme = {
		...fakeTheme(),
		getFgAnsi: (color: string) => (color === "accent" ? "\x1b[38;2;122;162;247m" : ""),
	} as ReturnType<typeof fakeTheme>;
	const config = defaultConfig();
	config.lines = [[{ id: "provider", type: "provider", glow: true }]];
	const line = renderAllLines(config, renderContext({ config, theme, colorLevel: "truecolor" }), 100)[0];
	const glow = "\x1b[38;2;162;190;249m";
	assert.ok(line.split(glow).length - 1 >= 2, JSON.stringify(line));
});


test("brightenAnsiText brightens foreground sequences while keeping text", () => {
	assert.equal(brightenAnsiText("\x1b[31mred\x1b[0m", 0.35, "truecolor"), "\x1b[91mred\x1b[0m");
});

test("brightenAnsi lifts theme colors that carry extra attributes", () => {
	assert.equal(brightenAnsi("\x1b[38;2;122;162;247m\x1b[2m", 0.22, "truecolor"), "\x1b[38;2;151;182;249m\x1b[2m");
	assert.equal(brightenAnsi("\x1b[36m\x1b[2m", 0.22, "truecolor"), "\x1b[96m\x1b[2m");
});


test("global overrides win over per-item false values", () => {
	const config = defaultConfig();
	const item = config.lines[0][0];
	item.bold = false;
	item.dim = false;
	item.glow = false;
	config.overrides.bold = true;
	let line = renderAllLines(config, renderContext({ config }), 120)[0];
	assert.ok(line.includes("\x1b[1m供应商"), "bold applies to the first item");
	config.overrides.bold = undefined;
	config.overrides.dim = true;
	line = renderAllLines(config, renderContext({ config }), 120)[0];
	assert.ok(line.includes("\x1b[2m供应商"), "dim applies to the first item");
});
