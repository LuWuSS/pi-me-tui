import assert from "node:assert/strict";
import test from "node:test";
import { defaultConfig } from "../extensions/me-tui/config.ts";
import { COLOR_PALETTE } from "../extensions/me-tui/colors.ts";
import { stripAnsi } from "../extensions/me-tui/utils.ts";
import { MeTuiSettings } from "../extensions/me-tui/settings/ui.ts";
import type { MeTuiConfig } from "../extensions/me-tui/types.ts";
import { fakeTheme } from "./helpers.ts";
import { visibleWidth } from "@earendil-works/pi-tui";

function createSettings(initial: MeTuiConfig = defaultConfig()): {
	ui: MeTuiSettings;
	closed: () => boolean;
	changes: () => number;
	lastConfig: () => MeTuiConfig;
	previewed: () => MeTuiConfig | undefined;
} {
	let isClosed = false;
	let changeCount = 0;
	let current = initial;
	let lastPreview: MeTuiConfig | undefined;
	const ui = new MeTuiSettings({
		config: initial,
		theme: fakeTheme(),
		done: () => {
			isClosed = true;
		},
		onChange: (config) => {
			changeCount += 1;
			current = config;
		},
		preview: (config) => {
			lastPreview = config;
			return ["preview line"];
		},
		onRequestRender: () => {},
	});
	return {
		ui,
		closed: () => isClosed,
		changes: () => changeCount,
		lastConfig: () => current,
		previewed: () => lastPreview,
	};
}

test("settings overlay renders the main menu and preview", () => {
	const { ui } = createSettings();
	const text = ui.render(100).join("\n");
	assert.match(text, /me-tui 状态栏配置/);
	assert.match(text, /编辑状态栏/);
	assert.match(text, /Powerline 设置/);
	assert.match(text, /导出配置/);
	assert.match(text, /导入配置/);
	assert.match(text, /preview line/);
	assert.match(text, /q 退出/);
});

test("q closes the main menu", () => {
	const { ui, closed } = createSettings();
	ui.handleInput("q");
	assert.equal(closed(), true);
});

test("enter opens the items editor and a adds a widget from a category", () => {
	const { ui, changes } = createSettings();
	ui.handleInput("\r");
	const itemsText = ui.render(100).join("\n");
	assert.match(itemsText, /编辑状态栏/);
	assert.match(itemsText, /a 添加/);

	ui.handleInput("a");
	assert.match(ui.render(100).join("\n"), /添加组件 · 选择分类/);
	ui.handleInput("\r");
	assert.match(ui.render(100).join("\n"), /添加组件/);
	const before = changes();
	ui.handleInput("\r");
	assert.equal(changes(), before + 1);
});

test("widget options expose a quick back-to-line row", () => {
	const { ui } = createSettings();
	ui.handleInput("\r");
	ui.handleInput("\r");
	assert.match(ui.render(100).join("\n"), /返回上级布局/);
	assert.match(ui.render(100).join("\n"), /第 1 行/);
});

test("r changes the highlighted widget type through the category picker", () => {
	const config = defaultConfig();
	config.lines = [[{ id: "s1", type: "separator", character: "│" }]];
	const { ui, lastConfig } = createSettings(config);
	ui.handleInput("\r");
	assert.match(ui.render(100).join("\n"), /分隔符/);
	ui.handleInput("r");
	assert.match(ui.render(100).join("\n"), /修改组件类型 · 选择分类/);
	for (let index = 0; index < 8; index += 1) ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	assert.match(ui.render(100).join("\n"), /修改组件类型/);
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	assert.equal(lastConfig().lines[0][0].type, "flex");
	assert.match(ui.render(100).join("\n"), /已改为/);
});

test("escape after adding returns to the widget list and category picker", () => {
	const { ui, changes } = createSettings();
	ui.handleInput("\r");
	ui.handleInput("a");
	ui.handleInput("\r");
	const before = changes();
	ui.handleInput("\r");
	assert.equal(changes(), before + 1);
	assert.match(ui.render(100).join("\n"), /Esc 返回继续添加/);
	ui.handleInput("\u001b");
	assert.match(ui.render(100).join("\n"), /Enter 添加/);
	ui.handleInput("\u001b");
	assert.match(ui.render(100).join("\n"), /选择分类/);
	ui.handleInput("\u001b");
	assert.match(ui.render(100).join("\n"), /r 改类型/);
});

