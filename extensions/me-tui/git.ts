import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitInfo, GitWorktreeInfo } from "./types.ts";
import { basenamePath, normalizeSlash } from "./utils.ts";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 2500;
const MAX_BUFFER = 1024 * 1024;

export interface GitReadOptions {
	readStats?: boolean;
	readOrigin?: boolean;
	readUpstream?: boolean;
	readWorktree?: boolean;
}

export interface ParsedPorcelain {
	branch: string;
	hasUpstream: boolean;
	upstreamName: string;
	ahead: number;
	behind: number;
	staged: number;
	unstaged: number;
	untracked: number;
	conflicted: number;
	modified: number;
	deleted: number;
	renamed: number;
	added: number;
}

export interface ParsedRemote {
	host: string;
	owner: string;
	repo: string;
	webUrl: string;
}

export interface ParsedWorktree {
	path: string;
	sha: string;
	branch?: string;
	bare: boolean;
	detached: boolean;
}

export function emptyGitInfo(): GitInfo {
	return {
		isRepo: false,
		root: "",
		rootName: "",
		branch: "",
		sha: "",
		ahead: 0,
		behind: 0,
		hasUpstream: false,
		upstreamName: "",
		originOwner: "",
		originRepo: "",
		originWebUrl: "",
		upstreamOwner: "",
		upstreamRepo: "",
		isFork: false,
		staged: 0,
		unstaged: 0,
		untracked: 0,
		conflicted: 0,
		modified: 0,
		deleted: 0,
		renamed: 0,
		added: 0,
		insertions: 0,
		deletions: 0,
		worktree: { mode: "main", name: "main", isMain: true },
	};
}

export async function runGit(args: string[], cwd: string): Promise<string | undefined> {
	try {
		const result = await execFileAsync("git", args, {
			cwd,
			timeout: GIT_TIMEOUT_MS,
			maxBuffer: MAX_BUFFER,
			windowsHide: true,
		});
		return result.stdout;
	} catch (error) {
		const stdout = (error as { stdout?: string }).stdout;
		return typeof stdout === "string" && stdout.length > 0 ? stdout : undefined;
	}
}

export async function readGitInfo(cwd: string, options: GitReadOptions = {}): Promise<GitInfo> {
	const rootOutput = await runGit(["rev-parse", "--show-toplevel"], cwd);
	const root = rootOutput?.trim();
	if (!root) return emptyGitInfo();

	const readOrigin = options.readOrigin === true;
	const readUpstream = options.readUpstream === true;
	const readWorktree = options.readWorktree === true;
	const readStats = options.readStats !== false;

	const [branchOutput, shaOutput, statusOutput, originUrl, upstreamUrl, worktreeOutput] =
		await Promise.all([
			runGit(["symbolic-ref", "--short", "HEAD"], cwd),
			runGit(["rev-parse", "--short=7", "HEAD"], cwd),
			runGit(["status", "--porcelain=v1", "--branch"], cwd),
				readOrigin ? runGit(["remote", "get-url", "origin"], cwd) : Promise.resolve(undefined),
			readUpstream ? runGit(["remote", "get-url", "upstream"], cwd) : Promise.resolve(undefined),
			readWorktree ? runGit(["worktree", "list", "--porcelain"], cwd) : Promise.resolve(undefined),
		]);

	const parsed = parsePorcelainV1(statusOutput ?? "");
	const ahead = parsed.ahead;
	const behind = parsed.behind;

	const origin = parseRemoteUrl(originUrl?.trim());
	const upstream = parseRemoteUrl(upstreamUrl?.trim());
	const isFork =
		origin !== undefined &&
		upstream !== undefined &&
		`${origin.owner}/${origin.repo}`.toLowerCase() !== `${upstream.owner}/${upstream.repo}`.toLowerCase();

	const worktree = readWorktree
		? resolveWorktree(parseWorktreeList(worktreeOutput ?? ""), root, parsed.branch)
		: { mode: "main" as const, name: "main", isMain: true, branch: parsed.branch, path: root };

	let insertions = 0;
	let deletions = 0;
	if (readStats) {
		const [unstagedDiff, stagedDiff] = await Promise.all([
			runGit(["diff", "--numstat"], cwd),
			runGit(["diff", "--cached", "--numstat"], cwd),
		]);
		const unstagedStats = parseNumstat(unstagedDiff ?? "");
		const stagedStats = parseNumstat(stagedDiff ?? "");
		insertions = unstagedStats.insertions + stagedStats.insertions;
		deletions = unstagedStats.deletions + stagedStats.deletions;
	}

	const branch = (branchOutput?.trim() || parsed.branch || "").replace(/^HEAD$/, "");
	return {
		isRepo: true,
		root,
		rootName: basenamePath(root),
		branch,
		sha: shaOutput?.trim() ?? "",
		ahead,
		behind,
		hasUpstream: parsed.hasUpstream,
		upstreamName: parsed.upstreamName,
		originOwner: origin?.owner ?? "",
		originRepo: origin?.repo ?? "",
		originWebUrl: origin?.webUrl ?? "",
		upstreamOwner: upstream?.owner ?? "",
		upstreamRepo: upstream?.repo ?? "",
		isFork,
		staged: parsed.staged,
		unstaged: parsed.unstaged,
		untracked: parsed.untracked,
		conflicted: parsed.conflicted,
		modified: parsed.modified,
		deleted: parsed.deleted,
		renamed: parsed.renamed,
		added: parsed.added,
		insertions,
		deletions,
		worktree,
	};
}

