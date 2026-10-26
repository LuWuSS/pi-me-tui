# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Thinking effort values use the English level names (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) in both languages
- The default layout renders Git change counts without a label, labels the two current-input token widgets with `本轮` and the session-input token widget with `总计`, and centers the session name between flex spacers
- Global bold now only sets the bold attribute instead of repainting the widget color, and glow lifts the color by 22% without implying bold, so the two toggles are independent and stack
- Bold and glow strengths are configurable: bold lifts the label by 15% (0-100) so CJK prefixes still change where the terminal does not synthesize bold, and glow uses a 1-100 strength (default 30) for label and value
- The color picker lists the named colors before the theme tokens (8 basic, then 8 bright) and renders every color name in its own color

### Fixed

- Configuration parse failures now show a warning instead of silently falling back to defaults
- Documented `--approve` (`-a`) for removing a project-level package when the project is not trusted
- Glow no longer flattens a widget value's own ANSI colors or drops OSC 8 hyperlinks

## [0.1.0]

### Added

- Three-line default statusline with a flex-split left/right layout
- 58 widgets across core, Git, tokens, speed, context, session, environment, custom, and layout categories
- Powerline themes (7 built-in), custom separators, start/end caps, inverted backgrounds, and auto-align
- Global style overrides: foreground/background, bold, dim, glow, padding side, icons, color level, flex mode
- Interactive `/me-tui` editor: add, duplicate, replace, delete, reorder, search, relabel, per-widget options, live preview
- Color picker with default, theme tokens, named colors, and custom hex/rgb/ansi values
- JSON config import/export with a diff preview; new shell commands are shown in full and require confirmation
- Token accounting, cache hit rate, TTFT-based input/output speed, context bars, Git status/worktree details
- Session stats: clock, rounds, model calls, current round time, total round time, compactions
- `hideWhenEmpty` semantics per widget, plus `hideEmpty: false` to force zero values to show
- Terminal-width aware truncation that drops whole low-priority widgets instead of cutting values

[Unreleased]: https://github.com/LuWuSS/pi-me-tui/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/LuWuSS/pi-me-tui/releases/tag/v0.1.0
