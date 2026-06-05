import type { SlotLabel } from '@/types';

/** SVG pixel width of one module column. */
export const MODULE_WIDTH = 256;
/** SVG pixel height of one module row unit. */
export const MODULE_ROW_HEIGHT = 16;

export const SLOT_LABELS: readonly SlotLabel[] = ['A', 'B', 'C', 'D'] as const;

export const SLOT_OPTIONS = [
	{ label: 'A', value: 0 },
	{ label: 'B', value: 1 },
	{ label: 'C', value: 2 },
	{ label: 'D', value: 3 },
];

export const PANE_TAB_OPTIONS = [
	{ label: 'Settings', value: 'settings' },
	{ label: 'Modules', value: 'modules' },
	{ label: 'Browser', value: 'browser' },
];

export const AREA_OPTIONS = [
	{ value: 1, short: 'va', label: 'Voice' },
	{ value: 2, short: 'split', label: 'Split' },
	{ value: 0, short: 'fx', label: 'FX' },
];

export const getAreaByShort = (short: string): string =>
	AREA_OPTIONS.find((o) => o.short === short)?.label ?? short;

export const VARIATION_OPTIONS = Array.from({ length: 9 }, (_, i) => ({
	label: i < 8 ? String(i + 1) : 'INIT ',
	value: i,
}));
