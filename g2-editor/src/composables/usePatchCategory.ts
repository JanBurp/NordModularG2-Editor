import { ref, watch, type Ref } from "vue";
import { SOUND_CATEGORIES, type SoundCategory } from "../constants";

export interface PatchDescription {
	category?: number;
	[key: string]: any;
}

export interface Patch {
	description?: PatchDescription;
	[key: string]: any;
}

// Re-export for backward compatibility
export { SOUND_CATEGORIES as soundCategories };
export type { SoundCategory };

export function usePatchCategory(patchRef: Ref<Patch>) {
	// Selected category
	const selectedCategory = ref<number>(0);

	// Watch for patch changes and set category from patch data
	watch(
		() => patchRef.value?.description?.category,
		(newCategory) => {
			if (newCategory !== undefined && newCategory !== null) {
				selectedCategory.value = newCategory;
			}
		},
		{ immediate: true },
	);

	// Watch for category changes and update patch data
	watch(selectedCategory, (newCategory) => {
		if (patchRef.value?.description) {
			patchRef.value.description.category = newCategory;
		}
	});

	return {
		// Constants
		soundCategories: SOUND_CATEGORIES,
		// State
		selectedCategory,
	};
}
