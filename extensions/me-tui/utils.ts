import { homedir } from "node:os";
import type { NumberFormat, WidgetItem } from "./types.ts";

let widgetSequence = 0;

export function createWidgetId(type: string): string {
	widgetSequence += 1;
	return `${type}-${Date.now().toString(36)}-${widgetSequence.toString(36)}`;
}

export function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, value));
}

export function safeNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepClone<T>(value: T): T {
	if (Array.isArray(value)) return value.map((entry) => deepClone(entry)) as T;
	if (isPlainObject(value)) {
		const result: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) result[key] = deepClone(entry);
		return result as T;
	}
	return value;
}

export function localized(text: { zh: string; en: string } | undefined, language: "zh" | "en"): string {
	if (!text) return "";
	return language === "zh" ? text.zh : text.en;
}

export function stripAnsi(text: string): string {
	return text
		.replace(/\x1b\]8;;.*?\x1b\\/g, "")
		.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

export function hasAnsi(text: string): boolean {
	return text.includes("\x1b[") || text.includes("\x1b]8;;");
}

export function sanitizeSingleLine(text: string): string {
	return text.replace(/[\r\n\t]+/g, " ").replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").trim();
}

export function takeGrapheme(text: string): string {
	if (!text) return "";
	try {
		const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
		const first = segmenter.segment(text)[Symbol.iterator]().next();
		if (!first.done) return first.value.segment;
	} catch {
		// fall through
	}
	return Array.from(text)[0] ?? "";
}

