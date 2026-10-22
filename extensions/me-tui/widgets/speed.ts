import type { UsageBucket, WidgetDefinition, WidgetRenderContext } from "../types.ts";
import { formatSpeed } from "../utils.ts";
import { speedOf } from "../usage.ts";
import { iconText, usageBucket } from "./shared.ts";

function currentBucket(rc: WidgetRenderContext): UsageBucket {
	return usageBucket(rc, rc.config.currentScope === "turn" ? "turn" : "current");
}

function speedText(bucket: UsageBucket, kind: "input" | "output" | "total", hideEmpty: boolean | undefined): string | null {
	const speed = speedOf(bucket, kind);
	if (speed <= 0) return hideEmpty === false ? "-" : null;
	return formatSpeed(speed);
}

export const speedWidgets: WidgetDefinition[] = [
	{
		type: "speed-input",
		category: "speed",
		name: { zh: "本次输入速度", en: "Current input speed" },
		description: { zh: "本次输入 Token 速度（提示词 Token ÷ TTFT，恢复会话后按总耗时）", en: "Current prompt token speed (prompt tokens ÷ TTFT; total duration after resume)" },
		defaultColor: "cyan",
		defaultLabel: { zh: "输入速度: ", en: "in speed: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => iconText(rc.icons.speedInput, speedText(currentBucket(rc), "input", item.hideEmpty)),
	},
	{
		type: "speed-output",
		category: "speed",
		name: { zh: "本次输出速度", en: "Current output speed" },
		description: { zh: "本次输出 Token 速度（输出 Token ÷ 解码耗时，恢复会话后按总耗时）", en: "Current output token speed (output tokens ÷ decode time; total duration after resume)" },
		defaultColor: "cyan",
		defaultLabel: { zh: "输出速度: ", en: "out speed: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => iconText(rc.icons.speedOutput, speedText(currentBucket(rc), "output", item.hideEmpty)),
	},
	{
		type: "speed-total",
		category: "speed",
		name: { zh: "本次速度", en: "Current speed" },
		description: { zh: "本次总 Token 速度（总 Token ÷ 总耗时）", en: "Current total token speed (all tokens ÷ total duration)" },
		defaultColor: "cyan",
		defaultLabel: { zh: "速度: ", en: "speed: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => iconText(rc.icons.speedTotal, speedText(currentBucket(rc), "total", item.hideEmpty)),
	},
	{
		type: "speed-total-input",
		category: "speed",
		name: { zh: "合计输入速度", en: "Session input speed" },
		description: { zh: "合计输入 Token 速度（提示词 Token ÷ TTFT，恢复会话后按总耗时）", en: "Session prompt token speed (prompt tokens ÷ TTFT; total duration after resume)" },
		defaultColor: "cyan",
		defaultLabel: { zh: "输入速度: ", en: "in speed: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => iconText(rc.icons.speedInput, speedText(usageBucket(rc, "total"), "input", item.hideEmpty)),
	},
	{
		type: "speed-total-output",
		category: "speed",
		name: { zh: "合计输出速度", en: "Session output speed" },
		description: { zh: "合计输出 Token 速度（输出 Token ÷ 解码耗时，恢复会话后按总耗时）", en: "Session output token speed (output tokens ÷ decode time; total duration after resume)" },
		defaultColor: "cyan",
		defaultLabel: { zh: "输出速度: ", en: "out speed: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => iconText(rc.icons.speedOutput, speedText(usageBucket(rc, "total"), "output", item.hideEmpty)),
	},
	{
		type: "speed-total-all",
		category: "speed",
		name: { zh: "合计总速度", en: "Session total speed" },
		description: { zh: "合计总 Token 速度（总 Token ÷ 总耗时）", en: "Session total token speed (all tokens ÷ total duration)" },
		defaultColor: "cyan",
		defaultLabel: { zh: "总速度: ", en: "total speed: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => iconText(rc.icons.speedTotal, speedText(usageBucket(rc, "total"), "total", item.hideEmpty)),
	},
];
