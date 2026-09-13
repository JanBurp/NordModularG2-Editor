import { computed } from 'vue';
import { getAllCategories } from '../renderer/nmg2mods';
import { useSettingsStore } from '../store/settings';

// Module categories to show: all of them, unless the user has "Hidden" modules turned off.
export function useVisibleCategories() {
	const settings = useSettingsStore();
	const categories = computed(() => {
		const others = getAllCategories().filter((c) => c !== 'Hidden');
		return settings.hidden_modules ? [...others, 'Hidden'] : others;
	});
	return { categories };
}
