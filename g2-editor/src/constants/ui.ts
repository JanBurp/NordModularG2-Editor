import type { SlotLabel } from '@/types';
import type { StatusHintKey } from './statusHints';

export const APP_NAME = 'G2 Editor';

/** SVG pixel width of one module column. */
export const MODULE_WIDTH = 256;
/** SVG pixel height of one module row unit. */
export const MODULE_ROW_HEIGHT = 16;

export const SLOT_LABELS: readonly SlotLabel[] = ['A', 'B', 'C', 'D'] as const;

const slotHint: StatusHintKey = 'slotIndicators';
export const SLOT_OPTIONS = [
	{ label: 'A', value: 0, hint: slotHint },
	{ label: 'B', value: 1, hint: slotHint },
	{ label: 'C', value: 2, hint: slotHint },
	{ label: 'D', value: 3, hint: slotHint },
];

export const PANE_TAB_OPTIONS = [
	{ label: 'Browser', value: 'browser', hint: 'paneBrowser' as StatusHintKey },
	{ label: 'Modules', value: 'modules', hint: 'paneModules' as StatusHintKey },
	{ label: 'Midi CC', value: 'midicc', hint: 'paneMidicc' as StatusHintKey },
	{ label: 'Text', value: 'text', hint: 'paneText' as StatusHintKey },
	{ label: 'Settings', value: 'settings', hint: 'paneSettings' as StatusHintKey },
];

export const AREA_OPTIONS = [
	{ value: 1, short: 'va', label: 'Voice', hint: 'areaVoice' as StatusHintKey },
	{ value: 2, short: 'split', label: 'Split', hint: 'areaSplit' as StatusHintKey },
	{ value: 0, short: 'fx', label: 'FX', hint: 'areaFx' as StatusHintKey },
];

export const getAreaByShort = (short: string): string => AREA_OPTIONS.find((o) => o.short === short)?.label ?? short;

export const VARIATION_OPTIONS = Array.from({ length: 9 }, (_, i) => ({
	label: i < 8 ? String(i + 1) : 'INIT ',
	value: i,
	draggable: i < 8,
	hint: (i < 8 ? 'variationCopy' : 'variationInit') as StatusHintKey,
}));

export const BANK_TYPE_OPTIONS = [
	{ label: 'Patch', value: 'patch' },
	{ label: 'Performance', value: 'performance' },
];

export const SOURCE_TYPE_OPTIONS = [
	{ label: '.pchList file', value: 'pchList' },
	{ label: 'Folder', value: 'folder' },
];
