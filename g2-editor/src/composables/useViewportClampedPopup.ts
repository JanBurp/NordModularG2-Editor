import { nextTick, onMounted, onUnmounted, ref, watch, type WatchSource } from 'vue';

// Shared logic for canvas-anchored popups (ModuleModeDropdown.vue, DrumSynthPresetDropdown.vue):
// clamps the popup into the viewport whenever its anchor/zoom (or any extra dep) changes, and
// closes it on Escape.
export function useViewportClampedPopup(
	getX: () => number,
	getY: () => number,
	getZoom: () => number,
	onClose: () => void,
	extraWatchSources: WatchSource[] = [],
) {
	const popupEl = ref<HTMLElement | null>(null);
	const adjustedX = ref(getX());
	const adjustedY = ref(getY());

	async function clampToViewport() {
		await nextTick();
		if (!popupEl.value) return;
		// Measured post-scale (the popup is CSS-transform-scaled to match canvas zoom), so use the
		// rendered box, not clientWidth/clientHeight (which ignore transforms).
		const { width: w, height: h } = popupEl.value.getBoundingClientRect();
		adjustedX.value = Math.min(getX(), window.innerWidth - w - 4);
		adjustedY.value = getY() + h > window.innerHeight ? getY() - h : getY();
	}

	watch([getX, getY, getZoom, ...extraWatchSources], clampToViewport, { immediate: true });

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	onMounted(() => window.addEventListener('keydown', onKeydown));
	onUnmounted(() => window.removeEventListener('keydown', onKeydown));

	return { popupEl, adjustedX, adjustedY };
}
