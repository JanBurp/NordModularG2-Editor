import { computed, ref } from 'vue';
import { CABLE_COLORS, CABLE_COLOR_INDEX_MAP, type CableColorName } from '../constants';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';

export interface CableVisibility {
	red: boolean;
	blue: boolean;
	yellow: boolean;
	orange: boolean;
	green: boolean;
	purple: boolean;
	white: boolean;
}

// Re-export constants for backward compatibility
export { CABLE_COLORS as cableColors, CABLE_COLOR_INDEX_MAP as COLOR_INDEX_TO_NAME };
export type { CableColorName };

// Module-level singleton — purely UI state, not part of patch data
const cableShakeTrigger = ref<number>(0);

function shakeCables(): void {
	cableShakeTrigger.value++;
}

export function useCableVisibility() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	// Derive cable visibility from the active slot's patch description (single source of truth)
	const cableVisibility = computed<CableVisibility>(() => {
		const desc = slotsStore.slots[uiStore.activeSlot]?.patch?.description;
		return {
			red: desc?.red !== 0,
			blue: desc?.blue !== 0,
			yellow: desc?.yellow !== 0,
			orange: desc?.orange !== 0,
			green: desc?.green !== 0,
			purple: desc?.purple !== 0,
			white: desc?.white !== 0,
		};
	});

	const allCablesVisible = computed<boolean>(() => {
		return CABLE_COLORS.every((color) => cableVisibility.value[color.name as keyof CableVisibility]);
	});

	function toggleCableVisibility(colorName: keyof CableVisibility): void {
		const desc = slotsStore.slots[uiStore.activeSlot]?.patch?.description;
		if (desc) desc[colorName] = desc[colorName] === 0 ? 1 : 0;
	}

	function toggleShowHideAll(): void {
		const desc = slotsStore.slots[uiStore.activeSlot]?.patch?.description;
		if (!desc) return;
		const hide = allCablesVisible.value;
		CABLE_COLORS.forEach((color) => {
			desc[color.name] = hide ? 0 : 1;
		});
	}

	return {
		// Constants
		cableColors: CABLE_COLORS,
		COLOR_INDEX_TO_NAME: CABLE_COLOR_INDEX_MAP,
		// State
		cableVisibility,
		cableShakeTrigger,
		// Computed
		allCablesVisible,
		// Actions
		toggleCableVisibility,
		toggleShowHideAll,
		shakeCables,
	};
}
