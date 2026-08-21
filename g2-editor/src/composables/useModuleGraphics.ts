import { ref } from 'vue';

// Shared across all callers: loaded once, reused by every component that shows module graphics.
const graphics = ref<Record<number, string>>({});
let loadPromise: Promise<void> | null = null;

function ensureModuleGraphicsLoaded() {
	if (!loadPromise) {
		loadPromise = window.electronAPI.loadModuleGraphics().then((g) => {
			graphics.value = g;
		});
	}
	return loadPromise;
}

export function useModuleGraphics() {
	ensureModuleGraphicsLoaded();
	return { graphics };
}
