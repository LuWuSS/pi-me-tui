import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { renderAllLines } from "./render.ts";
import type { MeTuiConfig, WidgetRenderContext } from "./types.ts";

export interface FooterHooks {
	getConfig(): MeTuiConfig;
	createContext(theme: Theme, width: number): WidgetRenderContext;
	setRequestRender(request: () => void): void;
	refreshGit(force?: boolean): void;
}

export interface FooterHandle {
	cleanup(): void;
}

export function installFooter(ctx: ExtensionContext, hooks: FooterHooks): FooterHandle {
	let unsubscribe: (() => void) | undefined;
	ctx.ui.setFooter((tui, theme, footerData) => {
		hooks.setRequestRender(() => tui.requestRender());
		unsubscribe = footerData.onBranchChange(() => {
			hooks.refreshGit(true);
			tui.requestRender();
		});
		return {
			dispose() {
				unsubscribe?.();
				unsubscribe = undefined;
			},
			invalidate() {},
			render(width: number): string[] {
				try {
					return renderAllLines(hooks.getConfig(), hooks.createContext(theme, width), width);
				} catch {
					return [];
				}
			},
		};
	});
	return {
		cleanup() {
			unsubscribe?.();
			unsubscribe = undefined;
			ctx.ui.setFooter(undefined);
		},
	};
}
