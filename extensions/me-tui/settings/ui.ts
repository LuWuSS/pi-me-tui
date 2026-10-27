import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	Input,
	Key,
	SelectList,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { SelectItem, SelectListTheme } from "@earendil-works/pi-tui";
import {
	BACKGROUND_PALETTE,
	COLOR_PALETTE,
	hexOf,
	isValidColorSpec,
	NAMED_COLOR_SPECS,
	paint,
	POWERLINE_THEME_NAMES,
	THEME_PALETTE,
	themeColorTokens,
} from "../colors.ts";
import {
	addItem,
	addLine,
	allItems,
	defaultConfig,
	DEFAULT_BOLD_LIFT,
	DEFAULT_GLOW_STRENGTH,
	itemCount,
	lineCount,
	moveItem,
	normalizeConfig,
	removeItem,
	removeLine,
	replaceItem,
	updateItem,
	updateLineAlign,
} from "../config.ts";
import { createItem, getWidget, WIDGET_CATEGORIES, widgetName, widgetsInCategory } from "../registry.ts";
import type {
	LineAlign,
	LocalizedText,
	MeTuiConfig,
	PaddingSide,
	WidgetCategory,
	WidgetItem,
} from "../types.ts";
import { createWidgetId, deepClone, localized } from "../utils.ts";

type Page =
	| "main"
	| "items"
	| "addCategory"
	| "addWidget"
	| "options"
	| "colorPicker"
	| "valuePicker"
	| "powerline"
	| "style"
	| "terminal"
	| "importConfirm"
	| "resetConfirm";

type FieldKind = "boolean" | "enum" | "number" | "text" | "color";

const CUSTOM_COLOR = "__custom__";

interface EnumValue {
	value: string;
	label: LocalizedText;
}

interface Row {
	id: string;
	label: string;
	description?: string;
	activate: () => void;
}

interface InputState {
	label: string;
	value: string;
	placeholder?: string;
	allowEmpty: boolean;
	tabDefault?: () => string;
	validate?: (value: string) => string | undefined;
	preview?: (value: string) => MeTuiConfig | undefined;
	onSubmit: (value: string) => void;
}

export interface MeTuiSettingsOptions {
	config: MeTuiConfig;
	theme: Theme;
	done: () => void;
	onChange: (config: MeTuiConfig) => void;
	preview: (config: MeTuiConfig, width: number) => string[];
	onRequestRender: () => void;
	terminalHeight?: () => number;
}

function localizedPair(zh: string, en: string): LocalizedText {
	return { zh, en };
}

function normalizeEnumValues(values: Array<string | EnumValue> | undefined): EnumValue[] {
	if (!values) return [];
	return values.map((value) =>
		typeof value === "string" ? { value, label: localizedPair(value, value) } : value,
	);
}

function parseBoolean(value: string | undefined): boolean {
	return value === "true" || value === "1" || value === "on";
}

export class MeTuiSettings {
	private config: MeTuiConfig;
	private readonly theme: Theme;
	private readonly done: () => void;
	private readonly onChange: (config: MeTuiConfig) => void;
	private readonly preview: (config: MeTuiConfig, width: number) => string[];
	private readonly onRequestRender: () => void;
	private readonly terminalHeight: () => number;
	private page: Page = "main";
	private optionsReturnPage: Page = "items";
	private replaceMode = false;
	private replaceItemId: string | undefined;
	private addWidgetType: string | undefined;
	private lineIndex = 0;
	private itemId: string | undefined;
	private addCategory: WidgetCategory = "core";
	private search = "";
	private status: string | undefined;
	private moving = false;
	private rows: Row[] = [];
	private select: SelectList;
	private input: Input | undefined;
	private inputState: InputState | undefined;
	private pendingImport: MeTuiConfig | undefined;
	private importNotice: string[] = [];
	private colorTarget:
		| {
				label: string;
				current: string;
				background: boolean;
				apply: (value: string | undefined) => void;
				preview?: (config: MeTuiConfig, value: string | undefined) => MeTuiConfig;
		  }
		| undefined;
	private colorReturnPage: Page = "options";
	private colorChoices = new Map<string, string | undefined>();
	private valueTarget:
		| {
				label: string;
				current: string;
				values: EnumValue[];
				preview: (config: MeTuiConfig, value: string) => MeTuiConfig;
				apply: (value: string) => void;
		  }
		| undefined;
	private valueReturnPage: Page = "options";
	private valueChoices = new Map<string, string>();
	private addAfterId: string | undefined;

	constructor(options: MeTuiSettingsOptions) {
		this.config = deepClone(options.config);
		this.theme = options.theme;
		this.done = options.done;
		this.onChange = options.onChange;
		this.preview = options.preview;
		this.onRequestRender = options.onRequestRender;
		this.terminalHeight = options.terminalHeight ?? (() => 0);
		this.select = this.createSelect([]);
		this.rebuild();
	}

	invalidate(): void {}

	handleInput(data: string): void {
		if (this.input) {
			if (matchesKey(data, Key.escape)) {
				this.cancelInput();
				return;
			}
			if (data === "\t" && this.inputState?.tabDefault) {
				this.input.setValue(this.inputState.tabDefault());
				this.input.focused = true;
				this.onRequestRender();
				return;
			}
			this.input.handleInput(data);
			this.onRequestRender();
			return;
		}
		if (this.moving) {
			if (matchesKey(data, Key.up)) {
				this.moveCurrent(-1);
				return;
			}
			if (matchesKey(data, Key.down)) {
				this.moveCurrent(1);
				return;
			}
			if (data === "m" || matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
				this.moving = false;
				this.status = undefined;
				this.rebuild();
			}
			return;
		}
		if (this.page === "main" && (data === "q" || matchesKey(data, Key.escape))) {
			this.done();
			return;
		}
		if (this.page !== "main" && data === "q") {
			this.back();
			return;
		}
		if (matchesKey(data, Key.escape)) {
			this.back();
			return;
		}
		if (this.page === "items") {
			if (data === "a") {
				this.replaceMode = false;
				this.replaceItemId = undefined;
				this.addAfterId = this.currentItem()?.id;
				this.page = "addCategory";
				this.search = "";
				this.rebuild();
				return;
			}
			if (data === "r" && this.currentItem()) {
				this.replaceMode = true;
				this.replaceItemId = this.currentItem()?.id;
				this.page = "addCategory";
				this.search = "";
				this.rebuild();
				return;
			}
			if (data === "c" && this.currentItem()) {
				this.duplicateCurrentItem();
				return;
			}
			if (data === "d") {
				this.deleteCurrentItem();
				return;
			}
			if (data === "m" && this.currentItem()) {
				this.moving = true;
				this.status = "移动模式：↑↓ 调整位置，Enter/m 完成";
				this.rebuild();
				return;
			}
			if (data === "e" && this.currentItem()) {
				this.editLabel();
				return;
			}
			if (data === "w" && this.currentItem()) {
				this.itemId = this.currentItem()?.id;
				this.optionsReturnPage = "items";
				this.page = "options";
				this.rebuild();
				return;
			}
			if (data === "f" && this.currentItem()) {
				this.openItemColor("color");
				return;
			}
			if (data === "F" && this.currentItem()) {
				this.openItemColor("backgroundColor");
				return;
			}
			if (data === "h" && this.currentItem()) {
				const item = this.currentItem();
				if (item) {
					this.patchItem({ hideEmpty: item.hideEmpty === true ? undefined : true });
				}
				return;
			}
			if (data === "/") {
				this.startSearch();
				return;
			}
			if (data === "n") {
				this.lineIndex = this.config.lines.length;
				this.commit(addLine(this.config));
				this.lineIndex = Math.max(0, this.config.lines.length - 1);
				this.rebuild();
				return;
			}
			if (data === "x") {
				this.removeCurrentLine();
				return;
			}
			if (matchesKey(data, Key.tab)) {
				if (this.config.lines.length > 0) {
					this.lineIndex = (this.lineIndex + 1) % this.config.lines.length;
					this.itemId = undefined;
					this.rebuild();
				}
				return;
			}
		}
		if (this.page === "addWidget" && data === "/") {
			this.startSearch();
			return;
		}
		this.select.handleInput(data);
		this.onRequestRender();
	}

