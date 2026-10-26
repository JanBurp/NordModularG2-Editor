import type { Patch, RenameChange } from '@/types/patch';
import { MORPH_NAMES } from '@/types/patch';
import { getModule } from '@/renderer/nmg2mods';
import { morphGroupName } from '@/store/slotHelpers';

// Find & Replace over the names the G2 stores per patch: module names, switch-param button labels
// and Morph Group labels. A SearchItem is a RenameChange carrying the item's current text.
export type SearchItem = RenameChange;

export interface SearchOptions {
	caseSensitive: boolean;
	regex: boolean;
}

// Hardware/file limits: module names 16 bytes, param and morph labels 7 (see cli/src/g2_device.c).
const MAX_LEN = { module: 16, param: 7, morph: 7 } as const;

export function buildMatcher(term: string, { caseSensitive, regex }: SearchOptions): RegExp | { error: string } | null {
	if (!term) return null;
	try {
		return new RegExp(regex ? term : term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
	} catch (err) {
		return { error: (err as Error).message };
	}
}

// Every searchable item of the patch in canvas reading order: VA then FX (by column, then row), then morph groups.
export function collectItems(patch: Patch): SearchItem[] {
	const items: SearchItem[] = [];
	for (const [area, areaIdx] of [
		['voice', 1],
		['fx', 0],
	] as const) {
		const mods = [...(patch.areas[areaIdx]?.modules ?? [])].sort((a, b) => a.horiz - b.horiz || a.vert - b.vert);
		for (const mod of mods) {
			const def = getModule(mod.type);
			items.push({ kind: 'module', area, moduleIndex: mod.index, text: mod.uname ?? def?.short ?? '' });
			def?.params?.forEach((p, paramIndex) => {
				const custom = mod.paramLabels?.find((pl) => pl.paramIndex === paramIndex)?.labels ?? [];
				p.label?.forEach((name, labelIndex) =>
					items.push({ kind: 'param', area, moduleIndex: mod.index, paramIndex, labelIndex, text: custom[labelIndex] || name }),
				);
			});
		}
	}
	MORPH_NAMES.forEach((_, groupIndex) => items.push({ kind: 'morph', groupIndex, text: morphGroupName(patch, groupIndex) }));
	return items;
}

export function findMatches(items: SearchItem[], re: RegExp): SearchItem[] {
	return items.filter((item) => {
		re.lastIndex = 0;
		return re.test(item.text);
	});
}

export interface SkippedItem {
	item: SearchItem;
	newText: string;
	reason: string;
}

// The renamed items, minus those the G2 can't store (too long, empty module name, non-ASCII), which are reported instead.
export function computeReplacements(matches: SearchItem[], re: RegExp, replacement: string): { changes: RenameChange[]; skipped: SkippedItem[] } {
	const changes: RenameChange[] = [];
	const skipped: SkippedItem[] = [];
	for (const item of matches) {
		const newText = item.text.replace(re, replacement);
		if (newText === item.text) continue;
		const reason =
			newText.length > MAX_LEN[item.kind]
				? `longer than ${MAX_LEN[item.kind]}`
				: item.kind === 'module' && newText === ''
					? 'empty name'
					: /[^\x20-\x7e]/.test(newText)
						? 'non-ASCII'
						: null;
		if (reason) skipped.push({ item, newText, reason });
		else changes.push({ ...item, text: newText });
	}
	return { changes, skipped };
}

// Stable identity of an item, for highlight lookups.
export function itemKey(item: SearchItem): string {
	if (item.kind === 'morph') return `morph:${item.groupIndex}`;
	const base = `${item.area}:${item.moduleIndex}`;
	return item.kind === 'module' ? `module:${base}` : `param:${base}:${item.paramIndex}:${item.labelIndex}`;
}

// Splits text into matched / unmatched runs, for highlighting only the found part.
export function splitMatches(text: string, re: RegExp): { text: string; hit: boolean }[] {
	const parts: { text: string; hit: boolean }[] = [];
	let last = 0;
	for (const m of text.matchAll(re)) {
		if (!m[0]) continue; // a zero-length match has nothing to highlight
		if (m.index > last) parts.push({ text: text.slice(last, m.index), hit: false });
		parts.push({ text: m[0], hit: true });
		last = m.index + m[0].length;
	}
	if (last < text.length) parts.push({ text: text.slice(last), hit: false });
	return parts;
}
