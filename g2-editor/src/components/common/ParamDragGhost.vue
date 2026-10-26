<template>
	<div
		v-if="drag.active && drag.payload"
		class="fixed z-50 pointer-events-none px-1.5 py-0.5 rounded text-xs font-bold font-mono border border-black/40 shadow"
		:style="{ left: `${drag.x + 10}px`, top: `${drag.y + 10}px`, background: HINT_FILL, color: '#000' }"
	>
		{{ drag.payload.label }}
	</div>
</template>

<script setup lang="ts">
	// Floating badge that follows the cursor during a Parameter Pages assign-drag (useParamPageDrag.ts),
	// in place of a native HTML5 drag image — mounted once in App.vue.
	import { watch } from 'vue';
	import { HINT_FILL } from '@/constants/ui';
	import { useParamPageDragState } from '@/composables/useParamPageDrag';
	import { useAltHeld } from '@/composables/useParamPageAssign';

	const drag = useParamPageDragState();
	const { altHeld } = useAltHeld();

	// Global cursor feedback for the Alt-drag gesture, centralized here (this component is mounted
	// once, app-wide). These flags only switch the two root classes on; the cursors themselves live in
	// style.css, scoped to the drag source / drop target elements. Setting the cursor on <body>
	// instead does NOT work: `!important` raises the priority of the body's own declaration, it does
	// not beat a cursor declared on the element actually under the pointer (ModuleKnob.vue's inline
	// ns-resize, the param <g>'s cursor-pointer), while it *does* leak onto every element that has no
	// cursor of its own — the exact inverse of what this gesture needs.
	watch(
		[() => drag.active, altHeld],
		([active, alt]) => {
			document.documentElement.classList.toggle('param-dragging', active);
			document.documentElement.classList.toggle('alt-assign', alt && !active);
		},
		{ immediate: true },
	);
</script>
