import { freemem, totalmem } from "node:os";
import type { WidgetDefinition } from "../types.ts";
import { formatBytes, formatCwd, formatPercent, metadataBoolean, metadataNumber } from "../utils.ts";
import { iconText } from "./shared.ts";

export const envWidgets: WidgetDefinition[] = [
	{
		type: "cwd",
		category: "env",
		name: { zh: "当前目录", en: "Current directory" },
		description: { zh: "当前工作目录，支持 ~、fish 缩写和路径段数", en: "Current working directory with ~, fish-style and segment options" },
		defaultColor: "accent",
		defaultLabel: { zh: "目录: ", en: "cwd: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 3,
		options: [
			{
				key: "home",
				kind: "boolean",
				label: { zh: "~ 缩写", en: "~ abbreviation" },
				description: { zh: "把 home 目录缩写为 ~", en: "Abbreviate the home directory as ~" },
				field: "metadata.home",
			},
			{
				key: "segments",
				kind: "number",
				label: { zh: "保留段数", en: "Keep segments" },
				description: { zh: "0 表示保留完整路径", en: "0 keeps the full path" },
				field: "metadata.segments",
				min: 0,
				max: 8,
				step: 1,
			},
			{
				key: "fish",
				kind: "boolean",
				label: { zh: "fish 风格", en: "Fish style" },
				description: { zh: "中间路径段缩写为首字母", en: "Abbreviate middle segments to their first letter" },
				field: "metadata.fish",
			},
		],
		render: (item, rc) => {
			const segments = Math.max(0, metadataNumber(item, "segments", 0));
			return iconText(
				rc.icons.cwd,
				formatCwd(rc.ctx.cwd, {
					home: metadataBoolean(item, "home", true),
					segments: Math.round(segments),
					fish: metadataBoolean(item, "fish", false),
				}),
			);
		},
	},
	{
		type: "terminal-width",
		category: "env",
		name: { zh: "终端宽度", en: "Terminal width" },
		description: { zh: "终端列数", en: "Terminal columns" },
		defaultColor: "brightBlack",
		defaultLabel: { zh: "终端: ", en: "term: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 2,
		render: (_item, rc) => {
			const width = rc.state.terminalWidth || process.stdout.columns || rc.width || 0;
			return width > 0 ? iconText(rc.icons.terminal, String(width)) : null;
		},
	},
	{
		type: "memory",
		category: "env",
		name: { zh: "内存用量", en: "Memory usage" },
		description: { zh: "系统内存使用情况", en: "System memory usage" },
		defaultColor: "cyan",
		defaultLabel: { zh: "内存: ", en: "mem: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 2,
		options: [
			{
				key: "showPercent",
				kind: "boolean",
				label: { zh: "显示百分比", en: "Show percentage" },
				field: "metadata.showPercent",
			},
		],
		render: (item, rc) => {
			const total = totalmem();
			const free = freemem();
			if (total <= 0) return null;
			const used = Math.max(0, total - free);
			const base = `${formatBytes(used)}/${formatBytes(total)}`;
			if (metadataBoolean(item, "showPercent", true)) {
				return iconText(rc.icons.memory, `${base} ${formatPercent((used / total) * 100, 0)}`);
			}
			return iconText(rc.icons.memory, base);
		},
	},
];