test("escape returns from subpages instead of closing", () => {
	const { ui, closed } = createSettings();
	ui.handleInput("\r");
	assert.match(ui.render(100).join("\n"), /编辑状态栏/);
	ui.handleInput("\u001b");
	assert.match(ui.render(100).join("\n"), /me-tui 状态栏配置/);
	assert.equal(closed(), false);
});

test("q returns to the main menu from a subpage", () => {
	const { ui, closed } = createSettings();
	ui.handleInput("\r");
	assert.match(ui.render(100).join("\n"), /编辑状态栏/);
	ui.handleInput("q");
	assert.match(ui.render(100).join("\n"), /me-tui 状态栏配置/);
	assert.equal(closed(), false);
});

test("d deletes the highlighted widget, not the last activated one", () => {
	const { ui, lastConfig } = createSettings();
	ui.handleInput("\r");
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("d");
	const types = lastConfig().lines[0].map((item) => item.type);
	assert.equal(types.includes("model"), false);
	assert.equal(types.includes("provider"), true);
});

test("e edits the prefix of the highlighted widget", () => {
	const { ui, lastConfig } = createSettings();
	ui.handleInput("\r");
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("e");
	ui.handleInput("custom:");
	ui.handleInput("\r");
	const model = lastConfig().lines[0].find((item) => item.type === "model");
	assert.equal(model?.labelOverride, "custom:");
});

test("options page edits the widget that was opened", () => {
	const { ui, lastConfig } = createSettings();
	ui.handleInput("\r");
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("w");
	assert.match(ui.render(100).join("\n"), /组件选项/);
	ui.handleInput("\r");
	ui.handleInput("custom:");
	ui.handleInput("\r");
	const model = lastConfig().lines[0].find((item) => item.type === "model");
	assert.equal(model?.labelOverride, "custom:");
});

test("search filters the widget list of the current line by name", () => {
	const { ui } = createSettings();
	ui.handleInput("\r");
	ui.handleInput("/");
	ui.handleInput("模型");
	ui.handleInput("\r");
	const text = ui.render(100).join("\n");
	assert.match(text, /模型/);
	assert.equal(text.includes("供应商"), false);
});

test("color picker lists options and applies a named color", () => {
	const initial = defaultConfig();
	initial.lines[0][0] = { ...initial.lines[0][0], color: undefined };
	const { ui, lastConfig } = createSettings(initial);
	ui.handleInput("\r");
	ui.handleInput("\r");
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	assert.match(ui.render(100).join("\n"), /选择颜色/);
	const steps = 1 + COLOR_PALETTE.findIndex((entry) => entry.spec === "brightred");
	for (let index = 0; index < steps; index += 1) ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	assert.equal(lastConfig().lines[0][0].color, "brightred");
});

test("color picker paints each name in its own color", () => {
	const initial = defaultConfig();
	initial.lines[0][0] = { ...initial.lines[0][0], color: undefined };
	const { ui } = createSettings(initial);
	ui.handleInput("\r");
	ui.handleInput("\r");
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	const raw = ui.render(100).join("\n");
	assert.ok(raw.includes("\x1b[38;2;241;76;76m赤"), JSON.stringify(raw.slice(0, 400)));
});

test("color picker hides colors that are too dark to read", () => {
	const { ui } = createSettings();
	ui.handleInput("\r");
	ui.handleInput("\r");
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	const text = ui.render(100).map(stripAnsi).join("\n");
	assert.equal(COLOR_PALETTE.some((entry) => entry.spec === "black"), false);
	assert.equal(COLOR_PALETTE.some((entry) => entry.spec === "gray"), false);
	assert.ok(COLOR_PALETTE.some((entry) => entry.spec === "brightcyan"), "bright colors stay");
	assert.equal(text.includes("黑色"), false);
});

