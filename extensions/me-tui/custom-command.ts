import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CustomCommandValue, WidgetItem } from "./types.ts";
import { sanitizeSingleLine, stripAnsi } from "./utils.ts";

const execAsync = promisify(exec);

export interface CustomCommandInput {
	provider?: string;
	model?: string;
	thinkingLevel?: string;
	cwd: string;
	sessionId: string;
	sessionName?: string;
	terminalWidth: number;
	gitBranch?: string;
}

export async function runCustomCommand(
	ctx: ExtensionContext,
	item: WidgetItem,
): Promise<CustomCommandValue> {
	const command = item.command?.trim();
	if (!command) return { text: "", at: Date.now(), failed: true };
	const input: CustomCommandInput = {
		provider: ctx.model?.provider,
		model: ctx.model?.name ?? ctx.model?.id,
		thinkingLevel: ctx.thinkingLevel,
		cwd: ctx.cwd,
		sessionId: ctx.sessionManager.getSessionId(),
		sessionName: ctx.sessionManager.getSessionName(),
		terminalWidth: process.stdout.columns ?? 0,
		gitBranch: undefined,
	};
	const timeout = Math.min(60_000, Math.max(100, item.timeoutMs ?? 1000));
	try {
		const result = await execAsync(command, {
			cwd: ctx.cwd,
			timeout,
			maxBuffer: 1024 * 1024,
			windowsHide: true,
			env: {
				...process.env,
				PI_ME_TUI: "1",
				PI_ME_TUI_JSON: JSON.stringify(input),
			},
		});
		let text = String(result.stdout ?? "").replace(/\r?\n/g, " ").trim();
		if (!item.preserveColors) text = stripAnsi(text);
		text = sanitizeSingleLine(text).slice(0, 500);
		return { text, at: Date.now() };
	} catch (error) {
		const stderr = (error as { stderr?: string }).stderr;
		const text = stderr ? sanitizeSingleLine(stripAnsi(String(stderr))).slice(0, 80) : "!";
		return { text, at: Date.now(), failed: true };
	}
}

export function shouldRefreshCustomCommand(
	cached: CustomCommandValue | undefined,
	ttlSeconds: number,
	now: number,
): boolean {
	if (!cached) return true;
	if (ttlSeconds <= 0) return true;
	return now - cached.at >= ttlSeconds * 1000;
}