export function osc8Link(text: string, url: string): string {
	return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

export function formatTokens(value: number, format: NumberFormat = "compact"): string {
	const number = Math.max(0, Math.round(safeNumber(value)));
	if (format === "full") return String(number);
	if (format === "comma") return number.toLocaleString("en-US");
	if (number < 1_000) return String(number);
	if (number < 1_000_000) return trimFixed(number / 1_000, 1) + "k";
	if (number < 1_000_000_000) return trimFixed(number / 1_000_000, 1) + "m";
	return trimFixed(number / 1_000_000_000, 1) + "b";
}

export function trimFixed(value: number, digits: number): string {
	const fixed = value.toFixed(digits);
	return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function formatPercent(value: number, digits = 1): string {
	return trimFixed(Math.max(0, Math.min(100, safeNumber(value))), digits) + "%";
}

export function formatSpeed(tokensPerSecond: number): string {
	if (!Number.isFinite(tokensPerSecond) || tokensPerSecond <= 0) return "-";
	if (tokensPerSecond < 1_000) return trimFixed(tokensPerSecond, 1) + "t/s";
	if (tokensPerSecond < 1_000_000) return trimFixed(tokensPerSecond / 1_000, 2) + "kt/s";
	return trimFixed(tokensPerSecond / 1_000_000, 2) + "mt/s";
}

export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "-";
	if (ms < 1_000) return `${Math.round(ms)}ms`;
	const seconds = Math.round(ms / 1_000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	if (minutes < 60) return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const restMinutes = minutes % 60;
	return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

export function formatClockDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "0s";
	if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0B";
	const units = ["B", "K", "M", "G", "T"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return trimFixed(value, unit === 0 ? 0 : 1) + units[unit];
}

export function basenamePath(path: string): string {
	const normalized = path.replace(/[\\/]+$/, "");
	const parts = normalized.split(/[\\/]/).filter(Boolean);
	return parts.at(-1) ?? normalized;
}

export function normalizeSlash(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function formatCwd(
	cwd: string,
	options: { home?: boolean; segments?: number; fish?: boolean } = {},
): string {
	const withHome = options.home ?? true;
	const maxSegments = options.segments ?? 0;
	const fish = options.fish ?? false;
	const normalized = normalizeSlash(cwd);
	const home = normalizeSlash(homedir());
	let display = normalized;
	if (withHome && home && (normalized === home || normalized.startsWith(`${home}/`))) {
		display = "~" + normalized.slice(home.length);
	}
	let parts = display.split("/").filter(Boolean);
	const isAbsolute = display.startsWith("/");
	const drive = /^[A-Za-z]:$/.test(parts[0] ?? "") ? parts.shift() : undefined;
	const homeMark = parts[0] === "~" ? parts.shift() : undefined;
	if (fish && parts.length > 2) {
		parts = parts.map((part, index) => {
			if (index === parts.length - 1) return part;
			if (part.startsWith(".")) return part.slice(0, 2);
			return part.slice(0, 1);
		});
	}
	if (maxSegments > 0 && parts.length > maxSegments) {
		parts = ["...", ...parts.slice(-maxSegments)];
	}
	const prefix = [drive, homeMark].filter(Boolean).join("/");
	const body = parts.join("/");
	if (prefix && body) return `${prefix}/${body}`;
	if (prefix) return prefix + (isAbsolute ? "/" : "");
	if (body) return (isAbsolute ? "/" : "") + body;
	return display || "/";
}

const PROVIDER_LABELS: Record<string, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	"openai-codex": "OpenAI Codex",
	"openai-responses": "OpenAI",
	google: "Google",
	"google-vertex": "Google Vertex",
	openrouter: "OpenRouter",
	deepseek: "DeepSeek",
	github: "GitHub",
	"github-copilot": "GitHub Copilot",
	azure: "Azure",
	"azure-openai": "Azure OpenAI",
	bedrock: "Bedrock",
	"amazon-bedrock": "Bedrock",
	mistral: "Mistral",
	groq: "Groq",
	xai: "xAI",
	ollama: "Ollama",
	lmstudio: "LM Studio",
	"lm-studio": "LM Studio",
	cerebras: "Cerebras",
	zai: "Z.AI",
	"z.ai": "Z.AI",
	moonshot: "Moonshot",
	"moonshot-ai": "Moonshot",
	qwen: "Qwen",
	alibaba: "Alibaba",
};

export function formatProviderLabel(provider: string | undefined): string {
	if (!provider) return "unknown";
	const key = provider.toLowerCase();
	if (PROVIDER_LABELS[key]) return PROVIDER_LABELS[key];
	return provider
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join(" ");
}

export function formatThinkingLabel(level: string | undefined, language: "zh" | "en"): string {
	const normalized = (level ?? "off").toLowerCase();
	const labels: Record<string, { zh: string; en: string }> = {
		off: { zh: "关闭", en: "off" },
		none: { zh: "关闭", en: "none" },
		minimal: { zh: "极低", en: "minimal" },
		low: { zh: "低", en: "low" },
		medium: { zh: "中", en: "medium" },
		high: { zh: "高", en: "high" },
		xhigh: { zh: "极高", en: "xhigh" },
		max: { zh: "最高", en: "max" },
	};
	const entry = labels[normalized] ?? { zh: level ?? "off", en: level ?? "off" };
	return language === "zh" ? entry.zh : entry.en;
}

export function humanizeType(type: string): string {
	return type
		.split(/[-_]+/)
		.filter(Boolean)
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join(" ");
}

export function getMetadata(item: WidgetItem, key: string, fallback = ""): string {
	const value = item.metadata?.[key];
	return typeof value === "string" ? value : fallback;
}

export function setMetadata(item: WidgetItem, key: string, value: string): void {
	item.metadata ??= {};
	item.metadata[key] = value;
}

export function metadataBoolean(item: WidgetItem, key: string, fallback = false): boolean {
	const value = item.metadata?.[key];
	if (value === "true") return true;
	if (value === "false") return false;
	return fallback;
}

export function metadataNumber(item: WidgetItem, key: string, fallback: number): number {
	const value = Number(item.metadata?.[key]);
	return Number.isFinite(value) ? value : fallback;
}

export function joinNonEmpty(parts: Array<string | null | undefined>, separator: string): string {
	return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(separator);
}

export function titleCase(value: string): string {
	if (!value) return value;
	return value.slice(0, 1).toUpperCase() + value.slice(1);
}