export function parsePorcelainV1(output: string): ParsedPorcelain {
	const result: ParsedPorcelain = {
		branch: "",
		hasUpstream: false,
		upstreamName: "",
		ahead: 0,
		behind: 0,
		staged: 0,
		unstaged: 0,
		untracked: 0,
		conflicted: 0,
		modified: 0,
		deleted: 0,
		renamed: 0,
		added: 0,
	};
	const lines = output.split(/\r?\n/);
	for (const line of lines) {
		if (!line) continue;
		if (line.startsWith("## ")) {
			parseBranchHeader(line.slice(3), result);
			continue;
		}
		if (line.startsWith("!! ")) continue;
		const x = line[0] ?? " ";
		const y = line[1] ?? " ";
		if (x === "?" && y === "?") {
			result.untracked += 1;
			continue;
		}
		if (x === " " && y === " ") continue;
		const code = x + y;
		if (isConflictCode(code)) {
			result.conflicted += 1;
			continue;
		}
		if (x !== " ") result.staged += 1;
		if (y !== " ") result.unstaged += 1;
		if (x === "M" || y === "M") result.modified += 1;
		if (x === "D" || y === "D") result.deleted += 1;
		if (x === "R" || y === "R") result.renamed += 1;
		if (x === "A" || y === "A") result.added += 1;
	}
	return result;
}

function parseBranchHeader(header: string, result: ParsedPorcelain): void {
	const aheadMatch = /\[ahead (\d+)(?:, behind (\d+))?\]/.exec(header);
	const behindOnly = /\[behind (\d+)\]/.exec(header);
	if (aheadMatch) {
		result.ahead = Number(aheadMatch[1]);
		if (aheadMatch[2]) result.behind = Number(aheadMatch[2]);
	} else if (behindOnly) {
		result.behind = Number(behindOnly[1]);
	}
	const noCommits = /^No commits yet on (.+)$/.exec(header);
	if (noCommits) {
		result.branch = noCommits[1].trim();
		return;
	}
	const withoutCounts = header.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
	if (withoutCounts === "HEAD (no branch)" || withoutCounts === "HEAD") {
		result.branch = "";
		return;
	}
	const trackingIndex = withoutCounts.indexOf("...");
	if (trackingIndex >= 0) {
		result.branch = withoutCounts.slice(0, trackingIndex).trim();
		result.upstreamName = withoutCounts.slice(trackingIndex + 3).trim();
		result.hasUpstream = result.upstreamName.length > 0;
		return;
	}
	result.branch = withoutCounts.trim();
}

