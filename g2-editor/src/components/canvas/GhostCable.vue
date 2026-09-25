<template>
	<g v-if="pathD">
		<path :d="pathD" class="cable-ghost" />
		<!-- Only a jack-to-jack ghost (auto-suggest) is directly clickable; a live-preview ghost
		     (to = mouse point, click-connect/drag) commits via the window-wide snap click instead. -->
		<path v-if="toIsJack" :d="pathD" class="cable-ghost-hit" @click.stop="emit('confirm')" />
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import { getJackSvgPos } from '../../renderer/jackGeometry';
	import { previewCurvePath } from '../../renderer/patchcord';
	import { isGhostJack, type GhostCable } from '../../composables/useGhostCable';

	const props = defineProps<{
		modules: any[];
		ghost: GhostCable | null;
	}>();

	const emit = defineEmits<{ confirm: [] }>();

	const toIsJack = computed(() => !!props.ghost && isGhostJack(props.ghost.to));

	const pathD = computed(() => {
		if (!props.ghost) return '';
		const from = getJackSvgPos(() => props.modules, props.ghost.from);
		const to = isGhostJack(props.ghost.to) ? getJackSvgPos(() => props.modules, props.ghost.to) : props.ghost.to;
		if (!from || !to) return '';
		return previewCurvePath(from.x, from.y, to.x, to.y);
	});
</script>
