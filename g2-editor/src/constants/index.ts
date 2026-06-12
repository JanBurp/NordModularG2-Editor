/**
 * Constants for Nord Modular G2 Editor
 *
 * This module exports all constants used throughout the application
 */

// Cable colors
export {
	CABLE_COLORS,
	CABLE_COLOR_INDEX_MAP,
	CABLE_SVG_COLORS,
	DEFAULT_CABLE_VISIBILITY,
	JACK_COLORS,
	type CableColor,
	type CableColorName,
} from './cableColors';

// Module colors
export { MODULE_COLORS, DEFAULT_MODULE_COLOR, getModuleColor, type ModuleColor } from './moduleColors';

// Sound categories
export { SOUND_CATEGORIES, CATEGORY_COUNT, DEFAULT_CATEGORY_ID, getCategoryName, isValidCategoryId, type SoundCategory } from './categories';

// UI option arrays, slot labels, and module grid dimensions
export { SLOT_LABELS, SLOT_OPTIONS, PANE_TAB_OPTIONS, AREA_OPTIONS, VARIATION_OPTIONS, MODULE_WIDTH, MODULE_ROW_HEIGHT } from './ui';

// Human-readable labels for settings fields
export { SETTINGS_LABELS } from './settingsLabels';

// Empty patch binary template for new patches
export { EMPTY_PATCH_HEX } from './emptyPatchHex';
