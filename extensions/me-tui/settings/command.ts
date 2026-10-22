import type {
	ExtensionAPI,
	ExtensionCommandContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import type { MeTuiConfig } from "../types.ts";
import { MeTuiSettings } from "./ui.ts";

export interface SettingsCommandHooks {
	getConfig(): MeTuiConfig;
	onChange(config: MeTuiConfig): void;
	onBeforeOpen(ctx: ExtensionCommandContext): void;
	onOverlayClosed(ctx: ExtensionCommandContext): void;
	preview(config: MeTuiConfig, theme: Theme, width: number): string[];
}

export function registerSettingsCommand(pi: ExtensionAPI, hooks: SettingsCommandHooks): void {
	pi.registerCommand("me-tui", {
		description: "配置 me-tui 状态栏 / Configure the me-tui statusline",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("me-tui 需要 TUI 模式 / me-tui requires TUI mode");
				return;
			}
			hooks.onBeforeOpen(ctx);
			await ctx.ui.custom<void>(
				(tui, theme, _keybindings, done) =>
					new MeTuiSettings({
						config: hooks.getConfig(),
						theme,
						done,
						onChange: (next) => hooks.onChange(next),
						preview: (config, width) => hooks.preview(config, theme, width),
						onRequestRender: () => tui.requestRender(),
						terminalHeight: () => tui.terminal.rows,
					}),
				{ overlay: true, overlayOptions: { width: "100%", maxHeight: "100%" } },
			);
			hooks.onOverlayClosed(ctx);
		},
	});
}
