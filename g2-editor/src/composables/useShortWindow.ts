import { ref, type Ref } from 'vue';

// Windows shorter than this (e.g. a 7" 800×480 screen) get the slim ExtendedToolBar: single-row module
// picker with a category dropdown, mini load meter, morph sources in the right-click menu.
export const SHORT_WINDOW_HEIGHT = 600;

let short: Ref<boolean> | null = null;

// One shared, reactive matchMedia for every component
export function useShortWindow(): Ref<boolean> {
	if (!short) {
		const query = window.matchMedia(`(max-height: ${SHORT_WINDOW_HEIGHT - 1}px)`);
		const state = ref(query.matches);
		query.addEventListener('change', (e) => (state.value = e.matches));
		short = state;
	}
	return short;
}