	render(width: number): string[] {
		const safeWidth = Math.max(30, width);
		const inner = safeWidth - 4;
		const lines: string[] = [];
		lines.push(this.theme.bold(this.theme.fg("accent", this.title())));
		lines.push(this.theme.fg("dim", this.breadcrumb()));
		lines.push("");
		const preview = this.renderPreview(inner);
		if (preview.length > 0) {
			lines.push(this.theme.fg("muted", this.t("预览", "Preview")));
			for (const line of preview) lines.push(line);
			lines.push("");
		}
		if (this.input && this.inputState) {
			lines.push(this.theme.fg("accent", this.inputState.label));
			lines.push(...this.input.render(inner));
		} else {
			lines.push(...this.select.render(inner));
		}
		lines.push("");
		lines.push(this.theme.fg("dim", this.hint()));
		if (this.status) lines.push(this.theme.fg("warning", this.status));
		// The panel keeps the terminal's own background instead of painting a themed one, so the
		// preview shows the same backdrop the real statusline sits on. The lines are full width,
		// so their spaces still cover whatever is behind the overlay.
		const painted = lines.map((line) => {
			const text = truncateToWidth(`  ${line}`, safeWidth, "…");
			return text + " ".repeat(Math.max(0, safeWidth - visibleWidth(text)));
		});
		const height = Math.max(0, Math.round(this.terminalHeight()));
		if (height > painted.length) {
			const blank = " ".repeat(safeWidth);
			while (painted.length < height) painted.push(blank);
		}
		return painted;
	}

	private t(zh: string, en: string): string {
		return this.config.language === "zh" ? zh : en;
	}

	private title(): string {
		if (this.page === "colorPicker") {
			const label = this.colorTarget?.label ?? "";
			return this.t("选择颜色 · " + label, "Pick color · " + label);
		}
		if (this.page === "valuePicker") {
			const label = this.valueTarget?.label ?? "";
			return this.t("选择 · " + label, "Choose · " + label);
		}
		const titles: Record<Page, LocalizedText> = {
			main: localizedPair("me-tui 状态栏配置", "me-tui statusline"),
			items: localizedPair("编辑状态栏", "Edit statusline"),
			addCategory: this.replaceMode
				? localizedPair("修改组件类型 · 选择分类", "Change widget type · category")
				: localizedPair("添加组件 · 选择分类", "Add widget · category"),
			addWidget: this.replaceMode
				? localizedPair("修改组件类型", "Change widget type")
				: localizedPair("添加组件", "Add widget"),
			options: localizedPair("组件选项", "Widget options"),
			colorPicker: localizedPair("选择颜色", "Pick color"),
			valuePicker: localizedPair("选择", "Choose"),
			powerline: localizedPair("Powerline 设置", "Powerline"),
			style: localizedPair("全局样式", "Global style"),
			terminal: localizedPair("终端与刷新", "Terminal and refresh"),
			importConfirm: localizedPair("导入配置", "Import config"),
			resetConfirm: localizedPair("恢复默认", "Reset"),
		};
		return this.t(titles[this.page].zh, titles[this.page].en);
	}

	private breadcrumb(): string {
		const trail = (page: Page): string[] => {
			const parts: string[] = [this.t("主菜单", "Main")];
			if (page === "style") {
				parts.push(this.t("全局样式", "Global style"));
				return parts;
			}
			if (page === "terminal") {
				parts.push(this.t("终端与刷新", "Terminal and refresh"));
				return parts;
			}
			if (page === "powerline") {
				parts.push("Powerline");
				return parts;
			}
			if (page === "importConfirm") {
				parts.push(this.t("导入配置", "Import config"));
				return parts;
			}
			if (page === "resetConfirm") {
				parts.push(this.t("恢复默认", "Reset"));
				return parts;
			}
			if (page === "addCategory" || page === "addWidget") {
				parts.push(this.t("编辑状态栏", "Edit"));
				parts.push(this.t(`第 ${this.lineIndex + 1} 行`, `Line ${this.lineIndex + 1}`));
				if (page === "addWidget") parts.push(this.replaceMode ? this.t("修改组件类型", "Change type") : this.t("添加组件", "Add widget"));
				return parts;
			}
			if (page === "items" || page === "options") {
				parts.push(this.t("编辑状态栏", "Edit"));
				parts.push(this.t(`第 ${this.lineIndex + 1} 行`, `Line ${this.lineIndex + 1}`));
				if (page === "options") {
					const item = this.currentItem();
					const definition = item ? getWidget(item.type) : undefined;
					if (definition) parts.push(widgetName(definition, this.config.language));
				}
			}
			return parts;
		};
		const page =
			this.page === "valuePicker"
				? this.valueReturnPage
				: this.page === "colorPicker"
					? this.colorReturnPage
					: this.page;
		const parts = trail(page);
		if (this.page === "colorPicker" && this.colorTarget) parts.push(this.colorTarget.label);
		if (this.page === "valuePicker" && this.valueTarget) parts.push(this.valueTarget.label);
		return parts.join(" › ");
	}
	private hint(): string {
		if (this.input) {
			const tab = this.inputState?.tabDefault ? ` · ${this.t("Tab 恢复默认", "Tab default")}` : "";
			return `${this.t("Enter 确认 · Esc 取消", "Enter confirm · Esc cancel")}${tab}`;
		}
		if (this.page === "main") return this.t("↑↓ 导航 · Enter 选择 · q 退出", "↑↓ navigate · Enter select · q quit");
		if (this.page === "items") {
			return this.t(
				"Enter 选项 · f 改色 · F 底色 · r 改类型 · a 添加 · c 复制 · d 删除 · e 前缀 · w 选项 · h 隐藏空值 · m 移动 · Tab 换行 · n 新增行 · x 删除行 · / 搜索 · q 返回",
				"Enter options · f color · F background · r change type · a add · c duplicate · d delete · e label · w options · h hide empty · m move · Tab line · n new line · x del line · / search · q back",
			);
		}
		if (this.page === "addWidget") return this.t("↑↓ 导航 · Enter 添加 · / 搜索 · Esc 返回", "↑↓ navigate · Enter add · / search · Esc back");
		if (this.page === "options") {
			const back = this.optionsReturnPage === "addWidget" ? this.t(" · Esc 返回继续添加", " · Esc back to add more") : "";
			return this.t(`↑↓ 导航 · Enter 修改${back}`, `↑↓ navigate · Enter edit${back}`);
		}
		if (this.page === "colorPicker" || this.page === "valuePicker") {
			return this.t("↑↓ 导航 · Enter 选择 · Esc 返回", "↑↓ navigate · Enter select · Esc back");
		}
		if (this.page === "importConfirm") return this.t("默认取消 · Enter 选择 · Esc 返回", "Cancel is default · Enter select · Esc back");
		if (this.page === "resetConfirm") return this.t("默认取消 · Enter 选择 · Esc 返回", "Cancel is default · Enter select · Esc back");
		return this.t("↑↓ 导航 · Enter 修改 · Esc 返回", "↑↓ navigate · Enter edit · Esc back");
	}

	private renderPreview(width: number): string[] {
		if (this.page === "importConfirm") return this.importNotice;
		if (this.page === "resetConfirm") return [];
		try {
			const inputPreview = this.inputState?.preview?.(this.input?.getValue() ?? "");
			return this.preview(inputPreview ?? this.previewConfig(), Math.max(20, width));
		} catch {
			return [];
		}
	}

	private createSelect(items: SelectItem[]): SelectList {
		const list = new SelectList(items, 12, this.selectTheme(), {
			maxPrimaryColumnWidth: 60,
		});
		list.onSelect = (item) => {
			const row = this.rows.find((entry) => entry.id === item.value);
			if (row) row.activate();
		};
		list.onCancel = () => this.back();
		list.onSelectionChange = () => {
			if (this.page === "colorPicker" || this.page === "valuePicker") this.onRequestRender();
		};
		return list;
	}

	private selectTheme(): SelectListTheme {
		return {
			selectedPrefix: (text) => this.theme.fg("accent", text),
			selectedText: (text) => this.theme.bold(text),
			description: (text) => this.theme.fg("muted", text),
			scrollInfo: (text) => this.theme.fg("dim", text),
			noMatch: (text) => this.theme.fg("warning", text),
		};
	}

