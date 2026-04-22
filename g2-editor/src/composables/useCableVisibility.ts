import { reactive, computed, ref } from "vue";
import {
	CABLE_COLORS,
	CABLE_COLOR_INDEX_MAP,
	DEFAULT_CABLE_VISIBILITY,
	type CableColorName,
} from "../constants";

export interface CableVisibility {
	red: boolean;
	blue: boolean;
	yellow: boolean;
	orange: boolean;
	green: boolean;
	purple: boolean;
	white: boolean;
}

export interface Cable {
	colour: number;
	// Add other cable properties as needed
	[key: string]: any;
}

// Re-export constants for backward compatibility
export {
	CABLE_COLORS as cableColors,
	CABLE_COLOR_INDEX_MAP as COLOR_INDEX_TO_NAME,
};
export type { CableColorName };

export interface PatchDescription {
	red?: number;
	blue?: number;
	yellow?: number;
	orange?: number;
	green?: number;
	purple?: number;
	white?: number;
	[key: string]: any;
}

export function useCableVisibility() {
	// Local aliases for constants
	const cableColors = CABLE_COLORS;
	const COLOR_INDEX_TO_NAME = CABLE_COLOR_INDEX_MAP;

	// Cable visibility state (reactive object)
	const cableVisibility = reactive<CableVisibility>({
		...DEFAULT_CABLE_VISIBILITY,
	});

	// Cable shake trigger for re-rendering
	const cableShakeTrigger = ref<number>(0);

	// Computed property for H button - true when all cables are visible
	const allCablesVisible = computed<boolean>(() => {
		return cableColors.every(
			(color) => cableVisibility[color.name as keyof CableVisibility],
		);
	});

	// Toggle cable visibility
	function toggleCableVisibility(colorName: keyof CableVisibility): void {
		cableVisibility[colorName] = !cableVisibility[colorName];
	}

	// Toggle between show all and hide all
	function toggleShowHideAll(): void {
		if (allCablesVisible.value) {
			// Hide all
			cableColors.forEach((color) => {
				cableVisibility[color.name as keyof CableVisibility] = false;
			});
		} else {
			// Show all
			cableColors.forEach((color) => {
				cableVisibility[color.name as keyof CableVisibility] = true;
			});
		}
	}

	// Shake/re-render cables
	function shakeCables(): void {
		cableShakeTrigger.value++;
	}

	// Sync visibility state with patch data
	function syncWithPatchData(
		description: PatchDescription | null | undefined,
	): void {
		if (description) {
			cableColors.forEach((color) => {
				if (description[color.name] !== undefined) {
					cableVisibility[color.name as keyof CableVisibility] =
						description[color.name] === 1;
				}
			});
		}
	}

	// Update patch data from visibility state
	function updatePatchData(
		description: PatchDescription | null | undefined,
	): void {
		if (description) {
			cableColors.forEach((color) => {
				description[color.name] = cableVisibility[
					color.name as keyof CableVisibility
				]
					? 1
					: 0;
			});
		}
	}

	// Filter cables based on visibility settings
	function filterVisibleCables(cables: Cable[]): Cable[] {
		return cables.filter((cable) => {
			const colorIndex = cable.colour;
			const colorName = COLOR_INDEX_TO_NAME[colorIndex];
			return colorName ? cableVisibility[colorName] !== false : true;
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
		syncWithPatchData,
		updatePatchData,
		filterVisibleCables,
	};
}
