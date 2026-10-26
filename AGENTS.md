# AGENTS.md

本文档面向在本仓库中工作的编码 Agent。人类贡献者还应阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 项目简介

pi-me-tui 是 Pi coding agent 的扩展，用于渲染可配置的多行状态栏：9 大类共 58 个组件、Powerline 主题、全局样式覆盖，以及交互式 `/me-tui` 配置界面。

- Node.js 22.19 或更高版本（CI 覆盖 22 和 24）
- 实际运行需要 Pi 1.0 或更高版本
- 无构建步骤：Pi 和 `node --test` 直接加载 TypeScript 源码（`allowImportingTsExtensions`、`noEmit`）

## 常用命令

```bash
npm install
npm run typecheck                  # 类型检查（tsc --noEmit）
npm test                           # node:test 测试套件
npm run check                      # 类型检查 + 测试
npm pack --dry-run                 # 查看打包文件清单
node --test tests/usage.test.ts    # 运行单个测试文件
pi -e .                            # 从当前检出直接试运行扩展
```

`package.json` 的 `npm test` 显式列出了测试文件。新增测试文件必须加入该列表，否则 CI 不会运行它。

`pi install .` 会修改真实的 Pi 设置；只做试运行时优先使用 `pi -e .`。

CI（`.github/workflows/ci.yml`）在 Ubuntu 和 Windows、Node 22 和 24 上运行类型检查、测试和 `npm pack --dry-run`。

## 目录结构

- `extensions/me-tui/index.ts` — 扩展入口：配置加载、状态刷新、事件处理、footer 生命周期
- `config.ts` — 内置默认配置、归一化、配置读写（`~/.pi/agent/me-tui.json`）
- `render.ts` — 行布局、flex 对齐、截断、Powerline 渲染
- `widgets/*.ts` — 按分类分组的声明式组件定义
- `registry.ts` — 组件注册表与分类顺序
- `settings/` — `/me-tui` 覆盖层界面与命令注册
- `usage.ts`、`git.ts`、`state.ts`、`icons.ts`、`colors.ts`、`utils.ts` — 数据采集与展示辅助模块
- `tests/` — 每个模块一个测试套件；`tests/helpers.ts` 提供测试替身

## 本地参考资料（不纳入版本控制）

以下内容仅作为本地参考放在仓库根目录。它们已被 `.gitignore` 排除，不在 `package.json.files` 中，运行时不得导入，不得复制进 `extensions/`，测试也不得引用：

- `ccstatusline-zh/` — Claude Code 的 statusline 实现，用作视觉效果和数据口径参考；它不是 Pi 插件。
- `pi-open-tui/` — Pi package/extension，用作扩展结构参考。
- `PI_PLUGIN_GUIDE.md` — Pi 插件开发规范指南。
- `pi-me-tui需求文档.md` — 项目初始需求文档。

这两个目录各自带有 `.git`，独立演进。不要提交或打包它们，也不要在 pi-me-tui 的变更中改写其内容。

## 运行模型

- 只在 TUI 上下文中安装 footer（`ctx.hasUI` 且 `mode === "tui"`）。非 TUI 运行不得受到影响。
- `session_start` 加载配置、安装 footer 并启动刷新定时器；`session_shutdown` 必须移除 footer 并停止定时器。定时器要保持 `unref()`。
- 多个 footer 扩展会争用同一个槽位；`/me-tui` 会重新安装本扩展的 footer，使其优先于其他 footer 扩展。
- 渲染（`WidgetDefinition.render` 和 `renderAllLines`）必须无副作用且快速，默认每秒执行一次。组件返回 `string | null`，返回 `null` 表示隐藏。footer 渲染出错时不返回任何行，而不是让 Pi 崩溃。
- 扩展不发起网络请求。唯一的文件写入是配置文件（临时文件 + rename）。自定义命令组件按设计执行用户配置的 shell 命令；不要为新功能引入 shell 调用。
- Git 数据通过本地 git 命令采集，并按 `gitCacheTtlSeconds` 缓存。只为当前存在的组件类型采集数据（`configHasType`、`gitOptions`），以免增加状态栏开销。

