import type { IconMode } from "./types.ts";

export interface IconSet {
	provider: string;
	model: string;
	thinking: string;
	git: string;
	branch: string;
	changes: string;
	insertions: string;
	deletions: string;
	status: string;
	staged: string;
	unstaged: string;
	untracked: string;
	conflicts: string;
	ahead: string;
	behind: string;
	sha: string;
	origin: string;
	upstream: string;
	fork: string;
	root: string;
	worktree: string;
	input: string;
	output: string;
	cache: string;
	cacheHit: string;
	total: string;
	speed: string;
	speedInput: string;
	speedOutput: string;
	speedTotal: string;
	context: string;
	clock: string;
	session: string;
	skills: string;
	cwd: string;
	terminal: string;
	memory: string;
	compaction: string;
	rounds: string;
	calls: string;
	roundDuration: string;
	totalDuration: string;
	command: string;
	link: string;
	separator: string;
}

const UNICODE_ICONS: IconSet = {
	provider: "◈",
	model: "◆",
	thinking: "◇",
	git: "⑂",
	branch: "⑂",
	changes: "±",
	insertions: "+",
	deletions: "−",
	status: "●",
	staged: "+",
	unstaged: "*",
	untracked: "?",
	conflicts: "!",
	ahead: "↑",
	behind: "↓",
	sha: "#",
	origin: "⊙",
	upstream: "↑",
	fork: "⑂",
	root: "⌂",
	worktree: "▣",
	input: "↑",
	output: "↓",
	cache: "▤",
	cacheHit: "◉",
	total: "Σ",
	speed: "»",
	speedInput: "↑/s",
	speedOutput: "↓/s",
	speedTotal: "Σ/s",
	context: "▰",
	clock: "◷",
	session: "▤",
	skills: "✦",
	cwd: "▸",
	terminal: "▭",
	memory: "▦",
	compaction: "⇲",
	rounds: "⟳",
	calls: "⇄",
	roundDuration: "⧗",
	totalDuration: "⧖",
	command: "$",
	link: "↗",
	separator: "│",
};

const NERD_ICONS: IconSet = {
	provider: "\uF0C2",
	model: "\uF0AD",
	thinking: "\uF0EB",
	git: "\uE702",
	branch: "\uE725",
	changes: "\uF044",
	insertions: "\uF067",
	deletions: "\uF068",
	status: "\uF111",
	staged: "\uF067",
	unstaged: "\uF069",
	untracked: "\uF128",
	conflicts: "\uF071",
	ahead: "\uF062",
	behind: "\uF063",
	sha: "\uF02A",
	origin: "\uF0C1",
	upstream: "\uF0C2",
	fork: "\uF126",
	root: "\uF015",
	worktree: "\uF0A0",
	input: "\uF062",
	output: "\uF063",
	cache: "\uF1C0",
	cacheHit: "\uF00C",
	total: "\uF02D",
	speed: "\uF0E7",
	speedInput: "\uF062/s",
	speedOutput: "\uF063/s",
	speedTotal: "\uF02D/s",
	context: "\uF0C8",
	clock: "\uF017",
	session: "\uF133",
	skills: "\uF0EB",
	cwd: "\uF07B",
	terminal: "\uF120",
	memory: "\uF2DB",
	compaction: "\uF0E2",
	rounds: "\uF021",
	calls: "\uF0EC",
	roundDuration: "\uF252",
	totalDuration: "\uF253",
	command: "\uF120",
	link: "\uF08E",
	separator: "\uE0B1",
};

const ASCII_ICONS: IconSet = {
	provider: "P",
	model: "M",
	thinking: "T",
	git: "git",
	branch: "git",
	changes: "+/-",
	insertions: "+",
	deletions: "-",
	status: "*",
	staged: "+",
	unstaged: "*",
	untracked: "?",
	conflicts: "!",
	ahead: "^",
	behind: "v",
	sha: "#",
	origin: "o",
	upstream: "u",
	fork: "f",
	root: "~",
	worktree: "w",
	input: "^",
	output: "v",
	cache: "c",
	cacheHit: "%",
	total: "T",
	speed: "/s",
	speedInput: "^/s",
	speedOutput: "v/s",
	speedTotal: "T/s",
	context: "ctx",
	clock: "t",
	session: "S",
	skills: "K",
	cwd: "cwd",
	terminal: "W",
	memory: "mem",
	compaction: "cmp",
	rounds: "rnd",
	calls: "call",
	roundDuration: "rt",
	totalDuration: "tt",
	command: "$",
	link: "->",
	separator: "|",
};

export function resolveIcons(mode: IconMode): IconSet {
	const override = process.env.PI_ME_TUI_ICONS;
	if (override === "nerd" || override === "unicode" || override === "ascii") {
		return iconSet(override);
	}
	return iconSet(mode === "auto" ? "unicode" : mode);
}

export function iconSet(mode: Exclude<IconMode, "auto">): IconSet {
	if (mode === "nerd") return NERD_ICONS;
	if (mode === "ascii") return ASCII_ICONS;
	return UNICODE_ICONS;
}

export const ICON_MODES: Array<{ value: IconMode; label: { zh: string; en: string } }> = [
	{ value: "auto", label: { zh: "自动（Unicode）", en: "Auto (Unicode)" } },
	{ value: "unicode", label: { zh: "Unicode", en: "Unicode" } },
	{ value: "nerd", label: { zh: "Nerd Font", en: "Nerd Font" } },
	{ value: "ascii", label: { zh: "ASCII", en: "ASCII" } },
];