	private rebuild(): void {
		const selected = this.select.getSelectedItem()?.value;
		this.rows = this.buildRows();
		const items = this.rows.map((row) => ({
			value: row.id,
			label: row.label,
			description: row.description,
		}));
		this.select = this.createSelect(items);
		if (selected) {
			const index = items.findIndex((item) => item.value === selected);
			if (index >= 0) this.select.setSelectedIndex(index);
		}
		this.onRequestRender();
	}

	private buildRows(): Row[] {
		switch (this.page) {
			case "items":
				return this.itemsRows();
			case "addCategory":
				return this.addCategoryRows();
			case "addWidget":
				return this.addWidgetRows();
			case "options":
				return this.optionsRows();
			case "colorPicker":
				return this.colorRows();
			case "valuePicker":
				return this.valueRows();
			case "powerline":
				return this.powerlineRows();
			case "style":
				return this.styleRows();
			case "terminal":
				return this.terminalRows();
			case "importConfirm":
				return this.importRows();
			case "resetConfirm":
				return this.resetRows();
			default:
				return this.mainRows();
		}
	}

	private mainRows(): Row[] {
		const lineSummary = `${lineCount(this.config)} ${this.t("行", "lines")} · ${itemCount(this.config)} ${this.t("个组件", "widgets")}`;
		return [
			{
				id: "items",
				label: this.t("编辑状态栏", "Edit statusline"),
				description: lineSummary,
				activate: () => {
					this.page = "items";
					this.lineIndex = 0;
					this.itemId = undefined;
					this.search = "";
					this.status = undefined;
					this.rebuild();
				},
			},
			{
				id: "powerline",
				label: this.t("Powerline 设置", "Powerline"),
				description: `${this.config.powerline.enabled ? this.t("已开启", "on") : this.t("已关闭", "off")} · ${this.config.powerline.theme ?? "default"}`,
				activate: () => {
					this.page = "powerline";
					this.rebuild();
				},
			},
			{
				id: "style",
				label: this.t("全局样式覆盖", "Global style"),
				description: `${this.config.language} · ${this.config.icons} · ${this.config.colorLevel}`,
				activate: () => {
					this.page = "style";
					this.rebuild();
				},
			},
			{
				id: "terminal",
				label: this.t("终端选项", "Terminal options"),
				description: `${this.config.refreshIntervalMs}ms · Git ${this.config.gitCacheTtlSeconds}s · ${this.t("命令", "cmd")} ${this.config.customCommandCacheTtlSeconds}s`,
				activate: () => {
					this.page = "terminal";
					this.rebuild();
				},
			},
			{
				id: "export",
				label: this.t("导出配置", "Export config"),
				description: this.t("保存为 JSON 文件", "Save as JSON"),
				activate: () => this.exportConfig(),
			},
			{
				id: "import",
				label: this.t("导入配置", "Import config"),
				description: this.t("预览差异后确认", "Preview diff before applying"),
				activate: () => this.importConfig(),
			},
			{
				id: "reset",
				label: this.t("恢复默认配置", "Reset to defaults"),
				description: this.t("需要确认", "Confirmation required"),
				activate: () => {
					this.page = "resetConfirm";
					this.rebuild();
				},
			},
			{
				id: "close",
				label: this.t("保存并退出", "Save and exit"),
				description: this.t("配置已实时保存", "Changes are saved live"),
				activate: () => this.done(),
			},
		];
	}

	private lineAlignLabel(align: LineAlign): string {
		if (align === "left") return this.t("靠左", "Left");
		if (align === "center") return this.t("居中", "Center");
		if (align === "right") return this.t("靠右", "Right");
		return this.t("默认（按分隔）", "Default (split)");
	}

	private itemsRows(): Row[] {
		const query = this.search.trim().toLowerCase();
		const align = this.config.lineAligns?.[this.lineIndex] ?? "flex";
		const line = (this.config.lines[this.lineIndex] ?? []).filter((item) => {
			if (!query) return true;
			const definition = getWidget(item.type);
			const name = definition ? widgetName(definition, this.config.language) : item.type;
			return (
				item.type.toLowerCase().includes(query) ||
				item.id.toLowerCase().includes(query) ||
				name.toLowerCase().includes(query)
			);
		});
		const rows: Row[] = line.map((item, index) => {
			const definition = getWidget(item.type);
			const name = definition ? widgetName(definition, this.config.language) : item.type;
			const prefix = item.rawValue
				? ""
				: (item.labelOverride ?? definition?.defaultLabel?.[this.config.language] ?? "");
			// Separators ignore their own color and follow the widget before them; a flex spacer
			// renders nothing, so neither shows a color here.
			const colorDetail =
				item.type === "flex"
					? []
					: [
							`${this.t("前景", "fg")} ${
								item.type === "separator"
									? this.t("跟随", "inherits")
									: this.paintedSpec(item.color, this.colorDisplayName(item.color))
							}`,
							item.backgroundColor
								? `${this.t("背景", "bg")} ${this.paintedSpec(item.backgroundColor, this.colorDisplayName(item.backgroundColor))}`
								: "",
						];
			const detail = [
				`${index + 1}.`,
				item.type,
				item.rawValue
					? this.t("纯值", "raw")
					: prefix
						? `${this.t("前缀", "label")}: ${prefix.trim()}`
						: this.t("无前缀", "no label"),
				item.hideEmpty ? this.t("空值隐藏", "hide empty") : "",
				...colorDetail,
			]
				.filter(Boolean)
				.join(" · ");
			return {
				id: item.id,
				label: `${this.moving ? "↕ " : ""}${name}`,
				description: detail,
				activate: () => {
					this.itemId = item.id;
					this.optionsReturnPage = "items";
					this.page = "options";
					this.rebuild();
				},
			};
		});
		rows.push({
			id: "__add",
			label: `+ ${this.t("添加组件", "Add widget")}`,
			description: this.t("从分类中选择要加入本行的组件", "Choose a widget for this line"),
			activate: () => {
				this.page = "addCategory";
				this.search = "";
				this.rebuild();
			},
		});
		rows.push({
			id: "__align",
			label: this.t("行对齐", "Line alignment"),
			description:
				this.t("第 " + (this.lineIndex + 1) + " 行", "Line " + (this.lineIndex + 1)) +
				" · " +
				this.lineAlignLabel(align),
			activate: () =>
				this.openValuePicker({
					label: this.t("行对齐", "Line alignment"),
					current: align,
					values: [
						{ value: "flex", label: localizedPair("默认（按分隔）", "Default (split)") },
						{ value: "left", label: localizedPair("靠左", "Left") },
						{ value: "center", label: localizedPair("居中", "Center") },
						{ value: "right", label: localizedPair("靠右", "Right") },
					],
					preview: (config, value) => updateLineAlign(config, this.lineIndex, value as LineAlign),
					apply: (value) => this.commit(updateLineAlign(this.config, this.lineIndex, value as LineAlign)),
				}),
		});
		return rows;
	}

	private addCategoryRows(): Row[] {
		return WIDGET_CATEGORIES.map((entry) => ({
			id: entry.category,
			label: localized(entry.label, this.config.language),
			description: `${widgetsInCategory(entry.category).length} ${this.t("个组件", "widgets")}`,
			activate: () => {
				this.addCategory = entry.category;
				this.search = "";
				this.page = "addWidget";
				this.rebuild();
			},
		}));
	}

