<template>
	<span class="text text-nowrap overflow-hidden text-ellipsis h-6 bg-surface-2" @mouseenter="hint && showHint(hint)" @mouseleave="hint && clearHint()">
		<slot></slot>
	</span>
</template>

<script setup lang="ts">
	import type { StatusHintKey } from '@/constants/statusHints';
	import { useStatusHint } from '@/composables/useStatusHint';

	defineProps<{ hint?: StatusHintKey }>();
	const { showHint, clearHint } = useStatusHint();
</script>
