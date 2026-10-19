<template>
	<img
		v-if="lockedPointer"
		:src="settings.knobMode === 'circular' ? knobRotateCursor : knobLinearCursor"
		width="24"
		height="24"
		class="fixed z-50 pointer-events-none"
		:style="{
			left: `${lockedPointer.x - 12}px`,
			top: `${lockedPointer.y - 12}px`,
			transform: settings.knobMode === 'horizontal' ? 'rotate(90deg)' : undefined,
		}"
	/>
</template>

<script setup lang="ts">
	// Stand-in for the OS cursor, which Pointer Lock hides during a knob drag with settings.knobReturnCursor
	// (useDragInteraction.ts) — mounted once in App.vue.
	import { lockedPointer } from '@/composables/useDragInteraction';
	import { useSettingsStore } from '@/store/settings';
	import knobRotateCursor from '@/assets/cursors/knob-rotate.svg';
	import knobLinearCursor from '@/assets/cursors/knob-linear.svg';

	const settings = useSettingsStore();
</script>
