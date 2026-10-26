import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Rgb } from "./colors.ts";
import {
	bgAnsi,
	brightenAnsi,
	brightenAnsiText,
	colorLevel,
	contrastColor,
	fgAnsi,
	paint,
	powerlineColorAt,
	rgbBackground,
	rgbForeground,
} from "./colors.ts";
import { getWidget } from "./registry.ts";
import type { LineAlign, MeTuiConfig, WidgetItem, WidgetRenderContext } from "./types.ts";
import { hasAnsi, stripAnsi } from "./utils.ts";
import { contextPercent, contextUsage } from "./widgets/shared.ts";

interface Segment {
	text: string;
	plain: string;
	width: number;
	priority: number;
	item?: WidgetItem;
	flex?: boolean;
}

/**
 * How far glow lifts a foreground toward white. Kept small so the hue stays readable; the extra
 * weight comes from bold, which is a separate SGR attribute rather than a color shift.
 */
const GLOW_BRIGHTEN = 0.22;

function resolveLabel(item: WidgetItem, rc: WidgetRenderContext): string {
	if (item.rawValue) return "";
	const definition = getWidget(item.type);
	if (!definition?.supportsLabel) return "";
	if (item.labelOverride !== undefined) return item.labelOverride;
	return definition.defaultLabel ? definition.defaultLabel[rc.language] : "";
}

function restyleAnsi(text: string, open: string): string {
	if (!open) return text;
	if (!text.includes("\x1b[")) return open + text + "\x1b[0m";
	const parts = text.split("\x1b[0m");
	let output = open + parts[0];
	for (let index = 1; index < parts.length; index += 1) {
		output += "\x1b[0m";
		if (parts[index]) output += open + parts[index];
	}
	return output.endsWith("\x1b[0m") ? output : output + "\x1b[0m";
}

function prepareSegment(item: WidgetItem, rc: WidgetRenderContext): Segment | null {
	const definition = getWidget(item.type);
	if (!definition) return null;
	let value: string | null = null;
	try {
		value = definition.render(item, rc);
	} catch {
		return null;
	}
	if (value === null) return null;
	value = value.trim();
	if (!value) return null;
	const label = resolveLabel(item, rc);
	const plain = label + stripAnsi(value);
	const fg = rc.config.overrides.fg ?? item.color ?? definition.defaultColor;
	const bg = rc.config.overrides.bg ?? item.backgroundColor;
	const bold = rc.config.overrides.bold ?? item.bold ?? false;
	const dim = rc.config.overrides.dim ?? item.dim ?? false;
	const glow = rc.config.overrides.glow ?? item.glow ?? false;
	const level = colorLevel(rc.colorLevel, rc.theme);
	const baseAnsi = fg ? fgAnsi(fg, rc.theme, rc.colorLevel) : "";
	const glowAmount = glow ? GLOW_BRIGHTEN : 0;
	const glowTarget = baseAnsi || (glowAmount > 0 ? fgAnsi("text", rc.theme, rc.colorLevel) : "");
	const glowAnsi = glowAmount > 0 ? brightenAnsi(glowTarget, glowAmount, level) : baseAnsi;
	// Bold is weight only: lifting the color here would repaint the whole line and hide the effect
	// whenever glow already lifted it.
	const weight = (bold ? "\x1b[1m" : "") + (dim ? "\x1b[2m" : "");
	const open = glowAnsi + (bg ? bgAnsi(bg, rc.theme, rc.colorLevel) : "") + weight;
	const styledLabel = label ? (open ? open + label + "\x1b[0m" : label) : "";
	const styledValue = hasAnsi(value)
		? restyleAnsi(glowAmount > 0 ? brightenAnsiText(value, glowAmount, level) : value, weight)
		: open
			? open + value + "\x1b[0m"
			: value;
	let text = styledLabel + styledValue;
	const pad = rc.config.defaultPaddingSide;
	if (definition.type !== "separator") {
		if (pad === "both" || pad === "left") text = " " + text;
		if (pad === "both" || pad === "right") text = text + " ";
	}
	if (item.maxWidth && item.maxWidth > 0) {
		text = truncateToWidth(text, item.maxWidth, "…");
	}
	const paddedPlain =
		definition.type === "separator"
			? plain
			: (pad === "both" || pad === "left" ? " " : "") +
				plain +
				(pad === "both" || pad === "right" ? " " : "");
	const clippedPlain = item.maxWidth && item.maxWidth > 0 ? truncateToWidth(paddedPlain, item.maxWidth, "…") : paddedPlain;
	return {
		text,
		plain: clippedPlain,
		width: visibleWidth(text),
		priority: definition.priority,
		item,
	};
}