	private addWidgetRows(): Row[] {
		const query = this.search.toLowerCase();
		return widgetsInCategory(this.addCategory)
			.filter((definition) => {
				if (!query) return true;
				return (
					definition.type.toLowerCase().includes(query) ||
					definition.name.zh.toLowerCase().includes(query) ||
					definition.name.en.toLowerCase().includes(query)
				);
			})
			.map((definition) => ({
				id: definition.type,
				label: widgetName(definition, this.config.language),
				description: `${definition.type} · ${definition.description[this.config.language]}`,
				activate: () => {
					const item = createItem(definition.type);
					if (this.replaceMode && this.replaceItemId) {
						const previous = this.replaceItemId;
						this.replaceMode = false;
						this.replaceItemId = undefined;
						this.itemId = item.id;
						this.page = "items";
						this.search = "";
						this.status = this.t(`已改为${widgetName(definition, this.config.language)}`, `Changed to ${widgetName(definition, this.config.language)}`);
						this.commit(replaceItem(this.config, this.lineIndex, previous, item));
						this.selectRowById(item.id);
						return;
					}
					const afterId = this.addAfterId;
					this.addAfterId = item.id;
					this.addWidgetType = definition.type;
					this.itemId = item.id;
					this.optionsReturnPage = "addWidget";
					this.page = "options";
					this.search = "";
					this.status = this.t("已添加，修改后按 Esc 继续选择", "Added · Esc to add more");
					this.commit(addItem(this.config, this.lineIndex, item, afterId));
				},
			}));
	}

	private optionsRows(): Row[] {
		const item = this.currentItem();
		if (!item) return [];
		const definition = getWidget(item.type);
		if (!definition) return [];
		const rows: Row[] = [];
		if (definition.supportsLabel) {
			rows.push(this.itemFieldRow(item, "labelOverride", "text", this.t("文字前缀", "Label prefix")));
		}
		if (definition.supportsRawValue) {
			rows.push(
				this.itemFieldRow(
					item,
					"rawValue",
					"boolean",
					this.t("纯值模式", "Raw value"),
					undefined,
					undefined,
					undefined,
					this.t("隐藏文字前缀，只显示数值", "Hide the label, show only the value"),
				),
			);
		}
		rows.push(this.itemFieldRow(item, "color", "color", this.t("前景色", "Foreground")));
		rows.push(this.itemFieldRow(item, "backgroundColor", "color", this.t("背景色", "Background")));
		rows.push(this.itemFieldRow(item, "bold", "boolean", this.t("粗体", "Bold")));
		rows.push(this.itemFieldRow(item, "dim", "boolean", this.t("暗色", "Dim")));
		rows.push(this.itemFieldRow(item, "glow", "boolean", this.t("发光", "Glow")));
		rows.push(this.itemFieldRow(item, "maxWidth", "number", this.t("最大宽度", "Max width")));
		rows.push(this.itemFieldRow(item, "hideEmpty", "boolean", this.t("空值隐藏", "Hide when empty")));
		rows.push(
			this.itemFieldRow(item, "numberFormat", "enum", this.t("数字格式", "Number format"), [
				{ value: "compact", label: localizedPair("紧凑", "compact") },
				{ value: "full", label: localizedPair("完整", "full") },
				{ value: "comma", label: localizedPair("千分位", "comma") },
			]),
		);
		for (const option of definition.options ?? []) {
			const values = option.values;
			rows.push(
				this.itemFieldRow(
					item,
					option.field,
					option.kind,
					localized(option.label, this.config.language),
					values,
					option.min,
					option.max,
					option.description ? localized(option.description, this.config.language) : undefined,
				),
			);
		}
		rows.push({
			id: "__retype",
			label: this.t("修改组件类型", "Change widget type"),
			description: this.t("从分类中选择其它组件替换", "Replace with another widget from a category"),
			activate: () => {
				this.replaceMode = true;
				this.replaceItemId = item.id;
				this.page = "addCategory";
				this.search = "";
				this.rebuild();
			},
		});
		rows.push({
			id: "__parent",
			label: `‹ ${this.t("返回上级布局", "Back to line layout")}`,
			description: this.t(`第 ${this.lineIndex + 1} 行`, `Line ${this.lineIndex + 1}`),
			activate: () => {
				this.optionsReturnPage = "items";
				this.page = "items";
				this.rebuild();
				this.selectRowById(item.id);
			},
		});
		return rows;
	}

	private powerlineRows(): Row[] {
		return [
			this.configFieldRow("powerline.enabled", this.t("启用 Powerline", "Enable powerline"), "boolean", () => this.config.powerline.enabled, (value) => {
				this.config.powerline.enabled = Boolean(value);
			}),
			this.configFieldRow("powerline.theme", this.t("主题", "Theme"), "enum", () => this.config.powerline.theme ?? "default", (value) => {
				this.config.powerline.theme = String(value);
			}, POWERLINE_THEME_NAMES),
			this.configFieldRow("powerline.separators", this.t("分隔符", "Separators"), "text", () => this.config.powerline.separators.join(","), (value) => {
				const list = String(value ?? "")
					.split(",")
					.map((entry) => entry.trim())
					.filter(Boolean);
				this.config.powerline.separators = list.length > 0 ? list : ["\uE0B0"];
			}),
			this.configFieldRow("powerline.invert", this.t("反转分隔符背景", "Invert separator backgrounds"), "boolean", () => this.config.powerline.separatorInvertBackground[0] === true, (value) => {
				this.config.powerline.separatorInvertBackground = [Boolean(value)];
			}),
			this.configFieldRow("powerline.startCaps", this.t("起始端帽", "Start caps"), "text", () => this.config.powerline.startCaps.join(","), (value) => {
				this.config.powerline.startCaps = String(value ?? "")
					.split(",")
					.map((entry) => entry.trim())
					.filter(Boolean);
			}),
			this.configFieldRow("powerline.endCaps", this.t("结束端帽", "End caps"), "text", () => this.config.powerline.endCaps.join(","), (value) => {
				this.config.powerline.endCaps = String(value ?? "")
					.split(",")
					.map((entry) => entry.trim())
					.filter(Boolean);
			}),
			this.configFieldRow("powerline.autoAlign", this.t("自动右对齐", "Auto align"), "boolean", () => this.config.powerline.autoAlign, (value) => {
				this.config.powerline.autoAlign = Boolean(value);
			}),
			this.configFieldRow("powerline.continue", this.t("跨行延续主题", "Continue theme across lines"), "boolean", () => this.config.powerline.continueThemeAcrossLines, (value) => {
				this.config.powerline.continueThemeAcrossLines = Boolean(value);
			}),
		];
	}

