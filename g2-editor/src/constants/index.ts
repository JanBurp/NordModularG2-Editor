/**
 * Constants for Nord Modular G2 Editor
 *
 * This module exports all constants used throughout the application
 */

// Cable colors
export { CABLE_COLOR_INDEX_MAP, getEffectiveJackColor, type CableColor, type CableColorName } from './cableColors';
export { CABLE_COLORS, CABLE_SVG_COLORS, JACK_COLORS, MODULE_COLORS } from './colors';

// Module colors
export { type ModuleColor } from './moduleColors';

// Sound categories
export { SOUND_CATEGORIES, type SoundCategory } from './categories';

// UI option arrays, slot labels, and module grid dimensions
export {
	APP_NAME,
	DONATE_URL,
	SLOT_LABELS,
	SLOT_OPTIONS,
	PANE_TAB_OPTIONS,
	AREA_OPTIONS,
	VARIATION_OPTIONS,
	BANK_TYPE_OPTIONS,
	SOURCE_TYPE_OPTIONS,
	MODULE_WIDTH,
	MODULE_ROW_HEIGHT,
} from './ui';

// Human-readable labels for settings fields
export { SETTINGS_LABELS } from './settingsLabels';
