import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { Usage } from "@earendil-works/pi-ai";
import type { SessionStats, UsageBucket, UsageSnapshot, UsageTiming } from "./types.ts";

interface UsageCarrier {
	usage?: Usage;
	timestamp?: number | string;
	durationMs?: number;
	role?: string;
}

function normalizeTimestamp(value: number | string | undefined): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

let cachedKey = "";
let cachedSnapshot: UsageSnapshot | undefined;

function emptyTiming(): UsageTiming {
	return {
		prefillTokens: 0,
		prefillMs: 0,
		decodeTokens: 0,
		decodeMs: 0,
		totalTokens: 0,
		totalMs: 0,
	};
}

export function emptySessionStats(): SessionStats {
	return { rounds: 0, modelCalls: 0, currentRoundMs: 0, totalRoundMs: 0 };
}

export function emptyUsageBucket(): UsageBucket {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		durationMs: 0,
		messageCount: 0,
		timing: emptyTiming(),
	};
}

export function addUsage(
	bucket: UsageBucket,
	usage: Usage | undefined,
	durationMs = 0,
	timestamp?: number | string,
	ttftMs?: number,
): void {
	if (!usage) return;
	const cacheWrite = positive(usage.cacheWrite);
	const cacheRead = positive(usage.cacheRead);
	// pi-ai normalizes `input` to exclude cache read/write; add write back for
	// display and read for the full prompt used by prefill speed.
	const input = positive(usage.input) + cacheWrite;
	const output = positive(usage.output);
	const prompt = input + cacheRead;
	const total = prompt + output;

	bucket.input += input;
	bucket.output += output;
	bucket.cacheRead += cacheRead;
	bucket.cacheWrite += cacheWrite;
	bucket.totalTokens = bucket.input + bucket.output + bucket.cacheRead;
	bucket.messageCount += 1;

	const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
	if (duration > 0) {
		bucket.durationMs += duration;
		bucket.timing.totalTokens += total;
		bucket.timing.totalMs += duration;

		const ttft =
			ttftMs !== undefined && Number.isFinite(ttftMs) && ttftMs > 0 && ttftMs < duration
				? ttftMs
				: undefined;
		if (ttft !== undefined) {
			bucket.timing.prefillTokens += prompt;
			bucket.timing.prefillMs += ttft;
			bucket.timing.decodeTokens += output;
			bucket.timing.decodeMs += duration - ttft;
		}
	}

	const normalized = normalizeTimestamp(timestamp);
	if (normalized !== undefined) {
		bucket.firstTimestamp = bucket.firstTimestamp === undefined ? normalized : Math.min(bucket.firstTimestamp, normalized);
		bucket.lastTimestamp = bucket.lastTimestamp === undefined ? normalized : Math.max(bucket.lastTimestamp, normalized);
	}
}

export function finalizeBucket(bucket: UsageBucket): UsageBucket {
	if (bucket.durationMs <= 0 && bucket.firstTimestamp !== undefined && bucket.lastTimestamp !== undefined) {
		bucket.durationMs = Math.max(0, bucket.lastTimestamp - bucket.firstTimestamp);
	}
	const timing = bucket.timing;
	if (timing.prefillMs <= 0 && timing.decodeMs <= 0 && bucket.durationMs > 0) {
		// TTFT samples only exist while streaming and are not persisted in the
		// session file, so a resumed session has none. Fall back to the full
		// duration instead of hiding the input/output speeds.
		timing.prefillTokens = bucket.input + bucket.cacheRead;
		timing.prefillMs = bucket.durationMs;
		timing.decodeTokens = bucket.output;
		timing.decodeMs = bucket.durationMs;
	}
	if (timing.totalMs <= 0 && bucket.durationMs > 0) {
		timing.totalTokens = bucket.input + bucket.cacheRead + bucket.output;
		timing.totalMs = bucket.durationMs;
	}
	const denominator = bucket.input + bucket.cacheRead;
	bucket.cacheHitRate = denominator > 0 ? (bucket.cacheRead / denominator) * 100 : undefined;
	bucket.totalTokens = bucket.input + bucket.output + bucket.cacheRead;
	return bucket;
}

