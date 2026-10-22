import type { WidgetDefinition } from "../types.ts";
import { formatProviderLabel, formatThinkingLabel, metadataBoolean } from "../utils.ts";
import { iconText, nonEmpty } from "./shared.ts";

function currentThinking(rc: Parameters<WidgetDefinition["render"]>[1]): string {
	return rc.ctx.thinkingLevel ?? rc.pi.getThinkingLevel();
}

export const coreWidgets: WidgetDefinition[] = [
	{
		type: "provider",
		category: "core",
		name: { zh: "供应商", en: "Provider" },
		description: { zh: "当前模型供应商", en: "Current model provider" },
		defaultColor: "accent",
		defaultLabel: { zh: "供应商: ", en: "provider: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 10,
		render: (_item, rc) => (rc.ctx.model?.provider ? iconText(rc.icons.provider, formatProviderLabel(rc.ctx.model.provider)) : null),
	},
	{
		type: "model",
		category: "core",
		name: { zh: "模型", en: "Model" },
		description: { zh: "当前模型名称", en: "Current model name" },
		defaultColor: "mdHeading",
		defaultLabel: { zh: "模型: ", en: "model: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 10,
		render: (_item, rc) => iconText(rc.icons.model, nonEmpty(rc.ctx.model?.name ?? rc.ctx.model?.id)),
	},
	{
		type: "thinking",
		category: "core",
		name: { zh: "思考力度", en: "Thinking effort" },
		description: { zh: "当前思考力度等级", en: "Current thinking effort level" },
		defaultColor: "thinkingMedium",
		defaultLabel: { zh: "思考: ", en: "thinking: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 10,
		options: [
			{
				key: "hideOff",
				kind: "boolean",
				label: { zh: "隐藏 off", en: "Hide off" },
				description: { zh: "思考关闭时不显示", en: "Hide when thinking is off" },
				field: "metadata.hideOff",
			},
		],
		render: (item, rc) => {
			if (!rc.ctx.model?.reasoning) return null;
			const level = currentThinking(rc);
			if (level === "off" && metadataBoolean(item, "hideOff", false)) return null;
			return iconText(rc.icons.thinking, formatThinkingLabel(level, rc.language));
		},
	},
];
