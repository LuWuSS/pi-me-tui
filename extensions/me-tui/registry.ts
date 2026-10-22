import type { LocalizedText, MeTuiConfig, WidgetCategory, WidgetDefinition, WidgetItem } from "./types.ts";
import { createWidgetId } from "./utils.ts";
import { contextWidgets } from "./widgets/context.ts";
import { coreWidgets } from "./widgets/core.ts";
import { customWidgets } from "./widgets/custom.ts";
import { envWidgets } from "./widgets/env.ts";
import { gitWidgets } from "./widgets/git.ts";
import { layoutWidgets } from "./widgets/layout.ts";
import { sessionWidgets } from "./widgets/session.ts";
import { speedWidgets } from "./widgets/speed.ts";
import { tokenWidgets } from "./widgets/tokens.ts";

export interface WidgetCategoryInfo {
	category: WidgetCategory;
	label: LocalizedText;
}

export const WIDGET_CATEGORIES: WidgetCategoryInfo[] = [
	{ category: "core", label: { zh: "核心", en: "Core" } },
	{ category: "git", label: { zh: "Git", en: "Git" } },
	{ category: "token", label: { zh: "Token", en: "Token" } },
	{ category: "speed", label: { zh: "Token 速度", en: "Token speed" } },
	{ category: "context", label: { zh: "上下文", en: "Context" } },
	{ category: "session", label: { zh: "会话", en: "Session" } },
	{ category: "env", label: { zh: "环境", en: "Environment" } },
	{ category: "custom", label: { zh: "自定义", en: "Custom" } },
	{ category: "layout", label: { zh: "布局", en: "Layout" } },
];

const definitions: WidgetDefinition[] = [
	...coreWidgets,
	...gitWidgets,
	...tokenWidgets,
	...speedWidgets,
	...contextWidgets,
	...sessionWidgets,
	...envWidgets,
	...customWidgets,
	...layoutWidgets,
];

const byType = new Map(definitions.map((definition) => [definition.type, definition]));

export function allWidgets(): WidgetDefinition[] {
	return definitions;
}

export function getWidget(type: string): WidgetDefinition | undefined {
	return byType.get(type);
}

export function widgetsInCategory(category: WidgetCategory): WidgetDefinition[] {
	return definitions.filter((definition) => definition.category === category);
}

export function widgetName(definition: WidgetDefinition, language: "zh" | "en"): string {
	return definition.name[language];
}

export function createItem(type: string, overrides: Partial<WidgetItem> = {}): WidgetItem {
	const definition = getWidget(type);
	return {
		id: createWidgetId(type),
		type,
		...definition?.defaultItem,
		...overrides,
	};
}

export function itemTypes(config: MeTuiConfig): Set<string> {
	const types = new Set<string>();
	for (const line of config.lines) {
		for (const item of line) types.add(item.type);
	}
	return types;
}

export function hasType(config: MeTuiConfig, type: string): boolean {
	return itemTypes(config).has(type);
}

export function hasAnyType(config: MeTuiConfig, types: readonly string[]): boolean {
	const present = itemTypes(config);
	return types.some((type) => present.has(type));
}

export function allItems(config: MeTuiConfig): WidgetItem[] {
	return config.lines.flat();
}