function isConflictCode(code: string): boolean {
	return code === "DD" || code === "AU" || code === "UD" || code === "UA" || code === "DU" || code === "AA" || code === "UU";
}

export function parseNumstat(output: string): { insertions: number; deletions: number } {
	let insertions = 0;
	let deletions = 0;
	for (const line of output.split(/\r?\n/)) {
		if (!line) continue;
		const parts = line.split("\t");
		if (parts.length < 2) continue;
		const added = Number(parts[0]);
		const removed = Number(parts[1]);
		if (Number.isFinite(added)) insertions += added;
		if (Number.isFinite(removed)) deletions += removed;
	}
	return { insertions, deletions };
}

export function parseRemoteUrl(url: string | undefined): ParsedRemote | undefined {
	if (!url) return undefined;
	let value = url.trim();
	if (!value) return undefined;
	if (value.startsWith("file://")) return undefined;
	let host = "";
	let path = "";
	const scpMatch = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(value);
	if (scpMatch && !value.includes("://")) {
		host = scpMatch[1];
		path = scpMatch[2];
	} else {
		try {
			const parsed = new URL(value);
			host = parsed.hostname;
			path = parsed.pathname;
		} catch {
			const slashMatch = /^(?:[^@/]+@)?([^:/]+)[/:](.+)$/.exec(value);
			if (!slashMatch) return undefined;
			host = slashMatch[1];
			path = slashMatch[2];
		}
	}
	path = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
	const parts = path.split("/").filter(Boolean);
	if (!host || parts.length < 2) return undefined;
	const repo = parts.at(-1) ?? "";
	const owner = parts.slice(0, -1).join("/");
	const webHost = host.startsWith("ssh.") ? host.slice(4) : host;
	return {
		host: webHost,
		owner,
		repo,
		webUrl: `https://${webHost}/${owner}/${repo}`,
	};
}

export function parseWorktreeList(output: string): ParsedWorktree[] {
	const entries: ParsedWorktree[] = [];
	let current: ParsedWorktree | undefined;
	const flush = (): void => {
		if (current?.path) entries.push(current);
		current = undefined;
	};
	for (const line of output.split(/\r?\n/)) {
		if (!line.trim()) {
			flush();
			continue;
		}
		if (line.startsWith("worktree ")) {
			flush();
			current = { path: line.slice(9).trim(), sha: "", bare: false, detached: false };
			continue;
		}
		if (!current) continue;
		if (line.startsWith("HEAD ")) current.sha = line.slice(5).trim();
		else if (line.startsWith("branch ")) current.branch = line.slice(7).trim().replace(/^refs\/heads\//, "");
		else if (line === "bare") current.bare = true;
		else if (line === "detached") current.detached = true;
	}
	flush();
	return entries;
}

export function resolveWorktree(
	entries: ParsedWorktree[],
	root: string,
	branch: string,
): GitWorktreeInfo {
	if (entries.length === 0) {
		return { mode: "main", name: "main", branch, isMain: true };
	}
	const normalize = (value: string): string => {
		const normalized = normalizeSlash(value).replace(/\/+$/, "");
		return process.platform === "win32" ? normalized.toLowerCase() : normalized;
	};
	const rootKey = normalize(root);
	const index = entries.findIndex((entry) => normalize(entry.path) === rootKey);
	const effectiveIndex = index >= 0 ? index : 0;
	const entry = entries[effectiveIndex];
	const isMain = effectiveIndex === 0;
	const mode = entry.bare ? "bare" : isMain ? "main" : "linked";
	return {
		mode,
		name: isMain ? "main" : basenamePath(entry.path),
		branch: entry.branch ?? (entry.detached ? entry.sha.slice(0, 7) : branch),
		path: entry.path,
		isMain,
	};
}

export function branchWebUrl(info: GitInfo): string | undefined {
	if (!info.originWebUrl || !info.branch) return undefined;
	const gitlab = /gitlab/i.test(info.originWebUrl);
	const path = gitlab ? "/-/tree" : "/tree";
	return `${info.originWebUrl}${path}/${encodeURIComponent(info.branch)}`;
}