function splitGroups(segments: Segment[]): Segment[][] {
	const groups: Segment[][] = [[]];
	for (const segment of segments) {
		if (segment.flex) {
			if (groups[groups.length - 1].length > 0) groups.push([]);
			continue;
		}
		groups[groups.length - 1].push(segment);
	}
	return groups.filter((group) => group.length > 0);
}

function groupWidth(group: Segment[]): number {
	if (group.length === 0) return 0;
	return group.reduce((sum, segment) => sum + segment.width, 0) + group.length - 1;
}

function joinGroup(group: Segment[]): string {
	return group.map((segment) => segment.text).join(" ");
}

function shrinkGroup(group: Segment[], budget: number): Segment[] {
	let current = [...group];
	const total = () => groupWidth(current);
	while (total() > budget && current.length > 1) {
		let removeIndex = -1;
		let removePriority = Number.POSITIVE_INFINITY;
		for (let index = current.length - 1; index >= 0; index -= 1) {
			const priority = current[index].priority;
			if (priority < removePriority) {
				removePriority = priority;
				removeIndex = index;
			}
		}
		if (removeIndex < 0) break;
		current.splice(removeIndex, 1);
	}
	while (current.length > 0 && current[current.length - 1].item?.type === "separator") current.pop();
	while (current.length > 0 && current[0].item?.type === "separator") current.shift();
	if (total() > budget && current.length === 1) {
		const only = current[0];
		const target = Math.max(3, budget);
		const text = truncateToWidth(only.text, target, "…");
		const plain = truncateToWidth(only.plain, target, "…");
		current = [{ ...only, text, plain, width: visibleWidth(text) }];
	}
	return current;
}

function withAutoAlign(segments: Segment[], config: MeTuiConfig): Segment[] {
	if (!config.powerline.autoAlign) return segments;
	if (segments.some((segment) => segment.flex)) return segments;
	if (segments.length < 2) return segments;
	return [...segments.slice(0, -1), { text: "", plain: "", width: 0, priority: 0, flex: true }, segments[segments.length - 1]];
}

function fitGroups(groups: Segment[][], width: number): { groups: Segment[][]; fills: number[] } {
	const flexCount = Math.max(0, groups.length - 1);
	const budget = Math.max(3, width - flexCount);
	const fitted = groups.map((group) => [...group]);
	const totalWidth = (): number => fitted.reduce((sum, group) => sum + groupWidth(group), 0);
	let guard = 0;
	while (totalWidth() > budget && guard < 64) {
		guard += 1;
		let index = -1;
		for (let candidate = fitted.length - 1; candidate >= 0; candidate -= 1) {
			if (fitted[candidate].length > 0) {
				index = candidate;
				break;
			}
		}
		if (index < 0) break;
		const group = fitted[index];
		const excess = totalWidth() - budget;
		const current = groupWidth(group);
		const next = shrinkGroup(group, Math.max(3, current - excess));
		if (groupWidth(next) === current) {
			if (fitted[index].length === 0) break;
			fitted[index] = [];
			continue;
		}
		fitted[index] = next;
	}
	const widths = fitted.map((group) => groupWidth(group));
	const used = widths.reduce((sum, value) => sum + value, 0);
	const available = Math.max(flexCount, width - used);
	const base = flexCount > 0 ? Math.floor(available / flexCount) : 0;
	const extra = flexCount > 0 ? available % flexCount : 0;
	const fills = Array.from({ length: flexCount }, (_value, index) => Math.max(1, base + (index < extra ? 1 : 0)));
	return { groups: fitted, fills };
}