test("f jumps from the highlighted widget into its color picker", () => {
	const { ui, lastConfig, previewed } = createSettings();
	ui.handleInput("\r");
	ui.handleInput("f");
	assert.match(ui.render(100).join("\n"), /选择颜色 · 前景色/);
	ui.handleInput("\u001b[B");
	ui.render(100);
	assert.equal(previewed()?.lines[0][0].color, "text");
	ui.handleInput("\r");
	assert.equal(lastConfig().lines[0][0].color, "text");
});

test("color picker can clear a color", () => {
	const config = defaultConfig();
	config.lines[0][0].color = "brightgreen";
	const { ui, lastConfig } = createSettings(config);
	ui.handleInput("\r");
	ui.handleInput("\r");
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	const index = 1 + COLOR_PALETTE.findIndex((entry) => entry.spec === "brightgreen");
	for (let step = 0; step < index; step += 1) ui.handleInput("\u001b[A");
	ui.handleInput("\r");
	assert.equal(lastConfig().lines[0][0].color, undefined);
});

test("color picker previews the highlighted color before committing", () => {
	const initial = defaultConfig();
	initial.lines[0][0] = { ...initial.lines[0][0], color: undefined };
	const { ui, lastConfig, previewed } = createSettings(initial);
	ui.handleInput("\r");
	ui.handleInput("\r");
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	ui.handleInput("\u001b[B");
	ui.render(100);
	assert.equal(previewed()?.lines[0][0].color, COLOR_PALETTE[0].spec);
	assert.equal(lastConfig().lines[0][0].color, undefined);
});

test("enum values open a picker and preview the highlighted value", () => {
	const { ui, lastConfig, previewed } = createSettings();
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	assert.match(ui.render(100).join("\n"), /全局样式/);
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	assert.match(ui.render(100).join("\n"), /图标集/);
	ui.handleInput("\u001b[B");
	ui.render(100);
	assert.equal(previewed()?.icons, "nerd");
	assert.equal(lastConfig().icons, "auto");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	assert.equal(lastConfig().icons, "unicode");
});

test("editing a label previews the typed text", () => {
	const { ui, lastConfig, previewed } = createSettings();
	ui.handleInput("\r");
	ui.handleInput("e");
	ui.handleInput("X");
	ui.render(100);
	assert.equal(previewed()?.lines[0][0].labelOverride, "X");
	assert.equal(lastConfig().lines[0][0].labelOverride, undefined);
});

test("glow option toggles the highlighted widget", () => {
	const { ui, lastConfig } = createSettings();
	ui.handleInput("\r");
	ui.handleInput("\r");
	for (let index = 0; index < 6; index += 1) ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	assert.equal(lastConfig().lines[0][0].glow, true);
});

test("line alignment row previews and applies an alignment", () => {
	const { ui, lastConfig, previewed } = createSettings();
	ui.handleInput("\r");
	for (let index = 0; index < 20; index += 1) ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	for (let index = 0; index < 3; index += 1) ui.handleInput("\u001b[B");
	ui.render(100);
	assert.equal(previewed()?.lineAligns[0], "right");
	assert.equal(lastConfig().lineAligns[0], "flex");
	ui.handleInput("\r");
	assert.equal(lastConfig().lineAligns[0], "right");
});


test("global padding previews and applies the highlighted side", () => {
	const { ui, previewed, lastConfig } = createSettings();
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	for (let index = 0; index < 10; index += 1) ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	ui.handleInput("\u001b[B");
	ui.render(100);
	assert.equal(previewed()?.defaultPaddingSide, "right");
	ui.handleInput("\r");
	assert.equal(lastConfig().defaultPaddingSide, "right");
});

test("global bold toggles and previews immediately", () => {
	const { ui, previewed, lastConfig } = createSettings();
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	for (let index = 0; index < 5; index += 1) ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	ui.render(100);
	assert.equal(previewed()?.overrides.bold, true);
	assert.equal(lastConfig().overrides.bold, true);
});

