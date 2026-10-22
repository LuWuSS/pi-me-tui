import type { UsageBucket, WidgetDefinition, WidgetRenderContext } from "../types.ts";
import { formatPercent } from "../utils.ts";
import { hideWhenZero, iconText, tokenText, usageBucket } from "./shared.ts";

function currentBucket(rc: WidgetRenderContext): UsageBucket {
	return usageBucket(rc, rc.config.currentScope === "turn" ? "turn" : "current");
}

function hitRate(bucket: UsageBucket): number | undefined {
	if (bucket.cacheRead > 0) return bucket.cacheHitRate;
	if (bucket.messageCount <= 0) return undefined;
	return 0;
}

export const tokenWidgets: WidgetDefinition[] = [
	{
		type: "tokens-input",
		category: "token",
		name: { zh: "本次输入 Token", en: "Current input tokens" },
		description: { zh: "当前 agent run 的输入 Token", en: "Input tokens for the current agent run" },
		defaultColor: "blue",
		defaultLabel: { zh: "本次输入: ", en: "in: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 6,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => {
			const bucket = currentBucket(rc);
			if (hideWhenZero(item, bucket.input)) return null;
			return iconText(rc.icons.input, tokenText(bucket.input, item));
		},
	},
	{
		type: "tokens-output",
		category: "token",
		name: { zh: "本次输出 Token", en: "Current output tokens" },
		description: { zh: "当前 agent run 的输出 Token", en: "Output tokens for the current agent run" },
		defaultColor: "text",
		defaultLabel: { zh: "本次输出: ", en: "out: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 6,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => {
			const bucket = currentBucket(rc);
			if (hideWhenZero(item, bucket.output)) return null;
			return iconText(rc.icons.output, tokenText(bucket.output, item));
		},
	},
	{
		type: "tokens-cached",
		category: "token",
		name: { zh: "本次缓存 Token", en: "Current cached tokens" },
		description: { zh: "当前 agent run 的缓存读取 Token", en: "Cache-read tokens for the current agent run" },
		defaultColor: "cyan",
		defaultLabel: { zh: "本次缓存: ", en: "cache: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 6,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => {
			const bucket = currentBucket(rc);
			if (bucket.cacheRead <= 0) {
				if (bucket.messageCount <= 0) return item.hideEmpty === true ? null : iconText(rc.icons.cache, tokenText(0, item));
				return iconText(rc.icons.cache, tokenText(0, item));
			}
			return iconText(rc.icons.cache, tokenText(bucket.cacheRead, item));
		},
	},
	{
		type: "tokens-cache-hit-rate",
		category: "token",
		name: { zh: "本次缓存命中率", en: "Current cache hit rate" },
		description: { zh: "缓存读取 /（输入 + 缓存读取），输入已含缓存写入", en: "Cache read / (input + cache read); input already includes cache writes" },
		defaultColor: "success",
		defaultLabel: { zh: "本次命中: ", en: "hit: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 6,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => {
			const bucket = currentBucket(rc);
			const rate = hitRate(bucket);
			if (rate === undefined) {
				if (bucket.messageCount <= 0) return item.hideEmpty === true ? null : iconText(rc.icons.cacheHit, formatPercent(0));
				return iconText(rc.icons.cacheHit, formatPercent(0));
			}
			return iconText(rc.icons.cacheHit, formatPercent(rate));
		},
	},
	{
		type: "tokens-total-input",
		category: "token",
		name: { zh: "合计输入 Token", en: "Session input tokens" },
		description: { zh: "整个 session 的输入 Token", en: "Input tokens for the whole session" },
		defaultColor: "blue",
		defaultLabel: { zh: "输入: ", en: "in: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		render: (item, rc) => {
			const value = usageBucket(rc, "total").input;
			if (value <= 0 && item.hideEmpty === true) return null;
			return iconText(rc.icons.input, tokenText(value, item));
		},
	},
	{
		type: "tokens-total-output",
		category: "token",
		name: { zh: "合计输出 Token", en: "Session output tokens" },
		description: { zh: "整个 session 的输出 Token", en: "Output tokens for the whole session" },
		defaultColor: "text",
		defaultLabel: { zh: "输出: ", en: "out: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		render: (item, rc) => {
			const value = usageBucket(rc, "total").output;
			if (value <= 0 && item.hideEmpty === true) return null;
			return iconText(rc.icons.output, tokenText(value, item));
		},
	},
	{
		type: "tokens-total-cached",
		category: "token",
		name: { zh: "合计缓存 Token", en: "Session cached tokens" },
		description: { zh: "整个 session 的缓存读取 Token", en: "Cache-read tokens for the whole session" },
		defaultColor: "cyan",
		defaultLabel: { zh: "缓存: ", en: "cache: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		render: (item, rc) => {
			const bucket = usageBucket(rc, "total");
			if (bucket.cacheRead <= 0) {
				if (bucket.messageCount <= 0) return item.hideEmpty === true ? null : iconText(rc.icons.cache, tokenText(0, item));
				return iconText(rc.icons.cache, tokenText(0, item));
			}
			return iconText(rc.icons.cache, tokenText(bucket.cacheRead, item));
		},
	},
	{
		type: "tokens-total-cache-hit-rate",
		category: "token",
		name: { zh: "合计缓存命中率", en: "Session cache hit rate" },
		description: { zh: "整个 session 的缓存命中率（输入已含缓存写入）", en: "Cache hit rate for the whole session (input includes cache writes)" },
		defaultColor: "success",
		defaultLabel: { zh: "命中: ", en: "hit: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		render: (item, rc) => {
			const bucket = usageBucket(rc, "total");
			const rate = hitRate(bucket);
			if (rate === undefined) {
				if (bucket.messageCount <= 0) return item.hideEmpty === true ? null : iconText(rc.icons.cacheHit, formatPercent(0));
				return iconText(rc.icons.cacheHit, formatPercent(0));
			}
			return iconText(rc.icons.cacheHit, formatPercent(rate));
		},
	},
	{
		type: "tokens-total",
		category: "token",
		name: { zh: "合计 Token", en: "Total tokens" },
		description: { zh: "输入 + 输出 + 缓存 Token", en: "Input + output + cache tokens" },
		defaultColor: "cyan",
		defaultLabel: { zh: "Token: ", en: "tokens: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		render: (item, rc) => {
			const value = usageBucket(rc, "total").totalTokens;
			if (value <= 0 && item.hideEmpty === true) return null;
			return iconText(rc.icons.total, tokenText(value, item));
		},
	},
];