export function computeUsageFromEntries(
	entries: readonly SessionEntry[],
	ttftByTimestamp?: ReadonlyMap<number, number>,
): UsageSnapshot {
	const total = emptyUsageBucket();
	const current = emptyUsageBucket();
	const turn = emptyUsageBucket();
	const add = (bucket: UsageBucket, carrier: UsageCarrier, timestamp: number | string | undefined): void => {
		const normalized = normalizeTimestamp(timestamp);
		const ttft = normalized === undefined ? undefined : ttftByTimestamp?.get(normalized);
		addUsage(bucket, carrier.usage, carrier.durationMs ?? 0, timestamp, ttft);
	};
	let lastUserIndex = -1;
	let lastAssistantIndex = -1;
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index];
		const carrier = getCarrier(entry);
		if (!carrier) continue;
		add(total, carrier, carrier.timestamp ?? entry.timestamp);
		if (carrier.role === "user") lastUserIndex = index;
		if (carrier.role === "assistant") lastAssistantIndex = index;
	}
	if (lastUserIndex >= 0) {
		for (let index = lastUserIndex + 1; index < entries.length; index += 1) {
			const entry = entries[index];
			const carrier = getCarrier(entry);
			if (!carrier) continue;
			add(current, carrier, carrier.timestamp ?? entry.timestamp);
		}
	}
	if (lastAssistantIndex >= 0) {
		const entry = entries[lastAssistantIndex];
		const carrier = getCarrier(entry);
		if (carrier) add(turn, carrier, carrier.timestamp ?? entry.timestamp);
	}
	return {
		current: finalizeBucket(current),
		turn: finalizeBucket(turn),
		total: finalizeBucket(total),
		stats: computeSessionStats(entries),
	};
}

export function getUsageSnapshot(
	ctx: ExtensionContext,
	ttftByTimestamp?: ReadonlyMap<number, number>,
): UsageSnapshot {
	const entries = ctx.sessionManager.getEntries();
	const last = entries.at(-1);
	const key = `${ctx.sessionManager.getSessionId()}:${ctx.sessionManager.getLeafId() ?? ""}:${entries.length}:${last?.id ?? ""}:${last?.timestamp ?? ""}:${ttftByTimestamp?.size ?? 0}`;
	if (cachedSnapshot && key === cachedKey) return cachedSnapshot;
	cachedSnapshot = computeUsageFromEntries(entries, ttftByTimestamp);
	cachedKey = key;
	return cachedSnapshot;
}

export function invalidateUsageCache(): void {
	cachedKey = "";
	cachedSnapshot = undefined;
}

export function speedOf(bucket: UsageBucket, tokens: "input" | "output" | "total"): number {
	if (!bucket) return 0;
	const timing = bucket.timing;
	if (tokens === "input") {
		return timing.prefillMs > 0 ? timing.prefillTokens / (timing.prefillMs / 1000) : 0;
	}
	if (tokens === "output") {
		return timing.decodeMs > 0 ? timing.decodeTokens / (timing.decodeMs / 1000) : 0;
	}
	return timing.totalMs > 0 ? timing.totalTokens / (timing.totalMs / 1000) : 0;
}

function computeSessionStats(entries: readonly SessionEntry[]): SessionStats {
	const stats = emptySessionStats();
	let roundStart: number | undefined;
	let roundEnd = 0;
	let roundCompleted = false;
	const closeRound = (): void => {
		if (roundStart === undefined) return;
		const duration = Math.max(0, roundEnd - roundStart);
		stats.totalRoundMs += duration;
		stats.currentRoundMs = duration;
		if (roundCompleted) stats.rounds += 1;
	};
	for (const entry of entries) {
		const entryTs = normalizeTimestamp(entry.timestamp);
		if (entry.type === "message") {
			const message = entry.message as { role?: string; timestamp?: number | string };
			const messageTs = normalizeTimestamp(message.timestamp);
			if (message.role === "user") {
				closeRound();
				roundStart = messageTs ?? entryTs;
				roundEnd = roundStart ?? 0;
				roundCompleted = false;
				continue;
			}
			if (message.role === "assistant") {
				stats.modelCalls += 1;
				roundCompleted = true;
			}
			if (message.role === "assistant" || message.role === "toolResult") {
				const end = entryTs ?? messageTs;
				if (roundStart !== undefined && end !== undefined && end > roundEnd) roundEnd = end;
			}
		}
	}
	closeRound();
	return stats;
}

function getCarrier(entry: SessionEntry): UsageCarrier | undefined {
	if (entry.type === "message") {
		const message = entry.message as unknown as UsageCarrier;
		if (message.role === "user") return { role: "user", timestamp: message.timestamp };
		if (message.role === "assistant") {
			return {
				role: "assistant",
				usage: message.usage,
				timestamp: message.timestamp,
				durationMs: message.durationMs,
			};
		}
		if (message.role === "toolResult") {
			return {
				role: "toolResult",
				usage: message.usage,
				timestamp: message.timestamp,
			};
		}
		return undefined;
	}
	if (entry.type === "compaction" || entry.type === "branch_summary") {
		return {
			usage: (entry as { usage?: Usage }).usage,
			timestamp: entry.timestamp,
		};
	}
	return undefined;
}

function positive(value: number | undefined): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
