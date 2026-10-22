import type { GitInfo, WidgetDefinition, WidgetItem, WidgetRenderContext } from "../types.ts";
import { branchWebUrl } from "../git.ts";
import { formatCount, gitInfo, hideWhenZero, iconText, signed } from "./shared.ts";
import { metadataBoolean, osc8Link } from "../utils.ts";

function repoPart(info: GitInfo, item: WidgetItem, prefix: "origin" | "upstream"): string | null {
	const owner = prefix === "origin" ? info.originOwner : info.upstreamOwner;
	const repo = prefix === "origin" ? info.originRepo : info.upstreamRepo;
	if (!owner || !repo) return null;
	const part = item.metadata?.part ?? "full";
	if (part === "owner") return owner;
	if (part === "repo") return repo;
	return `${owner}/${repo}`;
}

function worktreeSummary(info: GitInfo): string {
	if (info.worktree.mode === "bare") return "bare";
	return `${info.worktree.mode}:${info.worktree.name}`;
}

function branchText(info: GitInfo, item: WidgetItem, icon: string): string | null {
	const branch = info.branch || (info.sha ? `(${info.sha})` : "");
	if (!branch) return null;
	const text = icon ? `${icon} ${branch}` : branch;
	if (metadataBoolean(item, "link", true)) {
		const url = branchWebUrl(info);
		if (url) return osc8Link(text, url);
	}
	return text;
}

function aheadBehindText(info: GitInfo, item: WidgetItem): string | null {
	if (!info.hasUpstream) {
		return metadataBoolean(item, "showNone", false) ? "no upstream" : null;
	}
	if (info.ahead === 0 && info.behind === 0) {
		return metadataBoolean(item, "showZero", false) ? "0" : null;
	}
	const parts: string[] = [];
	if (info.ahead > 0) parts.push(`↑${formatCount(info.ahead)}`);
	if (info.behind > 0) parts.push(`↓${formatCount(info.behind)}`);
	return parts.join("") || null;
}

