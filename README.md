# pi-me-tui

[![CI](https://github.com/LuWuSS/pi-me-tui/actions/workflows/ci.yml/badge.svg)](https://github.com/LuWuSS/pi-me-tui/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) | [简体中文](README.zh-CN.md)

A configurable multi-line statusline for the Pi coding agent. It brings the data density and visual style of `ccstatusline-zh` to Pi: 58 freely composable widgets, a three-line default layout, Powerline themes, global style overrides, and an interactive `/me-tui` editor.

## Features

- Three-line default statusline; add (after the selected widget), duplicate, remove, reorder, search, and relabel widgets
- 58 widgets in 9 categories: core, Git, tokens, speed, context, session, environment, custom, layout
- Powerline with 7 built-in themes, custom separators, start/end caps, inverted backgrounds, and auto-align
- Global overrides for foreground/background, bold, dim, glow, and padding side (global values take precedence over per-widget settings)
- Terminal options for color level, icon mode, refresh interval, and Git/custom-command/width cache TTLs
- JSON config import/export with a diff preview; newly added shell commands are shown in full and require confirmation
- Cache hit rate, input/output/total speed in compact t/s units (e.g. 8.44kt/s), context progress bars, Git ahead/behind, and worktree details
- Opening `/me-tui` reinstalls this extension's footer so it wins over other footer extensions

## Requirements

- Pi 1.0 or newer
- Node.js 22.19 or newer

## Install

Install from GitHub into your personal Pi settings:

```bash
pi install git:github.com/LuWuSS/pi-me-tui
```

To install into the current project instead, add `--local` (`-l`). Project packages load after Pi grants project trust:

```bash
pi install --local git:github.com/LuWuSS/pi-me-tui
```

From a local checkout:

```bash
git clone https://github.com/LuWuSS/pi-me-tui.git
pi install ./pi-me-tui
```

To try a local checkout for one Pi run without writing it to settings:

```bash
pi -e ./pi-me-tui
```

Confirm that the package is configured:

```bash
pi list
```

Restart Pi after installation. The extension installs a footer and shows the statusline at the bottom of the terminal.

## Use

The statusline renders automatically. Run `/me-tui` inside Pi to open the editor:

- **Edit statusline** manages lines and widgets: add, duplicate, replace, delete, move, search, edit label prefixes, and set per-widget options
- **Powerline**, **Global style**, and **Terminal/refresh** configure separators, themes, colors, icons, refresh interval, and cache TTLs
- **Export config** and **Import config** move settings as JSON; import shows a diff and asks for confirmation before adding new shell commands
- **Restore defaults** brings back the three-line layout described below

Changes preview while you navigate; `Enter` confirms, and `Esc` goes back. See [Editor](#editor) for the full key map.

## Update

```bash
pi update --extensions                     # update all installed packages
pi update git:github.com/LuWuSS/pi-me-tui  # update only this package
```

`pi update` without a target updates Pi itself.

## Uninstall

```bash
pi remove git:github.com/LuWuSS/pi-me-tui
```

`pi uninstall` is an alias for `pi remove`. Add `--local` (`-l`) if the package was installed into project settings; if Pi reports that the project is not trusted, also add `--approve` (`-a`). For a local install, pass the same path you gave to `pi install`:

```bash
pi remove ./pi-me-tui
```

Restart Pi after removal. The extension's settings remain in `~/.pi/agent/me-tui.json`; delete that file to remove them too.

## Default layout

The default language is Chinese, with three lines:

```text
供应商: ... │ 模型: ... │ 思考: ... │ 分支: ... (+42,-7)   本轮  ： ... │ 缓存: ... 命中: ... | ↑/s ... ↓/s ... Σ/s ...
上下文: [████░░░░] 12.5% │ 压缩: 2   总计  ： ... │ 缓存: ... 命中: ... | ↑/s ... ↓/s ... Σ/s ...
时钟: ... │ 本轮: ... │ 总时长: ... │ 对话: ... │ 调用: ...    会话: ...    内存: ... │ 技能: ... │ 目录: ...
```

The spaces between the left and right groups are flex widgets, so the right side stays flush at any width. Every widget can be replaced, moved, or removed in `/me-tui`, and Restore defaults brings back this layout.

## Editor

Main menu:

- Edit statusline: manage lines and widgets, add/duplicate/delete/move/search, edit labels, widget options; after adding, Esc returns to the widget list and category picker to add more; r replaces the highlighted widget with another type from the categories
- Powerline: enable, theme, separators, background inversion, start/end caps, auto-align
- Global style: colors, bold, dim, glow, padding, icons, color level, flex mode
- Colors are picked from a list (default, theme tokens, named colors, custom hex/rgb/ansi); max width 0 clears the limit
- The overlay paints the full terminal height with `customMessageBg`, so the chat behind it stays hidden
- Highlighted options preview live (colors, icons, language, theme, labels, width); Enter commits, Esc goes back without saving
- Settings fill the terminal and preview at statusline width; global bold/dim/glow/padding and Powerline separators preview immediately
- Bold brightens the whole item including its label; glow brightens it further (70%). Line alignment is configurable per line (default split, left, center, right)
- Terminal/refresh: refresh interval, Git cache, custom-command cache, terminal-width cache
- Export config to JSON
- Import config with a diff preview; new shell commands are displayed and cancellation is the default
- Restore defaults

Keys:

| Key | Action |
| --- | --- |
| `Up` `Down` | Navigate |
| `Enter` | Select/confirm |
| `a` | Add widget |
| `d` | Delete widget |
| `m` | Move mode, `Up`/`Down`, `Enter` to finish |
| `e` | Edit label prefix, `Tab` restores default, empty hides |
| `w` | Widget options |
| `h` | Toggle hide-when-empty |
| `/` | Search widgets by name inside the current line |
| `Tab` | Switch line |
| `n` / `x` | Add line / remove current line |
| `q` | Go back one level (quits from the main menu) |

## Widgets

### Core (3)

Provider, model, thinking effort.

### Git (19)

Branch, changes, insertions, deletions, status, staged, unstaged, untracked, conflicts, ahead/behind, SHA, origin owner/repo, upstream owner/repo, fork, root, worktree, worktree mode, worktree name, worktree branch.

- Branch supports OSC8 clickable links derived from the origin URL (GitLab uses the `/-/tree/` path)
- Ahead/behind comes from the `[ahead N, behind M]` suffix of `git status --porcelain=v1 --branch`
- Worktree details come from `git worktree list --porcelain`
- PR and CI widgets are not included; the extension does not call `gh` or `glab`

### Tokens (9)

Current input/output/cache/cache-hit-rate, session input/output/cache/cache-hit-rate, and session total. If a provider reports no cache activity, the cache widgets show `0` / `0%` once the session has usage instead of disappearing.

Cache hit rate = cache read / (input + cache read). pi-ai normalizes `input` to exclude cache reads and writes, so the denominator equals the full prompt (`input + cacheRead + cacheWrite`) across OpenAI Chat, OpenAI Responses, and Anthropic.

“Current” means the current agent run (after the latest user message) by default; it can be switched to the last turn. “Session” covers all entries.

Current-scope widgets hide themselves while their value is 0 (so a fresh session stays uncluttered). Turn off “Hide when empty” in the widget options to always show them.

### Speed (6)

Current and session input/output/total speed, shown as `8.44kt/s` / `51.6t/s`, prefixed by `↑/s` / `↓/s` / `Σ/s` so they never collide with the token icons.

The three speeds do not share one denominator:

- Input speed = prompt tokens / TTFT, where prompt tokens = `input + cacheWrite + cacheRead` (the full prompt sent to the provider)
- Output speed = output tokens / decode time, where decode time = total duration − TTFT
- Total speed = all tokens / total duration

TTFT runs from request start to the first `text` / `thinking` / `toolcall` content block, collected from `message_update`. TTFT is not persisted in the session file, so resumed sessions (`pi -c`) have no TTFT samples; input/output speeds then fall back to the full response duration instead of disappearing. The same fallback applies to non-streaming responses. Total speed always works. Aggregated speed is Σ tokens / Σ time, never an average of per-response speeds. `toolResult` / `compaction` usage counts toward token totals but not toward speed timing.

### Context (5)

Context length, percentage, usable percentage (80% of the window by default), progress bar, and the session compaction count.

Bar modes: `progress`, `progress-short`, `slider`, `slider-only`.

### Session (7)

Session clock, session name, skills, conversation rounds, model calls, current round time, and total round time. A round starts at a user message and ends with the last reply of that turn; only rounds with at least one assistant reply are counted. Model calls count assistant messages (one per model response). Total round time sums every round and excludes idle time between rounds. The skills widget shows the latest or recent skill / MCP / extension tool invocation.

### Environment (3)

Current directory, terminal width, system memory.

### Custom (4)

Custom text, custom command, custom symbol, link.

Custom commands run in the session cwd, cache for 0 seconds by default (so they run on every refresh), and support timeout, max width, and ANSI color preservation. Commands run through the platform shell (`cmd.exe` on Windows, `/bin/sh` elsewhere).

### Layout (2)

Separator, flex separator.

On narrow terminals the renderer keeps the left-hand content and drops whole low-priority widgets from the right (token counts, cache hit rate, …) instead of cutting values into ellipses.

## Config

Default path:

```text
~/.pi/agent/me-tui.json
```

It is created on first run and stores the version, language, icons, color level, lines/widgets, Powerline settings, global overrides, cache and refresh values.

## Coexisting with other footer extensions

Pi renders one footer at a time. `pi-open-tui` also installs a footer; whichever installs last wins.

This extension does not disable `pi-open-tui`. Opening `/me-tui` reinstalls its own footer, so pi-me-tui is normally visible after configuration. To pin one extension, disable the other in `pi config`, or set:

```json
{
  "enabled": false
}
```

## Development

```bash
npm install
npm run check      # typecheck + tests
npm pack --dry-run # inspect the published file list
pi -e .            # load the local checkout in Pi
```

Tests cover config normalization, Git parsing, token/speed math, rendering, the widget registry, and basic TUI interaction. CI runs the same checks on Linux and Windows with Node 22 and 24. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Notes

- This version does not install a custom editor; configuration is handled by `/me-tui`
- Git PR and CI widgets are not included; the extension does not call `gh` or `glab`
- All Git, token, and speed data is computed locally; no network requests are made

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, the checks CI runs, and the commit style.

## License

MIT. Some design ideas come from `ccstatusline-zh` (MIT) and `pi-open-tui` (MIT). See `NOTICE`.
