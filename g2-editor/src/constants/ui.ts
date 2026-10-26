import type { SlotLabel } from '@/types';
import type { StatusHintKey } from './statusHints';

export const APP_NAME = 'G2 Editor';
export const DONATE_URL = 'https://www.paypal.com/donate/?hosted_button_id=UZE943PYKY5S6';

/** SVG pixel width of one module column. */
export const MODULE_WIDTH = 256;
/** SVG pixel height of one module row unit. */
export const MODULE_ROW_HEIGHT = 16;

// Fill of every value/assignment hint badge (F5–F8, hover/drag hints) and of the CC# / Parameter
// Pages drag images. Official editor: CRGBColor::GetMetallicBackground() = 222,222,222.
export const HINT_FILL = '#FFFFDE';

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
	{ label: 'Overview', value: 'overview', hint: 'paneOverview' as StatusHintKey },
	{ label: 'Mutator', value: 'mutator', hint: 'paneMutator' as StatusHintKey },
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

/** Number of banks the G2 has for a given bank type. */
export const bankSizeFor = (type: 'patch' | 'performance'): number => (type === 'performance' ? 8 : 32);

/** Number of locations per bank for a given bank type. */
export const locationSizeFor = (type: 'patch' | 'performance'): number => (type === 'performance' ? 32 : 128);

/** Default bank/store dialog type: performance if either the loaded slot data or the connected device is in performance mode. */
export const defaultBankKind = (slotsIsPerformanceMode: boolean, deviceIsPerformanceMode: boolean): 'patch' | 'performance' =>
	slotsIsPerformanceMode || deviceIsPerformanceMode ? 'performance' : 'patch';
