import assert from "node:assert/strict";
import test from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { Usage } from "@earendil-works/pi-ai";
import {
	addUsage,
	computeUsageFromEntries,
	emptyUsageBucket,
	finalizeBucket,
	speedOf,
} from "../extensions/me-tui/usage.ts";
import { formatSpeed } from "../extensions/me-tui/utils.ts";

function usage(input: number, output: number, cacheRead: number, cacheWrite: number): Usage {
	return {
		input,
		output,
		cacheRead,
		cacheWrite,
		totalTokens: input + output + cacheRead + cacheWrite,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function message(
	id: string,
	parentId: string | null,
	timestamp: number,
	role: "user" | "assistant" | "toolResult" | "system",
	payload: { usage?: Usage; durationMs?: number } = {},
): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp,
		message: {
			role,
			content: [],
			timestamp,
			...payload,
		},
	} as unknown as SessionEntry;
}

function sampleEntries(): SessionEntry[] {
	return [
		message("u1", null, 1000, "user"),
		message("a1", "u1", 2000, "assistant", { usage: usage(100, 50, 10, 5), durationMs: 1000 }),
		message("t1", "a1", 2500, "toolResult", { usage: usage(20, 0, 0, 0) }),
		message("u2", "t1", 3000, "user"),
		message("a2", "u2", 4000, "assistant", { usage: usage(200, 100, 50, 10), durationMs: 2000 }),
	];
}

test("computeUsageFromEntries derives rounds, model calls, and round durations", () => {
	const snapshot = computeUsageFromEntries(sampleEntries());
	assert.equal(snapshot.stats.rounds, 2);
	assert.equal(snapshot.stats.modelCalls, 2);
	assert.equal(snapshot.stats.currentRoundMs, 1000);
	assert.equal(snapshot.stats.totalRoundMs, 2500);
});

test("unfinished rounds do not count or add duration", () => {
	const entries = [...sampleEntries(), message("u3", "a2", 5000, "user")];
	const snapshot = computeUsageFromEntries(entries);
	assert.equal(snapshot.stats.rounds, 2);
	assert.equal(snapshot.stats.modelCalls, 2);
	assert.equal(snapshot.stats.currentRoundMs, 0);
	assert.equal(snapshot.stats.totalRoundMs, 2500);
});

test("non-message entries do not extend round duration", () => {
	const entries: SessionEntry[] = [
		message("u1", null, 1000, "user"),
		message("a1", "u1", 2000, "assistant", { usage: usage(10, 5, 0, 0), durationMs: 1000 }),
		message("s1", "a1", 7000, "system"),
		{ type: "model_change", id: "mc", parentId: "s1", timestamp: 8000 } as unknown as SessionEntry,
		message("u2", "mc", 9000, "user"),
		message("a2", "u2", 10_000, "assistant", { usage: usage(10, 5, 0, 0), durationMs: 1000 }),
	];
	const stats = computeUsageFromEntries(entries).stats;
	assert.equal(stats.rounds, 2);
	assert.equal(stats.currentRoundMs, 1000);
	assert.equal(stats.totalRoundMs, 2000);
});

test("computeUsageFromEntries separates total, current agent run, and last turn", () => {
	const entries = sampleEntries();
	const ttft = new Map<number, number>([
		[2000, 200],
		[4000, 500],
	]);
	const snapshot = computeUsageFromEntries(entries, ttft);
	assert.equal(snapshot.total.input, 335);
	assert.equal(snapshot.total.output, 150);
	assert.equal(snapshot.total.cacheRead, 60);
	assert.equal(snapshot.total.cacheWrite, 15);
	assert.equal(snapshot.total.totalTokens, 545);
	assert.equal(snapshot.total.durationMs, 3000);
	assert.equal(snapshot.total.messageCount, 3);
	assert.equal(snapshot.total.cacheHitRate?.toFixed(2), "15.19");

	// toolResult has no durationMs, so its 20 tokens stay out of speed timing.
	assert.equal(snapshot.total.timing.totalTokens, 525);
	assert.equal(snapshot.total.timing.totalMs, 3000);
	assert.equal(snapshot.total.timing.prefillTokens, 375);
	assert.equal(snapshot.total.timing.prefillMs, 700);
	assert.equal(snapshot.total.timing.decodeTokens, 150);
	assert.equal(snapshot.total.timing.decodeMs, 2300);
	assert.equal(speedOf(snapshot.total, "total"), 175);
	assert.ok(Math.abs(speedOf(snapshot.total, "input") - 375 / 0.7) < 1e-9);
	assert.ok(Math.abs(speedOf(snapshot.total, "output") - 150 / 2.3) < 1e-9);

	assert.equal(snapshot.current.input, 210);
	assert.equal(snapshot.current.output, 100);
	assert.equal(snapshot.current.cacheRead, 50);
	assert.equal(snapshot.current.cacheWrite, 10);
	assert.equal(snapshot.current.totalTokens, 360);
	assert.equal(snapshot.current.durationMs, 2000);
	assert.equal(snapshot.current.messageCount, 1);
	assert.equal(snapshot.current.cacheHitRate?.toFixed(2), "19.23");
	assert.equal(snapshot.current.timing.prefillTokens, 260);
	assert.equal(snapshot.current.timing.prefillMs, 500);
	assert.equal(snapshot.current.timing.decodeTokens, 100);
	assert.equal(snapshot.current.timing.decodeMs, 1500);
	assert.equal(snapshot.current.timing.totalTokens, 360);
	assert.equal(snapshot.current.timing.totalMs, 2000);

	assert.equal(snapshot.turn.input, 210);
	assert.equal(snapshot.turn.totalTokens, 360);
	assert.equal(snapshot.turn.messageCount, 1);
});