	private styleRows(): Row[] {
		return [
			this.configFieldRow("language", this.t("语言", "Language"), "enum", () => this.config.language, (value) => {
				this.config.language = value === "en" ? "en" : "zh";
			}, [
				{ value: "zh", label: localizedPair("中文", "Chinese") },
				{ value: "en", label: localizedPair("英文", "English") },
			]),
			this.configFieldRow("icons", this.t("图标集", "Icons"), "enum", () => this.config.icons, (value) => {
				this.config.icons = String(value) as MeTuiConfig["icons"];
			}, [
				{ value: "auto", label: localizedPair("自动", "Auto") },
				{ value: "nerd", label: localizedPair("Nerd Font", "Nerd Font") },
				{ value: "unicode", label: localizedPair("Unicode", "Unicode") },
				{ value: "ascii", label: localizedPair("纯 ASCII", "ASCII") },
			]),
			this.configFieldRow("colorLevel", this.t("颜色级别", "Color level"), "enum", () => this.config.colorLevel, (value) => {
				this.config.colorLevel = String(value) as MeTuiConfig["colorLevel"];
			}, [
				{ value: "auto", label: localizedPair("自动", "Auto") },
				{ value: "ansi16", label: localizedPair("16 色", "16 colors") },
				{ value: "ansi256", label: localizedPair("256 色", "256 colors") },
				{ value: "truecolor", label: localizedPair("真彩色", "Truecolor") },
			]),
			this.configFieldRow("overrides.fg", this.t("全局前景色", "Global foreground"), "color", () => this.config.overrides.fg ?? "", (value) => {
				this.config.overrides.fg = value ? String(value) : undefined;
			}),
			this.configFieldRow("overrides.bg", this.t("全局背景色", "Global background"), "color", () => this.config.overrides.bg ?? "", (value) => {
				this.config.overrides.bg = value ? String(value) : undefined;
			}),
			this.configFieldRow("overrides.bold", this.t("全局粗体", "Global bold"), "boolean", () => this.config.overrides.bold === true, (value) => {
				this.config.overrides.bold = value ? true : undefined;
			}, undefined, undefined, undefined, undefined, this.t("只加字重，不改颜色", "Weight only, colors untouched")),
			this.configFieldRow("overrides.boldLift", this.t("前景色加粗 (%)", "Foreground lift (%)"), "number", () => this.config.overrides.boldLift ?? DEFAULT_BOLD_LIFT, (value) => {
				this.config.overrides.boldLift = Number(value);
			}, undefined, 0, 100, 5, this.t("整条提亮，0 = 只加字重", "Whole item, 0 = weight only")),
			this.configFieldRow("overrides.dim", this.t("全局暗色", "Global dim"), "boolean", () => this.config.overrides.dim === true, (value) => {
				this.config.overrides.dim = value ? true : undefined;
			}),
			this.configFieldRow("overrides.glow", this.t("全局发光", "Global glow"), "boolean", () => this.config.overrides.glow === true, (value) => {
				this.config.overrides.glow = value ? true : undefined;
			}, undefined, undefined, undefined, undefined, this.t("柔和高亮，可与粗体叠加", "Soft lift, stacks with bold")),
			this.configFieldRow("overrides.glowStrength", this.t("发光强度 (%)", "Glow strength (%)"), "number", () => this.config.overrides.glowStrength ?? DEFAULT_GLOW_STRENGTH, (value) => {
				this.config.overrides.glowStrength = Number(value);
			}, undefined, 1, 100, 5, this.t("1 最弱，100 最亮", "1 is subtle, 100 is brightest")),
			this.configFieldRow("padding", this.t("默认内边距", "Default padding"), "enum", () => this.config.defaultPaddingSide, (value) => {
				this.config.defaultPaddingSide = String(value) as PaddingSide;
			}, [
				{ value: "both", label: localizedPair("两侧", "Both") },
				{ value: "left", label: localizedPair("左侧", "Left") },
				{ value: "right", label: localizedPair("右侧", "Right") },
			]),
			this.configFieldRow("flexMode", this.t("弹性模式", "Flex mode"), "enum", () => this.config.flexMode, (value) => {
				this.config.flexMode = String(value) as MeTuiConfig["flexMode"];
			}, [
				{ value: "full", label: localizedPair("完整宽度", "Full") },
				{ value: "full-minus-40", label: localizedPair("预留 40 列", "Reserve 40") },
				{ value: "full-until-compact", label: localizedPair("紧凑时预留", "Until compact") },
			]),
			this.configFieldRow("compactThreshold", this.t("紧凑阈值 (%)", "Compact threshold (%)"), "number", () => this.config.compactThreshold, (value) => {
				this.config.compactThreshold = Number(value);
			}, undefined, 1, 100, 1),
			this.configFieldRow("currentScope", this.t("本次统计范围", "Current scope"), "enum", () => this.config.currentScope, (value) => {
				this.config.currentScope = value === "turn" ? "turn" : "agent";
			}, [
				{ value: "agent", label: localizedPair("本次代理运行", "Current agent run") },
				{ value: "turn", label: localizedPair("当前回合", "Current turn") },
			]),
		];
	}

	private terminalRows(): Row[] {
		return [
			this.configFieldRow("enabled", this.t("启用状态栏", "Enable statusline"), "boolean", () => this.config.enabled, (value) => {
				this.config.enabled = Boolean(value);
			}, undefined, undefined, undefined, undefined, this.t("关闭后仍可通过 /me-tui 打开配置", "You can still open /me-tui when disabled")),
			this.configFieldRow("refreshIntervalMs", this.t("刷新间隔 (ms)", "Refresh interval (ms)"), "number", () => this.config.refreshIntervalMs, (value) => {
				this.config.refreshIntervalMs = Number(value);
			}, undefined, 200, 60000, 100),
			this.configFieldRow("gitCacheTtlSeconds", this.t("Git 缓存 (s)", "Git cache (s)"), "number", () => this.config.gitCacheTtlSeconds, (value) => {
				this.config.gitCacheTtlSeconds = Number(value);
			}, undefined, 0, 300, 1),
			this.configFieldRow("customCommandCacheTtlSeconds", this.t("命令缓存 (s)", "Command cache (s)"), "number", () => this.config.customCommandCacheTtlSeconds, (value) => {
				this.config.customCommandCacheTtlSeconds = Number(value);
			}, undefined, 0, 60, 1, this.t("0 表示每次刷新都执行", "0 runs on every refresh")),
			this.configFieldRow("terminalWidthCacheTtlSeconds", this.t("终端宽度缓存 (s)", "Terminal width cache (s)"), "number", () => this.config.terminalWidthCacheTtlSeconds, (value) => {
				this.config.terminalWidthCacheTtlSeconds = Number(value);
			}, undefined, 0, 300, 1),
		];
	}

	private importRows(): Row[] {
		return [
			{
				id: "import-cancel",
				label: this.t("取消导入", "Cancel import"),
				description: this.t("默认选项", "Default"),
				activate: () => {
					this.pendingImport = undefined;
					this.importNotice = [];
					this.page = "main";
					this.rebuild();
				},
			},
			{
				id: "import-apply",
				label: this.t("确认导入", "Apply import"),
				description: this.pendingImport ? this.t("替换当前配置", "Replace current config") : this.t("没有待导入配置", "Nothing to import"),
				activate: () => {
					if (!this.pendingImport) return;
					const next = this.pendingImport;
					this.pendingImport = undefined;
					this.importNotice = [];
					this.page = "main";
					this.lineIndex = 0;
					this.itemId = undefined;
					this.commit(next);
					this.status = this.t("配置已导入", "Config imported");
				},
			},
		];
	}

	private resetRows(): Row[] {
		return [
			{
				id: "reset-cancel",
				label: this.t("取消", "Cancel"),
				description: this.t("默认选项", "Default"),
				activate: () => {
					this.page = "main";
					this.rebuild();
				},
			},
			{
				id: "reset-apply",
				label: this.t("恢复默认配置", "Reset to defaults"),
				description: this.t("会覆盖当前配置", "Overwrites current config"),
				activate: () => {
					this.page = "main";
					this.lineIndex = 0;
					this.itemId = undefined;
					this.commit(defaultConfig());
					this.status = this.t("已恢复默认配置", "Defaults restored");
				},
			},
		];
	}


	private colorRows(): Row[] {
		const target = this.colorTarget;
		const current = target?.current ?? "";
		const background = target?.background === true;
		const mark = (spec: string) => (current === spec ? "✓ " : "  ");
		this.colorChoices.clear();
		this.colorChoices.set("color:none", undefined);
		this.colorChoices.set("color:custom", CUSTOM_COLOR);
		const rows: Row[] = [
			{
				id: "color:none",
				label: mark("") + this.t("默认（不设置）", "Default (unset)"),
				description: this.t("跟随组件或主题默认颜色", "Widget or theme default"),
				activate: () => this.applyColor(undefined),
			},
		];
		for (const entry of COLOR_PALETTE) {
			this.colorChoices.set("color:named:" + entry.spec, entry.spec);
			const hex = hexOf(entry.spec);
			rows.push({
				id: "color:named:" + entry.spec,
				label:
					mark(entry.spec) +
					this.swatch(entry.spec, background) +
					" " +
					this.paintedName(entry.spec, localized(entry.label, this.config.language), background),
				description: hex ? `${hex} · ${this.t("亮色", "bright")}` : this.t("亮色", "bright"),
				activate: () => this.applyColor(entry.spec),
			});
		}
		for (const entry of background ? BACKGROUND_PALETTE : THEME_PALETTE) {
			this.colorChoices.set("color:theme:" + entry.spec, entry.spec);
			rows.push({
				id: "color:theme:" + entry.spec,
				label:
					mark(entry.spec) +
					this.swatch(entry.spec, background) +
					" " +
					this.paintedName(entry.spec, localized(entry.label, this.config.language), background),
				description: this.t("主题色", "theme"),
				activate: () => this.applyColor(entry.spec),
			});
		}
		const custom = current !== "" && !this.isPresetColor(current, background);
		rows.push({
			id: "color:custom",
			label: (custom ? "✓ " : "  ") + this.t("自定义颜色…", "Custom color…"),
			description: custom
				? current
				: this.t("输入 #rrggbb、rgb(r,g,b) 或 ansi:N", "#rrggbb, rgb(r,g,b) or ansi:N"),
			activate: () => {
				this.startInput({
					label: this.t("自定义颜色", "Custom color"),
					value: current,
					allowEmpty: true,
					validate: (value) =>
						value && !isValidColorSpec(value) ? this.t("颜色格式无效", "Invalid color") : undefined,
					preview: (value) =>
						value && isValidColorSpec(value) && target?.preview
							? target.preview(this.config, value)
							: this.config,
					onSubmit: (value) => this.applyColor(value || undefined),
				});
			},
		});
		return rows;
	}

