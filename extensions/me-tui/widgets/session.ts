import type { WidgetDefinition } from "../types.ts";
import { formatClockDuration, metadataNumber } from "../utils.ts";
import { formatSkillInvocation, latestSkill, recentSkills } from "../state.ts";
import { iconText, nonEmpty } from "./shared.ts";

export const sessionWidgets: WidgetDefinition[] = [
	{
		type: "session-clock",
		category: "session",
		name: { zh: "会话时钟", en: "Session clock" },
		description: { zh: "当前会话持续时间", en: "Current session duration" },
		defaultColor: "warning",
		defaultLabel: { zh: "时钟: ", en: "clock: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => iconText(rc.icons.clock, formatClockDuration(rc.now - rc.state.sessionStart)),
	},
	{
		type: "session-name",
		category: "session",
		name: { zh: "会话名称", en: "Session name" },
		description: { zh: "当前会话名称", en: "Current session name" },
		defaultColor: "cyan",
		defaultLabel: { zh: "会话: ", en: "session: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => {
			const name = rc.ctx.sessionManager.getSessionName() ?? rc.pi.getSessionName();
			return iconText(rc.icons.session, nonEmpty(name));
		},
	},
	{
		type: "skills",
		category: "session",
		name: { zh: "技能", en: "Skills" },
		description: { zh: "最近一次 skill / MCP / 扩展工具调用", en: "Latest skill / MCP / extension tool invocation" },
		defaultColor: "magenta",
		defaultLabel: { zh: "技能: ", en: "skill: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		defaultItem: { hideEmpty: true },
		options: [
			{
				key: "mode",
				kind: "enum",
				label: { zh: "显示模式", en: "Mode" },
				field: "metadata.mode",
				values: [
					{ value: "last", label: { zh: "最近一次", en: "Last" } },
					{ value: "list", label: { zh: "最近列表", en: "Recent list" } },
					{ value: "count", label: { zh: "调用次数", en: "Count" } },
				],
			},
			{
				key: "max",
				kind: "number",
				label: { zh: "列表数量", en: "List size" },
				field: "metadata.max",
				min: 1,
				max: 6,
				step: 1,
			},
		],
		render: (item, rc) => {
			const mode = item.metadata?.mode ?? "last";
			if (mode === "count") {
				const count = rc.state.skillTotal;
				if (count === 0 && item.hideEmpty !== false) return null;
				return iconText(rc.icons.skills, String(count));
			}
			if (mode === "list") {
				const limit = Math.max(1, metadataNumber(item, "max", 3));
				const entries = recentSkills(rc.state, limit);
				if (entries.length === 0) return null;
				return iconText(rc.icons.skills, entries.map(formatSkillInvocation).join(", "));
			}
			const last = latestSkill(rc.state);
			return last ? iconText(rc.icons.skills, formatSkillInvocation(last)) : null;
		},
	},
	{
		type: "conversation-rounds",
		category: "session",
		name: { zh: "对话轮数", en: "Conversation rounds" },
		description: { zh: "已完成回复的对话轮数（用户消息 → 回复）", en: "Completed conversation rounds (user message to reply)" },
		defaultColor: "cyan",
		defaultLabel: { zh: "对话: ", en: "rounds: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => iconText(rc.icons.rounds, String(rc.state.usage.stats.rounds)),
	},
	{
		type: "model-calls",
		category: "session",
		name: { zh: "模型调用次数", en: "Model calls" },
		description: { zh: "本会话调用模型的次数（每条助手回复计一次）", en: "Model calls this session (one per assistant reply)" },
		defaultColor: "blue",
		defaultLabel: { zh: "调用: ", en: "calls: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => iconText(rc.icons.calls, String(rc.state.usage.stats.modelCalls)),
	},
	{
		type: "round-duration",
		category: "session",
		name: { zh: "本轮会话时长", en: "Current round time" },
		description: { zh: "从发送消息到本轮回复结束的时长", en: "Time from sending a message to the end of the current round" },
		defaultColor: "success",
		defaultLabel: { zh: "本轮: ", en: "round: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => iconText(rc.icons.roundDuration, formatClockDuration(rc.state.usage.stats.currentRoundMs)),
	},
	{
		type: "total-round-duration",
		category: "session",
		name: { zh: "总会话时长", en: "Total round time" },
		description: { zh: "所有对话轮时长之和", en: "Sum of all conversation round durations" },
		defaultColor: "warning",
		defaultLabel: { zh: "总时长: ", en: "total: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => iconText(rc.icons.totalDuration, formatClockDuration(rc.state.usage.stats.totalRoundMs)),
	},
];
