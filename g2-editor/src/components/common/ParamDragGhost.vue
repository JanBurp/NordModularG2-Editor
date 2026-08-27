<template>
	<div
		v-if="drag.active && drag.payload"
		class="fixed z-50 pointer-events-none px-1.5 py-0.5 rounded text-xs font-bold font-mono border border-black/40 shadow"
		:style="{ left: `${drag.x + 10}px`, top: `${drag.y + 10}px`, background: '#8bd3ff', color: '#000' }"
	>
		{{ drag.payload.label }}
	</div>
</template>

<script setup lang="ts">
	// Floating badge that follows the cursor during a Parameter Pages assign-drag (useParamPageDrag.ts),
	// in place of a native HTML5 drag image — mounted once in App.vue.
	import { watch } from 'vue';
	import { useParamPageDragState } from '@/composables/useParamPageDrag';
	import { useAltHeld } from '@/composables/useParamPageAssign';

	const drag = useParamPageDragState();
	const { altHeld } = useAltHeld();

	// Global cursor feedback for the Alt-drag gesture, centralized here (this component is mounted
	// once, app-wide) rather than as a per-element CSS class: a plain class-based cursor on the
	// draggable param/knob loses to child widgets' own inline `cursor` style (e.g. Knob.vue's
	// ns-resize/ew-resize), so `!important` is needed to reliably win over those while Alt is held or
	// a drag is in progress.
	watch(
		[() => drag.active, altHeld],
		([active, alt]) => {
			if (active) document.body.style.setProperty('cursor', 'grabbing', 'important');
			else if (alt) document.body.style.setProperty('cursor', 'grab', 'important');
			else document.body.style.removeProperty('cursor');
		},
		{ immediate: true },
	);
</script>