	private previewConfig(): MeTuiConfig {
		if (this.page === "colorPicker") {
			const target = this.colorTarget;
			const key = this.select.getSelectedItem()?.value;
			if (target?.preview && key && this.colorChoices.has(key)) {
				const value = this.colorChoices.get(key);
				if (value === CUSTOM_COLOR) return this.config;
				return target.preview(this.config, value);
			}
			return this.config;
		}
		if (this.page === "valuePicker") {
			const target = this.valueTarget;
			const key = this.select.getSelectedItem()?.value;
			const value = key ? this.valueChoices.get(key) : undefined;
			if (target && value !== undefined) return target.preview(this.config, value);
		}
		return this.config;
	}

	private previewItemPatch(
		config: MeTuiConfig,
		item: WidgetItem,
		field: string,
		value: string | number | boolean | undefined,
	): MeTuiConfig {
		if (field.startsWith("metadata.")) {
			const key = field.slice("metadata.".length);
			const metadata = { ...(item.metadata ?? {}) };
			if (value === undefined || value === "") delete metadata[key];
			else metadata[key] = String(value);
			return updateItem(config, this.lineIndex, item.id, { metadata });
		}
		return updateItem(config, this.lineIndex, item.id, { [field]: value } as Partial<WidgetItem>);
	}

	private previewItemInput(
		item: WidgetItem,
		field: string,
		kind: FieldKind,
		value: string,
		min?: number,
		max?: number,
	): MeTuiConfig {
		if (kind === "number") {
			const numeric = Number(value);
			const clamped = Math.max(min ?? Number.NEGATIVE_INFINITY, Math.min(max ?? Number.POSITIVE_INFINITY, numeric));
			if (value.trim() === "" || !Number.isFinite(numeric) || clamped <= 0) {
				return this.previewItemPatch(this.config, item, field, undefined);
			}
			return this.previewItemPatch(this.config, item, field, Math.round(clamped));
		}
		return this.previewItemPatch(this.config, item, field, value || undefined);
	}

	private previewConfigValue(id: string, value: string | number | boolean | undefined): MeTuiConfig {
		const path = id === "padding" ? "defaultPaddingSide" : id;
		const next = deepClone(this.config);
		const parts = path.split(".");
		let cursor = next as unknown as Record<string, unknown>;
		for (let index = 0; index < parts.length - 1; index += 1) {
			const child = cursor[parts[index]];
			if (!child || typeof child !== "object") return this.config;
			cursor = child as Record<string, unknown>;
		}
		cursor[parts[parts.length - 1]] = value;
		return next;
	}

	private previewGlobalInput(
		id: string,
		kind: FieldKind,
		value: string,
		min?: number,
		max?: number,
	): MeTuiConfig | undefined {
		if (kind === "number") {
			const numeric = Number(value);
			if (value.trim() === "" || !Number.isFinite(numeric)) return undefined;
			const clamped = Math.max(
				min ?? Number.NEGATIVE_INFINITY,
				Math.min(max ?? Number.POSITIVE_INFINITY, numeric),
			);
			return this.previewConfigValue(id, Math.round(clamped));
		}
		if (id === "powerline.separators" || id === "powerline.startCaps" || id === "powerline.endCaps") {
			const list = value
				.split(",")
				.map((entry) => entry.trim())
				.filter(Boolean);
			if (id === "powerline.separators" && list.length === 0) return undefined;
			const next = deepClone(this.config);
			if (id === "powerline.separators") next.powerline.separators = list;
			else if (id === "powerline.startCaps") next.powerline.startCaps = list;
			else next.powerline.endCaps = list;
			return next;
		}
		return undefined;
	}

	private supportsInputPreview(field: string): boolean {
		return (
			field === "labelOverride" ||
			field === "maxWidth" ||
			field === "character" ||
			field === "customText" ||
			field === "customSymbol"
		);
	}

	private colorRowIdFor(spec: string, background: boolean): string {
		if (!spec) return "color:none";
		if (themeColorTokens(background).includes(spec)) return "color:theme:" + spec;
		if (NAMED_COLOR_SPECS.includes(spec)) return "color:named:" + spec;
		return "color:custom";
	}

	private openValuePicker(options: {
		label: string;
		current: string;
		values: EnumValue[];
		preview: (config: MeTuiConfig, value: string) => MeTuiConfig;
		apply: (value: string) => void;
	}): void {
		if (options.values.length === 0) return;
		this.valueTarget = options;
		this.valueReturnPage = this.page === "valuePicker" ? "options" : this.page;
		this.page = "valuePicker";
		this.rebuild();
		this.selectRowById("value:" + options.current);
	}

	private applyValue(value: string): void {
		const target = this.valueTarget;
		if (!target) return;
		this.page = this.valueReturnPage;
		this.valueTarget = undefined;
		target.apply(value);
		this.status = this.t("已更新", "Updated");
		this.rebuild();
	}

	private valueRows(): Row[] {
		const target = this.valueTarget;
		const current = target?.current ?? "";
		this.valueChoices.clear();
		const rows: Row[] = [];
		for (const entry of target?.values ?? []) {
			const id = "value:" + entry.value;
			this.valueChoices.set(id, entry.value);
			rows.push({
				id,
				label: (current === entry.value ? "✓ " : "  ") + localized(entry.label, this.config.language),
				description: entry.value,
				activate: () => this.applyValue(entry.value),
			});
		}
		return rows;
	}

	private swatch(spec: string, background: boolean): string {
		try {
			return background
				? paint("   ", { bg: spec, theme: this.theme, level: this.config.colorLevel })
				: paint("●", { fg: spec, theme: this.theme, level: this.config.colorLevel });
		} catch {
			return "●";
		}
	}

	/** Renders the color name in its own color, the way the palette preview reads best. */
	private paintedName(spec: string, name: string, background: boolean): string {
		try {
			return background
				? paint(` ${name} `, { bg: spec, theme: this.theme, level: this.config.colorLevel })
				: paint(name, { fg: spec, theme: this.theme, level: this.config.colorLevel });
		} catch {
			return name;
		}
	}

	private isPresetColor(spec: string, background: boolean): boolean {
		return themeColorTokens(background).includes(spec) || NAMED_COLOR_SPECS.includes(spec);
	}

	private openColorPicker(options: {
		label: string;
		current: string;
		background: boolean;
		apply: (value: string | undefined) => void;
		preview?: (config: MeTuiConfig, value: string | undefined) => MeTuiConfig;
	}): void {
		this.colorTarget = options;
		this.colorReturnPage = this.page === "colorPicker" ? "options" : this.page;
		this.page = "colorPicker";
		this.rebuild();
		this.selectRowById(this.colorRowIdFor(options.current, options.background));
	}

	private applyColor(value: string | undefined): void {
		const target = this.colorTarget;
		if (!target) return;
		const returnPage = this.colorReturnPage;
		const background = target.background;
		this.page = returnPage;
		this.colorTarget = undefined;
		target.apply(value);
		this.status = this.t("颜色已更新", "Color updated");
		this.rebuild();
		this.selectColorOrigin(returnPage, background);
	}

	/** Human name for a color spec: the palette label, else its hex. */
	private colorDisplayName(spec: string | undefined): string {
		if (!spec) return this.t("默认", "default");
		const entry = [...COLOR_PALETTE, ...THEME_PALETTE, ...BACKGROUND_PALETTE].find((item) => item.spec === spec);
		if (entry) return localized(entry.label, this.config.language);
		return hexOf(spec) ?? spec;
	}

	/** Renders a label in its own color, so the row shows the color instead of describing it. */
	private paintedSpec(spec: string | undefined, text: string): string {
		if (!spec) return text;
		try {
			return paint(text, { fg: spec, theme: this.theme, level: this.config.colorLevel });
		} catch {
			return text;
		}
	}

