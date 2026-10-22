import { emptyGitInfo } from "./git.ts";
import type { MeTuiState, SkillInvocation, UsageSnapshot } from "./types.ts";
import { emptySessionStats, emptyUsageBucket } from "./usage.ts";

const MAX_SKILL_HISTORY = 12;

const BUILTIN_TOOLS = new Set([
	"read",
	"write",
	"edit",
	"bash",
	"grep",
	"glob",
	"ls",
	"find",
	"todo",
	"task",
	"web_search",
	"web_fetch",
	"fetch",
	"mcp",
]);

export function createInitialState(sessionStart = Date.now()): MeTuiState {
	return {
		git: emptyGitInfo(),
		usage: emptyUsageSnapshot(),
		sessionStart,
		terminalWidth: process.stdout.columns ?? 120,
		terminalWidthUpdatedAt: Date.now(),
		skills: [],
		skillTotal: 0,
		compactions: 0,
		customCommands: new Map(),
		gitUpdatedAt: 0,
	};
}

export function emptyUsageSnapshot(): UsageSnapshot {
	return {
		current: emptyUsageBucket(),
		turn: emptyUsageBucket(),
		total: emptyUsageBucket(),
		stats: emptySessionStats(),
	};
}

export function recordSkill(state: MeTuiState, invocation: SkillInvocation): void {
	state.skillTotal += 1;
	state.skills.push(invocation);
	if (state.skills.length > MAX_SKILL_HISTORY) state.skills.splice(0, state.skills.length - MAX_SKILL_HISTORY);
}

export function detectSkillFromInput(text: string, skillNames: ReadonlySet<string>): string | undefined {
	const trimmed = text.trim();
	if (!trimmed.startsWith("/")) return undefined;
	const body = trimmed.slice(1).split(/\s+/, 1)[0];
	if (!body) return undefined;
	if (body.startsWith("skill:")) {
		const name = body.slice("skill:".length);
		return name || undefined;
	}
	return skillNames.has(body) ? body : undefined;
}

export function detectToolInvocation(toolName: string): SkillInvocation | undefined {
	if (!toolName || BUILTIN_TOOLS.has(toolName)) return undefined;
	if (toolName.startsWith("mcp__")) {
		const rest = toolName.slice("mcp__".length);
		const separator = rest.indexOf("__");
		if (separator > 0) {
			return {
				kind: "mcp",
				server: rest.slice(0, separator),
				name: rest.slice(separator + 2),
				timestamp: Date.now(),
			};
		}
		return { kind: "mcp", name: rest, timestamp: Date.now() };
	}
	return { kind: "tool", name: toolName, timestamp: Date.now() };
}

export function formatSkillInvocation(invocation: SkillInvocation): string {
	if (invocation.kind === "skill") return `skill:${invocation.name}`;
	if (invocation.kind === "mcp") {
		return invocation.server ? `${invocation.server}/${invocation.name}` : invocation.name;
	}
	return invocation.name;
}

export function latestSkill(state: MeTuiState): SkillInvocation | undefined {
	return state.skills.at(-1);
}

export function recentSkills(state: MeTuiState, limit = 3): SkillInvocation[] {
	return state.skills.slice(-limit);
}

export function uniqueSkillCount(state: MeTuiState): number {
	return new Set(state.skills.map((entry) => formatSkillInvocation(entry))).size;
}

export function isBuiltinTool(toolName: string): boolean {
	return BUILTIN_TOOLS.has(toolName);
}
