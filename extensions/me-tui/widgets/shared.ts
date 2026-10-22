import type { ContextUsage } from "@earendil-works/pi-coding-agent";
import type { GitInfo, NumberFormat, UsageBucket, WidgetItem, WidgetRenderContext } from "../types.ts";
import { formatTokens } from "../utils.ts";

export function gitInfo(rc: WidgetRenderContext): GitInfo | undefined {
	return rc.state.git.isRepo ? rc.state.git : undefined;
}

export function usageBucket(rc: WidgetRenderContext, scope: "current" | "turn" | "total"): UsageBucket {
	return rc.state.usage[scope];
}

export function itemNumberFormat(item: WidgetItem): NumberFormat {
	return item.numberFormat ?? "compact";
}

export function tokenText(value: number, item: WidgetItem): string {
	return formatTokens(value, itemNumberFormat(item));
}

export function hideWhenZero(item: WidgetItem, value: number, defaultHide = true): boolean {
	if (item.hideEmpty === undefined) return defaultHide && value === 0;
	return item.hideEmpty && value === 0;
}

export function contextUsage(rc: WidgetRenderContext): ContextUsage | undefined {
	const usage = rc.ctx.getContextUsage();
	const fallbackWindow = rc.ctx.model?.contextWindow ?? 0;
	if (!usage) {
		if (fallbackWindow <= 0) return undefined;
		return { tokens: null, contextWindow: fallbackWindow, percent: null };
	}
	if (usage.contextWindow > 0) return usage;
	if (fallbackWindow > 0) return { ...usage, contextWindow: fallbackWindow };
	return undefined;
}

export function contextPercent(usage: ContextUsage): number | undefined {
	if (typeof usage.percent === "number" && Number.isFinite(usage.percent)) return usage.percent;
	if (typeof usage.tokens === "number" && usage.contextWindow > 0) {
		return (usage.tokens / usage.contextWindow) * 100;
	}
	return undefined;
}

export function contextTokens(usage: ContextUsage): number | undefined {
	if (typeof usage.tokens === "number" && Number.isFinite(usage.tokens)) return usage.tokens;
	return undefined;
}

export function iconText(icon: string, value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return icon ? `${icon} ${trimmed}` : trimmed;
}

export function nonEmpty(value: string | undefined | null): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function formatCount(value: number): string {
	return String(Math.max(0, Math.round(value)));
}

export function signed(value: number, symbol: string): string {
	return `${symbol}${formatCount(value)}`;
}