	/** Puts the highlight back on whatever opened the picker, so the next key keeps editing it. */
	private selectColorOrigin(page: Page, background: boolean): void {
		if (page === "items") this.selectRowById(this.itemId);
		else if (page === "options") this.selectRowById(`field:${background ? "backgroundColor" : "color"}`);
	}

	private itemFieldRow(
		item: WidgetItem,
		field: string,
		kind: FieldKind,
		label: string,
		values?: Array<string | EnumValue>,
		min?: number,
		max?: number,
		description?: string,
	): Row {
		const raw = this.getItemField(item, field);
		return {
			id: `field:${field}`,
			label,
			description: `${description ? `${description} · ` : ""}${this.displayValue(kind, raw, values)}`,
			activate: () => this.activateItemField(item, field, kind, label, values, min, max),
		};
	}

	private configFieldRow(
		id: string,
		label: string,
		kind: FieldKind,
		getValue: () => string | number | boolean | undefined,
		setValue: (value: string | number | boolean | undefined) => void,
		values?: Array<string | EnumValue>,
		min?: number,
		max?: number,
		step?: number,
		description?: string,
	): Row {
		const raw = getValue();
		return {
			id: `config:${id}`,
			label,
			description: `${description ? `${description} · ` : ""}${this.displayValue(kind, String(raw ?? ""), values)}`,
			activate: () => {
				if (kind === "boolean") {
					setValue(!parseBoolean(String(raw ?? "")));
					this.commit(this.config);
					return;
				}
				if (kind === "enum") {
					this.openValuePicker({
						label,
						current: String(raw ?? ""),
						values: normalizeEnumValues(values),
						preview: (config, value) => this.previewConfigValue(id, value),
						apply: (value) => {
							setValue(value);
							this.commit(this.config);
						},
					});
					return;
				}
				if (kind === "color") {
					this.openColorPicker({
						label,
						current: String(raw ?? ""),
						background: id === "overrides.bg",
						apply: (value) => {
							setValue(value);
							this.commit(this.config);
						},
						preview: (config, value) => this.previewConfigValue(id, value),
					});
					return;
				}
				this.startInput({
					label,
					value: String(raw ?? ""),
					allowEmpty: kind === "text",
					preview:
						id === "compactThreshold" ||
						id === "overrides.boldLift" ||
						id === "overrides.glowStrength" ||
						id.startsWith("powerline.")
							? (value) => this.previewGlobalInput(id, kind, value, min, max)
							: undefined,
					onSubmit: (value) => {
						if (kind === "number") {
							const parsed = Number(value);
							if (!Number.isFinite(parsed)) {
								this.status = this.t("请输入数字", "Enter a number");
								this.rebuild();
								return;
							}
							setValue(Math.max(min ?? Number.NEGATIVE_INFINITY, Math.min(max ?? Number.POSITIVE_INFINITY, parsed)));
						} else {
							setValue(value || undefined);
						}
						this.commit(this.config);
					},
				});
			},
		};
	}

	private displayValue(
		kind: FieldKind,
		raw: string,
		values?: Array<string | EnumValue>,
	): string {
		if (kind === "boolean") return parseBoolean(raw) ? this.t("开", "on") : this.t("关", "off");
		if (kind === "enum") {
			const entry = normalizeEnumValues(values).find((value) => value.value === raw);
			return entry ? localized(entry.label, this.config.language) : raw || "-";
		}
		if (kind === "number") return raw || "0";
		if (kind === "color") return raw || this.t("默认", "default");
		return raw || this.t("未设置", "unset");
	}

	private activateItemField(
		item: WidgetItem,
		field: string,
		kind: FieldKind,
		label: string,
		values?: Array<string | EnumValue>,
		min?: number,
		max?: number,
	): void {
		const raw = this.getItemField(item, field);
		if (kind === "boolean") {
			this.patchItemField(field, !parseBoolean(raw));
			return;
		}
		if (kind === "enum") {
			const valuesList = normalizeEnumValues(values);
			this.openValuePicker({
				label,
				current: raw,
				values: valuesList,
				preview: (config, value) => this.previewItemPatch(config, item, field, value),
				apply: (value) => this.patchItemField(field, value),
			});
			return;
		}
		if (kind === "color") {
			this.openColorPicker({
				label,
				current: raw,
				background: field === "backgroundColor",
				apply: (value) => this.patchItemField(field, value),
				preview: (config, value) => this.previewItemPatch(config, item, field, value),
			});
			return;
		}
		this.startInput({
			label,
			value: raw,
			allowEmpty: kind === "text",
			preview: this.supportsInputPreview(field)
				? (value) => this.previewItemInput(item, field, kind, value, min, max)
				: undefined,
			onSubmit: (value) => {
				if (kind === "number") {
					const parsed = Number(value);
					if (!Number.isFinite(parsed)) {
						this.status = this.t("请输入数字", "Enter a number");
						this.rebuild();
						return;
					}
					const clamped = Math.max(min ?? Number.NEGATIVE_INFINITY, Math.min(max ?? Number.POSITIVE_INFINITY, parsed));
					this.patchItemField(field, clamped);
					return;
				}
				this.patchItemField(field, value || undefined);
			},
		});
	}

	private getItemField(item: WidgetItem, field: string): string {
		if (field.startsWith("metadata.")) {
			const key = field.slice("metadata.".length);
			return item.metadata?.[key] ?? "";
		}
		const value = (item as unknown as Record<string, unknown>)[field];
		return value === undefined || value === null ? "" : String(value);
	}

	/** Jump straight from the highlighted widget into its color picker. */
	private openItemColor(field: "color" | "backgroundColor"): void {
		const item = this.currentItem();
		if (!item) return;
		this.itemId = item.id;
		this.openColorPicker({
			label: field === "color" ? this.t("前景色", "Foreground") : this.t("背景色", "Background"),
			current: (field === "color" ? item.color : item.backgroundColor) ?? "",
			background: field === "backgroundColor",
			preview: (config, value) => this.previewItemPatch(config, item, field, value),
			apply: (value) => this.patchItem({ [field]: value } as Partial<WidgetItem>),
		});
	}

	private patchItem(patch: Partial<WidgetItem>): void {
		const item = this.currentItem();
		if (!item) return;
		this.commit(updateItem(this.config, this.lineIndex, item.id, patch));
	}

	private patchItemField(field: string, value: string | number | boolean | undefined): void {
		const item = this.currentItem();
		if (!item) return;
		if (field === "maxWidth") {
			const numeric = typeof value === "number" ? value : Number(value);
			if (value === undefined || value === "" || !Number.isFinite(numeric) || numeric <= 0) {
				this.patchItem({ maxWidth: undefined });
				return;
			}
		}
		if (field.startsWith("metadata.")) {
			const key = field.slice("metadata.".length);
			const metadata = { ...(item.metadata ?? {}) };
			if (value === undefined || value === "") delete metadata[key];
			else metadata[key] = String(value);
			this.patchItem({ metadata });
			return;
		}
		this.patchItem({ [field]: value } as Partial<WidgetItem>);
	}

	private currentLine(): WidgetItem[] {
		return this.config.lines[this.lineIndex] ?? [];
	}

	private currentItem(): WidgetItem | undefined {
		const line = this.currentLine();
		if (this.page === "items") {
			const highlighted = this.select.getSelectedItem()?.value;
			const match = line.find((item) => item.id === highlighted);
			if (match) return match;
		}
		if (!this.itemId) return undefined;
		return line.find((item) => item.id === this.itemId);
	}

	private selectRowById(id: string | undefined): void {
		if (!id) return;
		const index = this.rows.findIndex((row) => row.id === id);
		if (index >= 0) this.select.setSelectedIndex(index);
	}

	private commit(next: MeTuiConfig): void {
		this.config = next;
		this.onChange(next);
		this.rebuild();
	}

	private deleteCurrentItem(): void {
		const item = this.currentItem();
		if (!item) return;
		const index = this.currentLine().findIndex((entry) => entry.id === item.id);
		const remaining = this.currentLine().filter((entry) => entry.id !== item.id);
		this.itemId = remaining[Math.min(index, remaining.length - 1)]?.id;
		this.status = this.t("组件已删除", "Widget removed");
		this.commit(removeItem(this.config, this.lineIndex, item.id));
		this.selectRowById(this.itemId);
	}


