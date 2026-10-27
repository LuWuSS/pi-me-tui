import type { WidgetDefinition, WidgetItem, WidgetRenderContext } from "../types.ts";
import { formatContextWindow, formatPercent, formatTokens, metadataBoolean, metadataNumber } from "../utils.ts";
import { contextPercent, contextTokens, contextUsage, iconText, itemNumberFormat } from "./shared.ts";

function barText(item: WidgetItem, rc: WidgetRenderContext): string | null {
	const usage = contextUsage(rc);
	if (!usage) return null;
	const percent = contextPercent(usage);
	if (percent === undefined) return null;
	const mode = item.metadata?.mode ?? "progress-short";
	const width = Math.max(4, Math.min(40, metadataNumber(item, "width", mode === "progress" ? 12 : 8)));
	const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width);
	const clamped = Math.min(width, Math.max(0, filled));
	if (mode === "slider" || mode === "slider-only") {
		const bar = "▰".repeat(clamped) + "▱".repeat(width - clamped);
		if (mode === "slider-only") return bar;
		return `${bar} ${formatPercent(percent)}`;
	}
	const bar = "█".repeat(clamped) + "░".repeat(width - clamped);
	if (mode === "progress") {
		const tokens = contextTokens(usage);
		const used = tokens === undefined ? "?" : formatTokens(tokens, itemNumberFormat(item));
		const total = formatTokens(usage.contextWindow, itemNumberFormat(item));
		return `[${bar}] ${formatPercent(percent)} ${used}/${total}`;
	}
	if (metadataBoolean(item, "showTokens", false)) {
		const tokens = contextTokens(usage);
		if (tokens !== undefined) return `[${bar}] ${formatPercent(percent)} ${formatTokens(tokens, itemNumberFormat(item))}`;
	}
	return `[${bar}] ${formatPercent(percent)}`;
}

export const contextWidgets: WidgetDefinition[] = [
	{
		type: "context-length",
		category: "context",
		name: { zh: "上下文长度", en: "Context length" },
		description: { zh: "当前上下文 Token 数", en: "Current context token count" },
		defaultColor: "brightBlack",
		defaultLabel: { zh: "上下文: ", en: "context: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		render: (item, rc) => {
			const usage = contextUsage(rc);
			if (!usage) return null;
			const tokens = contextTokens(usage);
			return tokens === undefined ? null : iconText(rc.icons.context, formatTokens(tokens, itemNumberFormat(item)));
		},
	},
	{
		type: "context-percent",
		category: "context",
		name: { zh: "上下文 %", en: "Context %" },
		description: { zh: "上下文使用百分比", en: "Context usage percentage" },
		defaultColor: "blue",
		defaultLabel: { zh: "占用: ", en: "used: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		render: (_item, rc) => {
			const usage = contextUsage(rc);
			if (!usage) return null;
			const percent = contextPercent(usage);
			return percent === undefined ? null : iconText(rc.icons.context, formatPercent(percent));
		},
	},
	{
		type: "context-percent-usable",
		category: "context",
		name: { zh: "上下文 %（可用）", en: "Context % usable" },
		description: { zh: "以可用窗口为分母的剩余百分比", en: "Remaining percentage of the usable window" },
		defaultColor: "success",
		defaultLabel: { zh: "可用: ", en: "free: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		options: [
			{
				key: "usableRatio",
				kind: "number",
				label: { zh: "可用窗口比例", en: "Usable window ratio" },
				description: { zh: "默认 0.8，即 80% 上下文视为可用", en: "Default 0.8 (80% of the window is usable)" },
				field: "metadata.usableRatio",
				min: 10,
				max: 100,
				step: 5,
			},
		],
		render: (item, rc) => {
			const usage = contextUsage(rc);
			if (!usage) return null;
			const tokens = contextTokens(usage);
			if (tokens === undefined) return null;
			const ratio = Math.max(0.1, Math.min(1, metadataNumber(item, "usableRatio", 80) / 100));
			const usable = usage.contextWindow * ratio;
			if (usable <= 0) return null;
			const remaining = Math.max(0, 100 - (tokens / usable) * 100);
			return iconText(rc.icons.context, formatPercent(remaining));
		},
	},
	{
		type: "context-bar",
		category: "context",
		name: { zh: "上下文进度条", en: "Context bar" },
		description: { zh: "以进度条显示上下文用量", en: "Context usage as a progress bar" },
		defaultColor: "blue",
		defaultLabel: { zh: "上下文: ", en: "context: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		options: [
			{
				key: "mode",
				kind: "enum",
				label: { zh: "样式", en: "Style" },
				field: "metadata.mode",
				values: [
					{ value: "progress", label: { zh: "进度 + 数值", en: "Progress + values" } },
					{ value: "progress-short", label: { zh: "短进度", en: "Short progress" } },
					{ value: "slider", label: { zh: "滑块 + 百分比", en: "Slider + percent" } },
					{ value: "slider-only", label: { zh: "仅滑块", en: "Slider only" } },
				],
			},
			{
				key: "width",
				kind: "number",
				label: { zh: "进度条宽度", en: "Bar width" },
				field: "metadata.width",
				min: 4,
				max: 40,
				step: 1,
			},
			{
				key: "showTokens",
				kind: "boolean",
				label: { zh: "短进度显示 Token", en: "Show tokens on short bar" },
				field: "metadata.showTokens",
			},
		],
		render: (item, rc) => barText(item, rc),
	},
	{
		type: "context-window",
		category: "context",
		name: { zh: "上下文上限", en: "Context window" },
		description: {
			zh: "模型支持的上下文长度，约整为 [200K] / [1M]",
			en: "Model context window, rounded to [200K] / [1M]",
		},
		defaultColor: "mdLink",
		defaultLabel: { zh: "上限: ", en: "window: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		render: (_item, rc) => {
			const usage = contextUsage(rc);
			if (!usage) return null;
			return formatContextWindow(usage.contextWindow);
		},
	},
	{
		type: "compaction-count",
		category: "context",
		name: { zh: "压缩计数", en: "Compactions" },
		description: { zh: "本会话已压缩次数", en: "Number of compactions this session" },
		defaultColor: "warning",
		defaultLabel: { zh: "压缩: ", en: "compacted: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => iconText(rc.icons.compaction, String(rc.state.compactions)),
	},
];
