# Contributing to pi-me-tui

Thanks for taking the time to help. This page covers the development setup, the checks that CI runs, and the conventions used in this repo.

## Requirements

- Node.js 22.19 or newer
- Pi 1.0 or newer (`npm install -g @earendil-works/pi`) to run the extension for real

## Setup

```bash
git clone https://github.com/LuWuSS/pi-me-tui.git
cd pi-me-tui
npm install
```

Run the extension without installing it into your Pi settings:

```bash
pi -e .
```

Or install a local copy:

```bash
pi install .
```

## Checks

CI runs these on Linux and Windows with Node 22 and 24. Run them before opening a pull request:

```bash
npm run typecheck
npm test
npm pack --dry-run
```

`npm run check` runs typecheck and tests together.

There is no build step: the extension ships TypeScript sources and Pi loads them directly.

## Layout

```text
extensions/me-tui/
  index.ts          extension entry: state refresh, events, footer registration
  config.ts         default config, normalization, config file path
  types.ts          shared types (config, state, widget definitions)
  registry.ts       widget registry and categories
  render.ts         line layout, truncation, powerline rendering
  colors.ts         color specs, theme tokens, ANSI helpers
  usage.ts          token/speed/session stats aggregation
  git.ts            git data collection and parsing
  icons.ts          unicode / nerd font / ascii icon sets
  state.ts          session-derived state helpers
  utils.ts          formatting helpers
  widgets/          one file per category, each exporting widget definitions
  settings/         `/me-tui` overlay UI and command registration
tests/              node:test suites, one file per module
```

## Conventions

- **No comments unless they explain why.** The code should read on its own.
- Prefer plain functions and small modules over classes; keep the widget definitions declarative.
- Every widget renders through `WidgetRenderContext`, so it must stay side-effect free and fast — the statusline refreshes once per second.
- New widgets need: a definition in the matching `widgets/*.ts` file, an icon in all three sets in `icons.ts`, a registry test count update, and a test in `tests/widgets.test.ts`.
- Config changes must be backward compatible. `normalizeConfig` fills in defaults for missing fields, and unknown widget types are dropped rather than throwing.
- Never add network calls or write outside `~/.pi/agent/me-tui.json`.
- Keep hand-written strings bilingual: every user-facing label uses `{ zh, en }` and follows `config.language`.

## Tests

Tests use the built-in `node:test` runner against the TypeScript sources directly, so no transpiler is involved.

```bash
npm test
node --test tests/usage.test.ts   # single file
```

When adding a feature, include a test that fails without your change. Tests for formatting/rendering should assert on `stripAnsi(...)` output so they stay readable.

## Commit messages

Short imperative subject lines, optionally scoped:

```text
feat(widgets): add conversation round counters
fix(usage): fall back to duration speed after resume
docs: document the GitHub install path
```

## Pull requests

- Keep each PR focused on one change.
- Describe what you changed and why; include a before/after rendering snippet for visual changes.
- Make sure `npm run check` passes.
- Screenshots are welcome for layout or color changes.

## Releasing

1. Bump `version` in `package.json` and add a `CHANGELOG.md` entry.
2. Commit, then tag: `git tag v0.1.0 && git push --tags`.
3. The `Publish` workflow publishes to npm when `NPM_TOKEN` is configured; otherwise run `npm publish --access public`.

## License

By contributing you agree that your changes are released under the MIT License (see `LICENSE`).
