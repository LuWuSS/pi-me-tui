import type { WidgetDefinition } from "../types.ts";
import { osc8Link, takeGrapheme } from "../utils.ts";
import { iconText, nonEmpty } from "./shared.ts";

function isValidUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "file:";
	} catch {
		return false;
	}
}

export const customWidgets: WidgetDefinition[] = [
	{
		type: "custom-text",
		category: "custom",
		name: { zh: "自定义文本", en: "Custom text" },
		description: { zh: "显示用户自定义文本", en: "Display a custom text" },
		defaultColor: "text",
		supportsLabel: false,
		supportsRawValue: true,
		priority: 2,
		options: [
			{
				key: "customText",
				kind: "text",
				label: { zh: "文本", en: "Text" },
				field: "customText",
				placeholder: { zh: "输入要显示的文字", en: "Text to display" },
			},
		],
		render: (item) => nonEmpty(item.customText),
	},
	{
		type: "custom-command",
		category: "custom",
		name: { zh: "自定义命令", en: "Custom command" },
		description: { zh: "执行 Shell 命令并显示输出", en: "Run a shell command and display its output" },
		defaultColor: "text",
		supportsLabel: false,
		supportsRawValue: true,
		priority: 2,
		defaultItem: { timeoutMs: 1000, preserveColors: false },
		options: [
			{
				key: "command",
				kind: "text",
				label: { zh: "命令", en: "Command" },
				description: { zh: "命令在会话工作目录中执行", en: "Runs in the session working directory" },
				field: "command",
			},
			{
				key: "timeoutMs",
				kind: "number",
				label: { zh: "超时 (ms)", en: "Timeout (ms)" },
				field: "timeoutMs",
				min: 100,
				max: 60000,
				step: 100,
			},
			{
				key: "preserveColors",
				kind: "boolean",
				label: { zh: "保留颜色", en: "Preserve colors" },
				field: "preserveColors",
			},
		],
		render: (item, rc) => {
			const value = rc.state.customCommands.get(item.id);
			if (!value || !value.text) return null;
			return iconText(rc.icons.command, value.text);
		},
	},
	{
		type: "custom-symbol",
		category: "custom",
		name: { zh: "自定义符号", en: "Custom symbol" },
		description: { zh: "显示自定义单字符符号或 Emoji", en: "Display a custom symbol or emoji" },
		defaultColor: "text",
		supportsLabel: false,
		supportsRawValue: true,
		priority: 2,
		options: [
			{
				key: "customSymbol",
				kind: "text",
				label: { zh: "符号", en: "Symbol" },
				field: "customSymbol",
			},
		],
		render: (item) => {
			const symbol = takeGrapheme(item.customSymbol ?? "");
			return symbol ? symbol : null;
		},
	},
	{
		type: "link",
		category: "custom",
		name: { zh: "链接", en: "Link" },
		description: { zh: "显示可点击的终端超链接", en: "Display a clickable terminal hyperlink" },
		defaultColor: "cyan",
		supportsLabel: false,
		supportsRawValue: true,
		priority: 2,
		options: [
			{
				key: "url",
				kind: "text",
				label: { zh: "URL", en: "URL" },
				field: "metadata.url",
				placeholder: { zh: "https://…", en: "https://…" },
			},
			{
				key: "text",
				kind: "text",
				label: { zh: "显示文字", en: "Label" },
				field: "metadata.text",
			},
		],
		render: (item, rc) => {
			const url = item.metadata?.url?.trim();
			if (!url || !isValidUrl(url)) return null;
			const text = item.metadata?.text?.trim() || url;
			return osc8Link(iconText(rc.icons.link, text) ?? text, url);
		},
	},
];
