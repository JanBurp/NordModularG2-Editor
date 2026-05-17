import type { SlotLabel } from '@/types';

export const SLOT_LABELS: readonly SlotLabel[] = ['A', 'B', 'C', 'D'] as const;

export const SLOT_OPTIONS = [
	{ label: 'A', value: 0 },
	{ label: 'B', value: 1 },
	{ label: 'C', value: 2 },
	{ label: 'D', value: 3 },
];

export const PANE_TAB_OPTIONS = [
	{ label: 'Modules', value: 'modules' },
	{ label: 'Browser', value: 'browser' },
	{ label: 'Info', value: 'info' },
];

export const AREA_OPTIONS = [
	{ value: 1, short: 'va', label: 'Voice' },
	{ value: 0, short: 'fx', label: 'FX' },
];

export const getAreaByShort = (short: string): string => {
	if (short === 'va') return AREA_OPTIONS[0].label;
	return AREA_OPTIONS[1].label
}

export const VARIATION_OPTIONS = Array.from({ length: 9 }, (_, i) => ({
	label: i < 8 ? String(i + 1) : 'INIT ',
	value: i,
}));
