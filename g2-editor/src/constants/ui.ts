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
	{ value: 1, label: 'Voice' },
	{ value: 0, label: 'FX' },
];

export const VARIATION_OPTIONS = Array.from({ length: 9 }, (_, i) => ({
	label: i < 8 ? String(i + 1) : 'init',
	value: i,
}));