export const gitWidgets: WidgetDefinition[] = [
	{
		type: "git-branch",
		category: "git",
		name: { zh: "Git 分支", en: "Git branch" },
		description: { zh: "当前分支名，分离 HEAD 时显示短 SHA", en: "Current branch, or short SHA when detached" },
		defaultColor: "magenta",
		defaultLabel: { zh: "分支: ", en: "branch: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 8,
		options: [
			{
				key: "link",
				kind: "boolean",
				label: { zh: "GitHub 链接", en: "GitHub link" },
				description: { zh: "把分支渲染成可点击链接", en: "Render the branch as a clickable link" },
				field: "metadata.link",
			},
		],
		render: (item, rc) => {
			const info = gitInfo(rc);
			return info ? branchText(info, item, rc.icons.branch) : null;
		},
	},
	{
		type: "git-changes",
		category: "git",
		name: { zh: "Git 变更", en: "Git changes" },
		description: { zh: "未提交的新增/删除行数汇总", en: "Uncommitted insertions/deletions" },
		defaultColor: "yellow",
		defaultLabel: { zh: "变更: ", en: "changes: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 7,
		render: (item, rc) => {
			const info = gitInfo(rc);
			if (!info) return null;
			if (info.insertions === 0 && info.deletions === 0) return null;
			const value = `(+${formatCount(info.insertions)},-${formatCount(info.deletions)})`;
			return value;
		},
	},
	{
		type: "git-insertions",
		category: "git",
		name: { zh: "Git 新增", en: "Git insertions" },
		description: { zh: "未提交的新增行数", en: "Uncommitted inserted lines" },
		defaultColor: "success",
		defaultLabel: { zh: "新增: ", en: "added: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 6,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => {
			const info = gitInfo(rc);
			if (!info || hideWhenZero(item, info.insertions)) return null;
			return `+${formatCount(info.insertions)}`;
		},
	},
	{
		type: "git-deletions",
		category: "git",
		name: { zh: "Git 删除", en: "Git deletions" },
		description: { zh: "未提交的删除行数", en: "Uncommitted deleted lines" },
		defaultColor: "error",
		defaultLabel: { zh: "删除: ", en: "deleted: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 6,
		defaultItem: { hideEmpty: true },
		render: (item, rc) => {
			const info = gitInfo(rc);
			if (!info || hideWhenZero(item, info.deletions)) return null;
			return `-${formatCount(info.deletions)}`;
		},
	},
	{
		type: "git-status",
		category: "git",
		name: { zh: "Git 状态", en: "Git status" },
		description: { zh: "冲突/暂存/未暂存/未跟踪汇总", en: "Conflict/staged/unstaged/untracked summary" },
		defaultColor: "yellow",
		defaultLabel: { zh: "状态: ", en: "status: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 7,
		render: (_item, rc) => {
			const info = gitInfo(rc);
			if (!info) return null;
			const parts: string[] = [];
			if (info.conflicted > 0) parts.push(`!${formatCount(info.conflicted)}`);
			if (info.staged > 0) parts.push(`+${formatCount(info.staged)}`);
			if (info.unstaged > 0) parts.push(`*${formatCount(info.unstaged)}`);
			if (info.untracked > 0) parts.push(`?${formatCount(info.untracked)}`);
			return parts.join(" ") || null;
		},
	},
	{
		type: "git-staged",
		category: "git",
		name: { zh: "Git 已暂存", en: "Git staged" },
		description: { zh: "已暂存文件数", en: "Staged file count" },
		defaultColor: "success",
		defaultLabel: { zh: "暂存: ", en: "staged: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 6,
		render: (_item, rc) => {
			const info = gitInfo(rc);
			return info && info.staged > 0 ? signed(info.staged, "+") : null;
		},
	},
	{
		type: "git-unstaged",
		category: "git",
		name: { zh: "Git 未暂存", en: "Git unstaged" },
		description: { zh: "未暂存文件数", en: "Unstaged file count" },
		defaultColor: "warning",
		defaultLabel: { zh: "未暂存: ", en: "unstaged: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 6,
		render: (_item, rc) => {
			const info = gitInfo(rc);
			return info && info.unstaged > 0 ? signed(info.unstaged, "*") : null;
		},
	},
	{
		type: "git-untracked",
		category: "git",
		name: { zh: "Git 未跟踪", en: "Git untracked" },
		description: { zh: "未跟踪文件数", en: "Untracked file count" },
		defaultColor: "cyan",
		defaultLabel: { zh: "未跟踪: ", en: "untracked: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 6,
		render: (_item, rc) => {
			const info = gitInfo(rc);
			return info && info.untracked > 0 ? signed(info.untracked, "?") : null;
		},
	},
	{
		type: "git-conflicts",
		category: "git",
		name: { zh: "Git 冲突", en: "Git conflicts" },
		description: { zh: "合并冲突数量；为零时可显示 cleanText", en: "Conflict count; optional clean marker" },
		defaultColor: "error",
		defaultLabel: { zh: "冲突: ", en: "conflicts: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 7,
		options: [
			{
				key: "cleanText",
				kind: "text",
				label: { zh: "干净标记", en: "Clean marker" },
				description: { zh: "冲突为 0 时显示的文字", en: "Text shown when there are no conflicts" },
				field: "cleanText",
				placeholder: { zh: "clean", en: "clean" },
			},
		],
		render: (item, rc) => {
			const info = gitInfo(rc);
			if (!info) return null;
			if (info.conflicted > 0) return signed(info.conflicted, "!");
			return item.cleanText?.trim() || null;
		},
	},
	{
		type: "git-ahead-behind",
		category: "git",
		name: { zh: "Git 超前/滞后", en: "Git ahead/behind" },
		description: { zh: "相对 upstream 的领先/落后提交数", en: "Commits ahead/behind upstream" },
		defaultColor: "cyan",
		defaultLabel: { zh: "同步: ", en: "sync: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 6,
		options: [
			{
				key: "showNone",
				kind: "boolean",
				label: { zh: "无 upstream 提示", en: "Show no-upstream" },
				description: { zh: "没有 upstream 时显示 no upstream", en: "Show no upstream when missing" },
				field: "metadata.showNone",
			},
		],
		render: (item, rc) => {
			const info = gitInfo(rc);
			return info ? aheadBehindText(info, item) : null;
		},
	},
	{
		type: "git-sha",
		category: "git",
		name: { zh: "Git SHA", en: "Git SHA" },
		description: { zh: "简短提交哈希", en: "Short commit hash" },
		defaultColor: "brightBlack",
		defaultLabel: { zh: "SHA: ", en: "sha: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		render: (_item, rc) => iconText(rc.icons.sha, gitInfo(rc)?.sha || null),
	},
	{
		type: "git-origin",
		category: "git",
		name: { zh: "Git Origin 所有者/仓库", en: "Git origin owner/repo" },
		description: { zh: "origin 远程的 owner / repo", en: "Owner/repo of the origin remote" },
		defaultColor: "blue",
		defaultLabel: { zh: "origin: ", en: "origin: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		options: [
			{
				key: "part",
				kind: "enum",
				label: { zh: "显示部分", en: "Display part" },
				field: "metadata.part",
				values: [
					{ value: "full", label: { zh: "owner/repo", en: "owner/repo" } },
					{ value: "owner", label: { zh: "所有者", en: "Owner" } },
					{ value: "repo", label: { zh: "仓库", en: "Repo" } },
				],
			},
		],
		render: (item, rc) => {
			const info = gitInfo(rc);
			return info ? iconText(rc.icons.origin, repoPart(info, item, "origin")) : null;
		},
	},
	{
		type: "git-upstream",
		category: "git",
		name: { zh: "Git Upstream 所有者/仓库", en: "Git upstream owner/repo" },
		description: { zh: "upstream 远程的 owner / repo", en: "Owner/repo of the upstream remote" },
		defaultColor: "blue",
		defaultLabel: { zh: "upstream: ", en: "upstream: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		options: [
			{
				key: "part",
				kind: "enum",
				label: { zh: "显示部分", en: "Display part" },
				field: "metadata.part",
				values: [
					{ value: "full", label: { zh: "owner/repo", en: "owner/repo" } },
					{ value: "owner", label: { zh: "所有者", en: "Owner" } },
					{ value: "repo", label: { zh: "仓库", en: "Repo" } },
				],
			},
		],
		render: (item, rc) => {
			const info = gitInfo(rc);
			return info ? iconText(rc.icons.upstream, repoPart(info, item, "upstream")) : null;
		},
	},
	{
		type: "git-fork",
		category: "git",
		name: { zh: "Git 是否 Fork", en: "Git is fork" },
		description: { zh: "仓库是 upstream 的 fork 时显示标识", en: "Marker when the repo is a fork of upstream" },
		defaultColor: "magenta",
		defaultLabel: { zh: "仓库: ", en: "repo: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 5,
		render: (_item, rc) => (gitInfo(rc)?.isFork ? iconText(rc.icons.fork, "fork") : null),
	},
	{
		type: "git-root",
		category: "git",
		name: { zh: "Git 根目录", en: "Git root" },
		description: { zh: "仓库根目录名", en: "Repository root directory name" },
		defaultColor: "blue",
		defaultLabel: { zh: "根目录: ", en: "root: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => iconText(rc.icons.root, gitInfo(rc)?.rootName || null),
	},
	{
		type: "git-worktree",
		category: "git",
		name: { zh: "Git 工作树", en: "Git worktree" },
		description: { zh: "当前工作树摘要", en: "Current worktree summary" },
		defaultColor: "cyan",
		defaultLabel: { zh: "工作树: ", en: "worktree: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => {
			const info = gitInfo(rc);
			return info ? iconText(rc.icons.worktree, worktreeSummary(info)) : null;
		},
	},
	{
		type: "git-worktree-mode",
		category: "git",
		name: { zh: "Git 工作树模式", en: "Git worktree mode" },
		description: { zh: "main / linked / bare", en: "main / linked / bare" },
		defaultColor: "cyan",
		defaultLabel: { zh: "工作树: ", en: "worktree: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => gitInfo(rc)?.worktree.mode ?? null,
	},
	{
		type: "git-worktree-name",
		category: "git",
		name: { zh: "Git 工作树名称", en: "Git worktree name" },
		description: { zh: "工作树目录名，主工作树显示 main", en: "Worktree directory name, main for the primary tree" },
		defaultColor: "cyan",
		defaultLabel: { zh: "工作树: ", en: "worktree: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => gitInfo(rc)?.worktree.name ?? null,
	},
	{
		type: "git-worktree-branch",
		category: "git",
		name: { zh: "Git 工作树分支", en: "Git worktree branch" },
		description: { zh: "工作树分支或分离 HEAD 短 SHA", en: "Worktree branch or detached short SHA" },
		defaultColor: "magenta",
		defaultLabel: { zh: "工作树分支: ", en: "wt branch: " },
		supportsLabel: true,
		supportsRawValue: true,
		priority: 4,
		render: (_item, rc) => {
			const info = gitInfo(rc);
			if (!info) return null;
			return info.worktree.branch || info.worktree.path || info.sha || null;
		},
	},
];