function alignContent(content: string, width: number, align: Exclude<LineAlign, "flex">): string {
	const text = content.trimEnd();
	const gap = width - visibleWidth(text);
	if (gap <= 0) return truncateToWidth(text, width, "…");
	if (align === "right") return " ".repeat(gap) + text;
	if (align === "center") return " ".repeat(Math.floor(gap / 2)) + text;
	return text;
}

function renderPlainLine(
	segments: Segment[],
	width: number,
	rc: WidgetRenderContext,
	align: LineAlign = "flex",
): string {
	if (align !== "flex") {
		const content = segments
			.filter((segment) => !segment.flex)
			.map((segment) => segment.text)
			.join(" ");
		return content.trim() ? alignContent(content, width, align) : "";
	}
	const aligned = withAutoAlign(segments, rc.config);
	const groups = splitGroups(aligned);
	if (groups.length === 0) return "";
	const { groups: fitted, fills } = fitGroups(groups, width);
	let output = joinGroup(fitted[0]);
	for (let index = 1; index < fitted.length; index += 1) {
		output += " ".repeat(fills[index - 1] ?? 1) + joinGroup(fitted[index]);
	}
	return truncateToWidth(output.trimEnd(), width, "…");
}

function powerlinePaint(text: string, fg: Rgb | undefined, bg: Rgb | undefined, rc: WidgetRenderContext, bold = false): string {
	const level = colorLevel(rc.colorLevel, rc.theme);
	let open = "";
	if (fg) open += rgbForeground(fg, level);
	if (bg) open += rgbBackground(bg, level);
	if (bold) open += "\x1b[1m";
	if (!open) return text;
	return open + text + "\x1b[0m";
}

function renderPowerlineGroups(
	groups: Segment[][],
	fills: number[],
	rc: WidgetRenderContext,
	offset: number,
): { text: string; nextOffset: number } {
	let output = "";
	let colorIndex = offset;
	const separator = rc.config.powerline.separators[0] ?? "\uE0B0";
	const startCap = rc.config.powerline.startCaps[0] ?? "";
	const endCap = rc.config.powerline.endCaps[0] ?? "";
	const palette = rc.config.powerline.theme;
	const invert = rc.config.powerline.separatorInvertBackground;
	const allSegments = groups.flat();
	if (allSegments.length === 0) return { text: "", nextOffset: offset };
	if (startCap) {
		output += powerlinePaint(startCap, powerlineColorAt(palette, colorIndex), undefined, rc);
	}
	for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
		const group = groups[groupIndex];
		for (let index = 0; index < group.length; index += 1) {
			const segment = group[index];
			const bg = powerlineColorAt(palette, colorIndex);
			const fg = contrastColor(bg);
			output += powerlinePaint(` ${stripAnsi(segment.plain).trim()} `, fg, bg, rc, true);
			const isLastInGroup = index === group.length - 1;
			const hasNextGroup = groupIndex < groups.length - 1;
			if (!isLastInGroup || hasNextGroup) {
				const nextBg = powerlineColorAt(palette, colorIndex + 1);
				const invertThis = invert[colorIndex % Math.max(1, invert.length)] === true;
				output += powerlinePaint(
					separator,
					invertThis ? nextBg : bg,
					invertThis ? bg : nextBg,
					rc,
				);
			}
			colorIndex += 1;
		}
		if (groupIndex < groups.length - 1) {
			const fill = fills[groupIndex] ?? 1;
			const bg = powerlineColorAt(palette, colorIndex);
			output += powerlinePaint(" ".repeat(fill), undefined, bg, rc);
		}
	}
	if (endCap) {
		output += powerlinePaint(endCap, powerlineColorAt(palette, colorIndex - 1), undefined, rc);
	}
	return { text: output, nextOffset: colorIndex };
}