test("responses without TTFT fall back to duration-based speeds", () => {
	const snapshot = computeUsageFromEntries(sampleEntries());
	assert.equal(snapshot.total.timing.totalTokens, 525);
	assert.equal(snapshot.total.timing.totalMs, 3000);
	assert.equal(snapshot.total.timing.prefillMs, 3000);
	assert.equal(snapshot.total.timing.decodeMs, 3000);
	assert.equal(snapshot.total.timing.prefillTokens, 395);
	assert.equal(snapshot.total.timing.decodeTokens, 150);
	assert.equal(speedOf(snapshot.total, "input"), 395 / 3);
	assert.equal(speedOf(snapshot.total, "output"), 50);
	assert.equal(speedOf(snapshot.total, "total"), 175);
});

test("computeUsageFromEntries ignores non-usage entries and handles empty sessions", () => {
	const empty = computeUsageFromEntries([]);
	assert.equal(empty.total.totalTokens, 0);
	assert.equal(empty.current.totalTokens, 0);
	assert.equal(empty.turn.cacheHitRate, undefined);

	const entries = [
		message("u1", null, 1000, "user"),
		{ type: "label", id: "l1", parentId: "u1", timestamp: 1100, label: "note" },
		{ type: "custom", id: "c1", parentId: "l1", timestamp: 1200, customType: "x", data: {} },
	] as unknown as SessionEntry[];
	const snapshot = computeUsageFromEntries(entries);
	assert.equal(snapshot.total.totalTokens, 0);
	assert.equal(snapshot.current.messageCount, 0);
});

test("finalizeBucket derives durations and cache hit rates", () => {
	const bucket = finalizeBucket({
		...emptyUsageBucket(),
		input: 100,
		output: 50,
		cacheRead: 100,
		cacheWrite: 0,
		durationMs: 0,
		messageCount: 2,
		firstTimestamp: 1000,
		lastTimestamp: 4000,
	});
	assert.equal(bucket.durationMs, 3000);
	assert.equal(bucket.totalTokens, 250);
	assert.equal(bucket.cacheHitRate, 50);
});

test("formatSpeed uses compact t/s units", () => {
	assert.equal(formatSpeed(51.6), "51.6t/s");
	assert.equal(formatSpeed(8440), "8.44kt/s");
	assert.equal(formatSpeed(1_500_000), "1.5mt/s");
});

test("speedOf uses prefill/decode/total timing", () => {
	const bucket = emptyUsageBucket();
	addUsage(bucket, usage(100, 50, 0, 0), 2000, 1000, 500);
	finalizeBucket(bucket);
	assert.equal(speedOf(bucket, "input"), 200);
	assert.equal(speedOf(bucket, "output"), 50 / 1.5);
	assert.equal(speedOf(bucket, "total"), 75);

	const withoutTtft = emptyUsageBucket();
	addUsage(withoutTtft, usage(100, 50, 0, 0), 2000);
	finalizeBucket(withoutTtft);
	assert.equal(speedOf(withoutTtft, "input"), 50);
	assert.equal(speedOf(withoutTtft, "output"), 25);
	assert.equal(speedOf(withoutTtft, "total"), 75);

	const invalidTtft = emptyUsageBucket();
	addUsage(invalidTtft, usage(100, 50, 0, 0), 1000, 0, 1000);
	finalizeBucket(invalidTtft);
	assert.equal(speedOf(invalidTtft, "input"), 100);
	assert.equal(speedOf(invalidTtft, "output"), 50);
	assert.equal(speedOf(invalidTtft, "total"), 150);
});