	private duplicateCurrentItem(): void {
		const item = this.currentItem();
		if (!item) return;
		const copy: WidgetItem = { ...deepClone(item), id: createWidgetId(item.type) };
		this.itemId = copy.id;
		this.status = this.t("组件已复制", "Widget duplicated");
		this.commit(addItem(this.config, this.lineIndex, copy, item.id));
		this.selectRowById(copy.id);
	}

	private removeCurrentLine(): void {
		if (this.config.lines.length <= 1) return;
		const index = this.lineIndex;
		this.lineIndex = Math.max(0, index - 1);
		this.itemId = undefined;
		this.status = this.t("行已删除", "Line removed");
		this.commit(removeLine(this.config, index));
	}

	private moveCurrent(delta: number): void {
		const item = this.currentItem();
		if (!item) return;
		const line = this.currentLine();
		const from = line.findIndex((entry) => entry.id === item.id);
		const to = from + delta;
		if (from < 0 || to < 0 || to >= line.length) return;
		this.config = moveItem(this.config, this.lineIndex, from, to);
		this.onChange(this.config);
		this.rebuild();
	}

	private editLabel(): void {
		const item = this.currentItem();
		const definition = item ? getWidget(item.type) : undefined;
		if (!item) return;
		if (!definition?.supportsLabel) {
			this.status = this.t("该组件不支持文字前缀", "This widget has no label prefix");
			this.rebuild();
			return;
		}
		const fallback = definition.defaultLabel?.[this.config.language] ?? "";
		this.startInput({
			label: this.t("文字前缀（留空隐藏）", "Label prefix (empty hides)"),
			value: item.labelOverride ?? "",
			placeholder: fallback,
			allowEmpty: true,
			tabDefault: () => fallback,
			preview: (value) => this.previewItemPatch(this.config, item, "labelOverride", value || undefined),
			onSubmit: (value) => {
				this.patchItem({ labelOverride: value || undefined });
			},
		});
	}

	private startSearch(): void {
		this.startInput({
			label: this.t("搜索组件", "Search widgets"),
			value: this.search,
			allowEmpty: true,
			onSubmit: (value) => {
				this.search = value;
				this.rebuild();
			},
		});
	}

	private startInput(state: InputState): void {
		const input = new Input({ prompt: "> ", placeholder: state.placeholder });
		input.setValue(state.value);
		input.handleInput("\x05");
		input.focused = true;
		input.onSubmit = (value) => this.submitInput(value);
		input.onEscape = () => this.cancelInput();
		this.input = input;
		this.inputState = state;
		this.onRequestRender();
	}

	private submitInput(value: string): void {
		const state = this.inputState;
		this.input = undefined;
		this.inputState = undefined;
		if (!state) return;
		const trimmed = value.trim();
		if (!state.allowEmpty && !trimmed) {
			this.status = this.t("不能为空", "Cannot be empty");
			this.rebuild();
			return;
		}
		const error = state.validate?.(trimmed);
		if (error) {
			this.status = error;
			this.rebuild();
			return;
		}
		state.onSubmit(trimmed);
		this.onRequestRender();
	}

	private cancelInput(): void {
		this.input = undefined;
		this.inputState = undefined;
		this.rebuild();
	}

	private back(): void {
		this.status = undefined;
		if (this.page === "main") {
			this.done();
			return;
		}
		if (this.page === "importConfirm" || this.page === "resetConfirm") {
			this.pendingImport = undefined;
			this.importNotice = [];
		}
		const colorOrigin = this.page === "colorPicker" ? this.colorTarget?.background : undefined;
		if (this.page === "colorPicker") this.colorTarget = undefined;
		const target = this.parentPage(this.page);
		if (target !== "items" && target !== "addWidget") this.search = "";
		if (target === "items") {
			this.replaceMode = false;
			this.replaceItemId = undefined;
		}
		this.page = target;
		this.rebuild();
		if (target === "items") this.selectRowById(this.itemId);
		else if (target === "addWidget" && this.addWidgetType) this.selectRowById(this.addWidgetType);
		else if (colorOrigin !== undefined) this.selectColorOrigin(target, colorOrigin);
	}

	private parentPage(page: Page): Page {
		if (page === "colorPicker") return this.colorReturnPage;
		if (page === "items") return "main";
		if (page === "addCategory") return "items";
		if (page === "addWidget") return "addCategory";
		if (page === "options") return this.optionsReturnPage;
		return "main";
	}

	private exportConfig(): void {
		const defaultPath = join(homedir(), "me-tui.config.json");
		this.startInput({
			label: this.t("导出到文件", "Export to file"),
			value: defaultPath,
			allowEmpty: false,
			onSubmit: (value) => {
				try {
					const target = this.expandPath(value);
					mkdirSync(dirname(target), { recursive: true });
					writeFileSync(target, JSON.stringify(this.config, null, 2) + "\n", "utf8");
					this.status = `${this.t("已导出", "Exported")}: ${target}`;
				} catch (error) {
					this.status = `${this.t("导出失败", "Export failed")}: ${error instanceof Error ? error.message : String(error)}`;
				}
				this.rebuild();
			},
		});
	}

	private importConfig(): void {
		const defaultPath = join(homedir(), "me-tui.config.json");
		this.startInput({
			label: this.t("从文件导入", "Import from file"),
			value: defaultPath,
			allowEmpty: false,
			onSubmit: (value) => {
				try {
					const target = this.expandPath(value);
					const parsed = JSON.parse(readFileSync(target, "utf8")) as unknown;
					const next = normalizeConfig(parsed);
					this.pendingImport = next;
					this.importNotice = this.describeImport(next);
					this.page = "importConfirm";
					this.rebuild();
				} catch (error) {
					this.status = `${this.t("导入失败", "Import failed")}: ${error instanceof Error ? error.message : String(error)}`;
					this.rebuild();
				}
			},
		});
	}

	private describeImport(next: MeTuiConfig): string[] {
		const currentTypes = new Map<string, number>();
		for (const item of allItems(this.config)) currentTypes.set(item.type, (currentTypes.get(item.type) ?? 0) + 1);
		const nextTypes = new Map<string, number>();
		for (const item of allItems(next)) nextTypes.set(item.type, (nextTypes.get(item.type) ?? 0) + 1);
		const added: string[] = [];
		const removed: string[] = [];
		for (const [type, count] of nextTypes) {
			const previous = currentTypes.get(type) ?? 0;
			if (count > previous) added.push(`${type} ×${count - previous}`);
		}
		for (const [type, count] of currentTypes) {
			const following = nextTypes.get(type) ?? 0;
			if (count > following) removed.push(`${type} ×${count - following}`);
		}
		const currentCommands = new Set(
			allItems(this.config)
				.filter((item) => item.type === "custom-command" && item.command)
				.map((item) => item.command ?? ""),
		);
		const newCommands = allItems(next)
			.filter((item) => item.type === "custom-command" && item.command && !currentCommands.has(item.command))
			.map((item) => item.command ?? "");
		const lines = [
			`${this.t("行", "Lines")}: ${lineCount(this.config)} → ${lineCount(next)}`,
			`${this.t("组件", "Widgets")}: ${itemCount(this.config)} → ${itemCount(next)}`,
			`${this.t("新增组件", "Added")}: ${added.length > 0 ? added.join(", ") : "-"}`,
			`${this.t("移除组件", "Removed")}: ${removed.length > 0 ? removed.join(", ") : "-"}`,
		];
		if (newCommands.length > 0) {
			lines.push("");
			lines.push(this.theme.fg("warning", this.t("新增 Shell 命令（会执行）:", "New shell commands (will run):")));
			for (const command of newCommands) lines.push(`  ${command}`);
		}
		lines.push("");
		lines.push(this.t("默认选择取消。按 Enter 在下方选择。", "Cancel is selected by default. Press Enter to choose."));
		return lines;
	}

	private expandPath(value: string): string {
		const trimmed = value.trim();
		if (trimmed === "~") return homedir();
		if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) return join(homedir(), trimmed.slice(2));
		return trimmed;
	}
}
