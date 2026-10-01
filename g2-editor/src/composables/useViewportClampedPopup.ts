import { nextTick, onMounted, onUnmounted, ref, watch, type WatchSource } from 'vue';

// Shared logic for canvas-anchored popups (ModuleModeDropdown.vue, DrumSynthPresetDropdown.vue):
// clamps the popup into the viewport whenever its anchor/zoom (or any extra dep) changes, and
// closes it on Escape. Keyboard access: the popup's `[role=option]` children are focusable
// (initial focus on the `aria-selected` one), Up/Down moves between them, Enter/Space picks.
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

	const options = () => Array.from(popupEl.value?.querySelectorAll<HTMLElement>('[role=option]') ?? []);

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') return onClose();
		const opts = options();
		const idx = opts.indexOf(document.activeElement as HTMLElement);
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			opts[Math.max(0, Math.min(opts.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
		} else if ((e.key === 'Enter' || e.key === ' ') && idx >= 0) {
			e.preventDefault();
			opts[idx].dispatchEvent(new MouseEvent('click', { bubbles: true })); // SVG rows have no .click()
		}
	}

	onMounted(() => {
		window.addEventListener('keydown', onKeydown);
		nextTick(() => (options().find((o) => o.getAttribute('aria-selected') === 'true') ?? options()[0])?.focus());
	});
	onUnmounted(() => window.removeEventListener('keydown', onKeydown));

	return { popupEl, adjustedX, adjustedY };
}
