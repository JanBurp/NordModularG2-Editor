<template>
	<div
		v-if="hint"
		class="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 px-1 font-mono font-bold text-[10px] leading-[11px] text-center text-black whitespace-pre border border-black"
		:style="{ left: `${hint.x}px`, top: `${hint.y}px`, background: HINT_FILL, boxShadow: 'inset 0 0 0 1px #FFF', paddingBlock: '2px' }"
	>
		{{ hint.text }}
	</div>
</template>

<script setup lang="ts">
	// Value hint for HTML controls outside the patch canvas (morph group knobs, patch level, patch
	// settings), styled like the canvas hint badges (MidiBadge) — mounted once in App.vue.
	import { computed } from 'vue';
	import { HINT_FILL } from '@/constants/ui';
	import { useUiStore } from '@/store/ui';
	import { toolbarHintAnchor } from '@/composables/useValueHint';
	import { morphHintCenter, paramHintCenter, type Rect } from '@/utils/hintPlacement';

	const uiStore = useUiStore();

	const toRect = (r: { left: number; top: number; width: number; height: number }): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });

	const hint = computed(() => {
		const h = uiStore.valueHint;
		const anchor = h?.area === 'toolbar' ? toolbarHintAnchor(h) : undefined;
		if (!h || !anchor?.el.isConnected) return null;
		const ctrl = toRect(anchor.el.getBoundingClientRect());
		const boundsEl = anchor.el.closest('[data-hint-bounds]');
		const bounds = boundsEl ? toRect(boundsEl.getBoundingClientRect()) : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
		const at = anchor.place === 'panel' ? paramHintCenter(ctrl, bounds) : morphHintCenter(ctrl, bounds, anchor.place, h.paramIndex % 8);
		return { ...at, text: anchor.text() };
	});
</script>