test("bold lift row previews and applies a typed value", () => {
	const { ui, previewed, lastConfig } = createSettings();
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	for (let index = 0; index < 6; index += 1) ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	for (let index = 0; index < 2; index += 1) ui.handleInput("\u007f");
	ui.handleInput("4");
	ui.handleInput("0");
	ui.render(100);
	assert.equal(previewed()?.overrides.boldLift, 40);
	ui.handleInput("\r");
	assert.equal(lastConfig().overrides.boldLift, 40);
});

test("glow strength row previews and applies a typed value", () => {
	const { ui, previewed, lastConfig } = createSettings();
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	for (let index = 0; index < 9; index += 1) ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	for (let index = 0; index < 2; index += 1) ui.handleInput("\u007f");
	ui.handleInput("5");
	ui.handleInput("0");
	ui.render(100);
	assert.equal(previewed()?.overrides.glowStrength, 50);
	ui.handleInput("\r");
	assert.equal(lastConfig().overrides.glowStrength, 50);
});


test("global dim toggles and previews immediately", () => {
	const { ui, previewed, lastConfig } = createSettings();
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	for (let index = 0; index < 7; index += 1) ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	ui.render(100);
	assert.equal(previewed()?.overrides.dim, true);
	assert.equal(lastConfig().overrides.dim, true);
});

test("global glow toggles and previews immediately", () => {
	const { ui, previewed, lastConfig } = createSettings();
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	for (let index = 0; index < 8; index += 1) ui.handleInput("\u001b[B");
	ui.handleInput("\r");
	ui.render(100);
	assert.equal(previewed()?.overrides.glow, true);
	assert.equal(lastConfig().overrides.glow, true);
});


test("duplicate action copies the highlighted widget below it", () => {
	const initial = defaultConfig();
	initial.lines[0][0] = { ...initial.lines[0][0], labelOverride: "P", color: "red" };
	const { ui, lastConfig } = createSettings(initial);
	ui.handleInput("\r");
	ui.handleInput("c");
	const line = lastConfig().lines[0];
	assert.equal(line[0].labelOverride, "P");
	assert.equal(line[1].labelOverride, "P");
	assert.equal(line[1].color, "red");
	assert.notEqual(line[1].id, line[0].id);
});

test("adding a widget inserts it after the highlighted widget", () => {
	const { ui, lastConfig } = createSettings();
	ui.handleInput("\r");
	ui.handleInput("\u001b[B");
	ui.handleInput("\u001b[B");
	ui.handleInput("a");
	ui.handleInput("\r");
	ui.handleInput("\r");
	const line = lastConfig().lines[0];
	assert.equal(line[2].type, "model");
	assert.equal(line[3].type, "provider");
	assert.notEqual(line[3].id, line[0].id);
});
test("settings render fills the terminal height with a padded background", () => {
	const ui = new MeTuiSettings({
		config: defaultConfig(),
		theme: fakeTheme(),
		done: () => {},
		onChange: () => {},
		preview: () => ["preview line"],
		onRequestRender: () => {},
		terminalHeight: () => 40,
	});
	const lines = ui.render(100);
	assert.ok(lines.length >= 40, "expected at least 40 rendered lines");
	for (const line of lines) {
		assert.equal(visibleWidth(line), 100, "every line must fill the full overlay width");
	}
});
test("settings overlay keeps the terminal background and fills every line", () => {
	const theme = { ...fakeTheme(), getBgAnsi: () => "\x1b[48;5;17m" } as unknown as ReturnType<typeof fakeTheme>;
	const ui = new MeTuiSettings({
		config: defaultConfig(),
		theme,
		done: () => {},
		onChange: () => {},
		preview: () => ["preview line"],
		onRequestRender: () => {},
		terminalHeight: () => 30,
	});
	const lines = ui.render(80);
	assert.ok(lines.length >= 30);
	for (const line of lines) {
		assert.equal(line.includes("\x1b[48;5;17m"), false, "the overlay must not paint a themed background");
		assert.equal(visibleWidth(line), 80, "every line must cover the full width");
	}
});