## 配置规则

- 路径：`getAgentDir()` + `me-tui.json`，默认即 `~/.pi/agent/me-tui.json`。
- `normalizeConfig` 必须保持向后兼容：缺失字段用默认值补齐，数值做钳制，未知组件类型直接丢弃而不是抛错。解析失败时给出警告并回退到默认值，但不删除文件。
- 修改 `DEFAULT_CONFIG` 会影响首次生成的配置、「恢复默认」以及归一化回退值；不会重写已有配置中合法的字段。
- 内置默认值目前是 3 行、51 项的中文布局。`tests/config.test.ts` 和 `tests/render.test.ts` 断言了它的精确结构；有意修改默认值时需同步更新这些测试。
- `MAX_LINES` 为 4。行数、对齐和组件 ID 要保持自洽。

## 组件（Widget）

在 `widgets/*.ts` 中添加或修改组件，定义保持声明式：`type`、`category`、`name`、`description`、`defaultColor`、`priority`，可选的 `options`、`defaultItem` 和 `render`。

新增组件的步骤：

1. 在对应的 `widgets/*.ts` 文件中定义组件。
2. 在 `icons.ts` 的 Unicode、Nerd Font、ASCII 三套图标中都添加图标。
3. 更新 `tests/widgets.test.ts` 中的组件总数和分类数量断言。
4. 添加行为测试；涉及布局时补充渲染测试。
5. 如果组件列表或默认布局发生变化，同步更新两个 README。

渲染约定：标签为双语并遵循 `rawValue`；`hideEmpty` 控制零值是否显示；`priority` 决定窄终端下整块丢弃哪些组件。优先丢弃组件，而不是把值截断成省略号。复用 `widgets/shared.ts` 中的 `iconText`、`tokenText`、`hideWhenZero`、`usageBucket`，不要重复实现格式化逻辑。

## 本地化与代码风格

- 所有面向用户的字符串都是 `{ zh, en }` 对，并跟随 `config.language`。
- 思考力度在两种语言下都刻意使用英文等级名（`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`），不要本地化。
- `README.md` 与 `README.zh-CN.md` 必须同步。文档只描述当前行为，不写路线图或推测性内容。
- TypeScript 启用 `strict`。`.ts` 使用 Tab 缩进，JSON/Markdown/YAML 使用两个空格，LF 换行，文件末尾保留换行（见 `.editorconfig`）。
- 优先使用小型纯函数和模块，而不是类。只有解释「为什么」时才写注释。
- 代码和测试必须同时兼容 Linux 与 Windows；使用 `node:path`，避免平台相关的 shell 语法。
- 面向用户的变更记录在 `CHANGELOG.md` 的 `## [Unreleased]` 下。

## 测试

- 测试使用 `node:test`，直接导入 `.ts` 源码；没有转译器，也没有 mock 库。
- 使用 `tests/helpers.ts`（`fakePi`、`fakeContext`、`fakeState`、`bucket`、`renderContext`），不要直接深入 Pi 内部实现。
- 渲染测试断言 `stripAnsi(...)` 后的输出，保证失败信息可读。
- 测试不得读写真实的 `~/.pi/agent/me-tui.json`，应使用内存中的配置或隔离的临时 HOME/USERPROFILE。
- 变更需要包含一个在修改前会失败的测试；报告完成前运行 `npm run check`。

## Git 与发布

- 提交标题简短、使用祈使句，可带 scope：`feat(widgets): ...`、`fix(usage): ...`、`docs: ...`。
- `main` 禁止强制推送和删除，允许直接推送。不要改写已发布的历史。
- 通过 Git 分发（`pi install git:github.com/LuWuSS/pi-me-tui`），没有 npm 发布步骤。
- 发布流程：更新 `package.json` 的 `version`，在 `CHANGELOG.md` 添加条目，提交后推送 `v*` 标签。Release workflow 会运行检查并创建 GitHub Release。