function renderPowerlineLine(
	segments: Segment[],
	width: number,
	rc: WidgetRenderContext,
	offset: number,
): { text: string; nextOffset: number } {
	const aligned = withAutoAlign(segments, rc.config);
	const groups = splitGroups(aligned);
	if (groups.length === 0) return { text: "", nextOffset: offset };
	const visibleCount = aligned.filter((segment) => !segment.flex).length;
	const separatorCount = Math.max(0, visibleCount - 1);
	const startCap = rc.config.powerline.startCaps[0] ?? "";
	const endCap = rc.config.powerline.endCaps[0] ?? "";
	const capWidth = visibleWidth(startCap) + visibleWidth(endCap);
	const { groups: fitted, fills } = fitGroups(groups, Math.max(3, width - separatorCount - capWidth));
	const result = renderPowerlineGroups(fitted, fills, rc, offset);
	return { text: truncateToWidth(result.text.trimEnd(), width, "…"), nextOffset: result.nextOffset };
}

function lineHasContent(line: WidgetItem[]): boolean {
	return line.some((item) => item.type !== "flex" && item.type !== "separator");
}

function effectiveWidth(config: MeTuiConfig, rc: WidgetRenderContext, width: number): number {
	if (config.flexMode === "full-minus-40") return Math.max(20, width - 40);
	if (config.flexMode === "full-until-compact") {
		const usage = contextUsage(rc);
		const percent = usage ? contextPercent(usage) : undefined;
		if (percent !== undefined && percent >= config.compactThreshold) return Math.max(20, width - 40);
	}
	return width;
}

function buildSegments(line: WidgetItem[], rc: WidgetRenderContext): Segment[] {
	const entries = line.map((item) => ({
		item,
		segment:
			item.type === "flex"
				? ({ text: "", plain: "", width: 0, priority: 0, flex: true } as Segment)
				: prepareSegment(item, rc),
	}));
	const segments: Segment[] = [];
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index];
		if (entry.item.type === "flex") {
			segments.push(entry.segment as Segment);
			continue;
		}
		if (entry.item.type !== "separator") {
			if (entry.segment) segments.push(entry.segment);
			continue;
		}
		if (!entry.segment) continue;
		const prev = entries.slice(0, index).reverse().find((candidate) => candidate.item.type !== "separator" && candidate.item.type !== "flex" && candidate.segment);
		const next = entries.slice(index + 1).find((candidate) => candidate.item.type !== "separator" && candidate.item.type !== "flex" && candidate.segment);
		if (!prev || !next) continue;
		if (segments.length > 0 && segments[segments.length - 1].item?.type === "separator") continue;
		segments.push(entry.segment);
	}
	return segments;
}

export function renderLine(line: WidgetItem[], rc: WidgetRenderContext): string {
	const segments = buildSegments(line, rc);
	const width = effectiveWidth(rc.config, rc, rc.width);
	if (rc.config.powerline.enabled) return renderPowerlineLine(segments, width, rc, 0).text;
	return renderPlainLine(segments, width, rc);
}

export function renderAllLines(config: MeTuiConfig, rc: WidgetRenderContext, width: number): string[] {
	if (!config.enabled) return [];
	const context: WidgetRenderContext = { ...rc, width: Math.max(1, width) };
	const output: string[] = [];
	let offset = 0;
	const visibleLines = config.lines.slice(0, 4);
	for (let lineIndex = 0; lineIndex < visibleLines.length; lineIndex += 1) {
		const line = visibleLines[lineIndex];
		if (!lineHasContent(line)) continue;
		const segments = buildSegments(line, context);
		const count = segments.filter((segment) => !segment.flex).length;
		const lineWidth = effectiveWidth(config, context, context.width);
		if (config.powerline.enabled) {
			const rendered = renderPowerlineLine(segments, lineWidth, context, config.powerline.continueThemeAcrossLines ? offset : 0);
			if (rendered.text.trim()) output.push(rendered.text);
			offset = rendered.nextOffset;
		} else {
			const rendered = renderPlainLine(segments, lineWidth, context, config.lineAligns?.[lineIndex] ?? "flex");
			if (rendered.trim()) output.push(rendered);
			offset += count;
		}
	}
	return output;
}
