import { computed } from 'vue';
import { getAllCategories } from '../renderer/nmg2mods';
import { useSettingsStore } from '../store/settings';

// Module categories to show: all of them, unless the user has "Hidden" modules turned off.
export function useVisibleCategories() {
	const settings = useSettingsStore();
	const categories = computed(() => {
		const all = getAllCategories();
		return settings.hidden_modules ? all : all.filter((c) => c !== 'Hidden');
	});
	return { categories };
}
