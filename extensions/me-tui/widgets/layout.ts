import type { WidgetDefinition } from "../types.ts";
import { takeGrapheme } from "../utils.ts";

export const layoutWidgets: WidgetDefinition[] = [
	{
		type: "separator",
		category: "layout",
		name: { zh: "分隔符", en: "Separator" },
		description: { zh: "组件之间的固定分隔符", en: "Fixed separator between components" },
		defaultColor: "dim",
		supportsLabel: false,
		supportsRawValue: true,
		priority: 1,
		defaultItem: { character: "|" },
		options: [
			{
				key: "character",
				kind: "text",
				label: { zh: "字符", en: "Character" },
				field: "character",
				placeholder: { zh: "例如 |", en: "e.g. |" },
			},
		],
		render: (item) => takeGrapheme(item.character || "|") || "|",
	},
	{
		type: "flex",
		category: "layout",
		name: { zh: "弹性分隔符", en: "Flex separator" },
		description: { zh: "自动填充剩余空间", en: "Fill the remaining horizontal space" },
		defaultColor: "dim",
		supportsLabel: false,
		supportsRawValue: true,
		priority: 0,
		render: () => "",
	},
];
