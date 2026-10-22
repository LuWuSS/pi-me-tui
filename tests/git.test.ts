import assert from "node:assert/strict";
import test from "node:test";
import {
	parseNumstat,
	parsePorcelainV1,
	parseRemoteUrl,
	parseWorktreeList,
	resolveWorktree,
} from "../extensions/me-tui/git.ts";

test("parsePorcelainV1 reads branch, tracking, and worktree counts", () => {
	const output = [
		"## feature/login...origin/feature/login [ahead 2, behind 1]",
		" M src/app.ts",
		"M  src/index.ts",
		"?? notes.md",
		"UU conflict.ts",
		"R  old.ts -> new.ts",
		"D  removed.ts",
	].join("\n");
	const parsed = parsePorcelainV1(output);
	assert.equal(parsed.branch, "feature/login");
	assert.equal(parsed.hasUpstream, true);
	assert.equal(parsed.upstreamName, "origin/feature/login");
	assert.equal(parsed.ahead, 2);
	assert.equal(parsed.behind, 1);
	assert.equal(parsed.staged, 3);
	assert.equal(parsed.unstaged, 1);
	assert.equal(parsed.untracked, 1);
	assert.equal(parsed.conflicted, 1);
	assert.equal(parsed.modified, 2);
	assert.equal(parsed.renamed, 1);
	assert.equal(parsed.deleted, 1);
});

test("parsePorcelainV1 handles detached and unborn branches", () => {
	const detached = parsePorcelainV1("## HEAD (no branch)\n");
	assert.equal(detached.branch, "");
	const unborn = parsePorcelainV1("## No commits yet on trunk\n");
	assert.equal(unborn.branch, "trunk");
	const local = parsePorcelainV1("## main\n");
	assert.equal(local.branch, "main");
	assert.equal(local.hasUpstream, false);
});

test("parseNumstat sums text diffs and ignores binary entries", () => {
	const output = ["12\t3\tsrc/a.ts", "0\t9\tsrc/b.ts", "-\t-\timage.png", ""].join("\n");
	assert.deepEqual(parseNumstat(output), { insertions: 12, deletions: 12 });
});

test("parseRemoteUrl supports SSH, HTTPS, and SCP forms", () => {
	assert.deepEqual(parseRemoteUrl("git@github.com:acme/pi-me-tui.git"), {
		host: "github.com",
		owner: "acme",
		repo: "pi-me-tui",
		webUrl: "https://github.com/acme/pi-me-tui",
	});
	assert.equal(
		parseRemoteUrl("https://gitlab.com/group/sub/repo.git")?.webUrl,
		"https://gitlab.com/group/sub/repo",
	);
	assert.equal(parseRemoteUrl("ssh://git@ssh.github.com/acme/repo.git")?.host, "github.com");
	assert.equal(parseRemoteUrl("file:///tmp/repo"), undefined);
	assert.equal(parseRemoteUrl(""), undefined);
});

test("worktree list and resolution identify the main and linked worktrees", () => {
	const output = [
		"worktree C:/work/repo",
		"HEAD aaaaaaa",
		"branch refs/heads/main",
		"",
		"worktree C:/work/repo-feature",
		"HEAD bbbbbbb",
		"branch refs/heads/feature",
		"",
	].join("\n");
	const entries = parseWorktreeList(output);
	assert.equal(entries.length, 2);
	assert.equal(entries[0].branch, "main");
	const linked = resolveWorktree(entries, "C:/work/repo-feature", "feature");
	assert.equal(linked.mode, "linked");
	assert.equal(linked.name, "repo-feature");
	assert.equal(linked.branch, "feature");
	assert.equal(linked.isMain, false);
	const main = resolveWorktree(entries, "C:/work/repo", "main");
	assert.equal(main.mode, "main");
	assert.equal(main.name, "main");
	assert.equal(main.isMain, true);
});
