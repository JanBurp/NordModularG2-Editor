import { shallowRef } from 'vue';

// Shared across all callers: loaded once, reused by every component that shows module graphics.
const graphics = shallowRef<Record<number, string>>({});
let loadPromise: Promise<void> | null = null;

function ensureModuleGraphicsLoaded() {
	if (!loadPromise) {
		loadPromise = window.electronAPI
			.loadModuleGraphics()
			.then((g) => {
				graphics.value = g;
			})
			.catch((err) => {
				console.error('Failed to load module graphics:', err);
				loadPromise = null; // allow a later caller to retry
			});
	}
	return loadPromise;
}

export function useModuleGraphics() {
	ensureModuleGraphicsLoaded();
	return { graphics };
}
