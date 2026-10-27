# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Context window widget showing the model's limit as `[200K]` / `[1M]`, rounded to a whole number with K as the smallest unit
- The color picker offers a plain palette (赤橙黄绿青蓝紫 plus six mixed bright colors) and ten theme colors, all named in Chinese

### Changed

- Thinking effort values use the English level names (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) in both languages
- The default layout renders Git change counts without a label, labels the two current-input token widgets with `本轮` and the session-input token widget with `总计`, and centers the session name between flex spacers
- Global bold now only sets the bold attribute instead of repainting the widget color, and glow lifts the color by 22% without implying bold, so the two toggles are independent and stack
- Bold and glow strengths are configurable: bold lifts the whole item by 15% (0-100, the "foreground lift") so it still reads as emphasis where the terminal has no CJK bold face, and glow uses a 1-100 strength (default 30) for label and value
- The settings overlay keeps the terminal's own background instead of painting `customMessageBg`, so the preview matches the real statusline

### Fixed

- A widget color now applies to values that only carry a hyperlink, such as the Git branch, instead of being silently ignored
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
