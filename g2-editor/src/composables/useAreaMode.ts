import { computed } from 'vue';
import type { Ref } from 'vue';
import { useUiStore } from '@/store/ui';
import { MODULE_ROW_HEIGHT } from '@/constants/ui';

export function useAreaMode(containerRef?: Ref<HTMLElement | null>) {
	const uiStore = useUiStore();

	const isSplit = computed(() => uiStore.area === 2);
	const showVoice = computed(() => uiStore.area === 1 || uiStore.area === 2);
	const showFx = computed(() => uiStore.area === 0 || uiStore.area === 2);

	const voiceWrapperStyle = computed(() => (isSplit.value ? { height: uiStore.dividerPos + '%' } : {}));

	function startDividerDrag(event: MouseEvent) {
		event.preventDefault();
		const container = containerRef?.value;
		if (!container) return;
		const el = container;

		function onMove(e: MouseEvent) {
			const rect = el.getBoundingClientRect();
			const rawY = e.clientY - rect.top;
			const clampedY = Math.max(MODULE_ROW_HEIGHT, Math.min(rect.height - MODULE_ROW_HEIGHT, rawY));
			uiStore.setDividerPos((clampedY / rect.height) * 100);
		}
		function onUp() {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		}
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	function handleAreaChange(value: string | number | (string | number)[]) {
		if (Array.isArray(value)) return;
		uiStore.setAreaMode(value as 0 | 1 | 2);
	}

	function handleAreaToggleOff(value: string | number) {
		if (value === 2) uiStore.toggleSplit();
		// Voice/FX toggle-off: ignore — one must always be active in non-split mode
	}

	return { isSplit, showVoice, showFx, voiceWrapperStyle, startDividerDrag, handleAreaChange, handleAreaToggleOff };
}
