<template>
	<div
		v-if="visible"
		class="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none px-1 font-mono font-bold text-[10px] leading-[11px] text-black whitespace-pre border border-black"
		:style="{ background: HINT_FILL, boxShadow: 'inset 0 0 0 1px #FFF', paddingBlock: '2px' }"
	>
		{{ text }}
	</div>
</template>

<script setup lang="ts">
	// Name badge centred over a Parameter Page level meter (VuMeterRound/VuMeterBar), styled like
	// ToolbarValueHint; shown on hover and, like the canvas badges, while F7 is held.
	import { HINT_FILL } from '@/constants/ui';

	defineProps<{ text: string; visible: boolean }>();
</script>
