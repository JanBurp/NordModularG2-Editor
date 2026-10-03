<template>
	<g v-for="(d, i) in pathDs" :key="i">
		<path :d="d" class="cable-ghost" />
		<!-- Only a jack-to-jack ghost (auto-suggest) is directly clickable; a live-preview ghost
		     (to = mouse point, click-connect/drag) commits via the window-wide snap click instead. -->
		<path v-if="toIsJack" :d="d" class="cable-ghost-hit" @click.stop="emit('confirm')" />
	</g>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import { getJackSvgPos } from '../../renderer/jackGeometry';
	import { previewCurvePath } from '../../renderer/patchcord';
	import { isGhostJack, type GhostCable, type GhostJack, type GhostPoint } from '../../composables/useGhostCable';

	const props = defineProps<{
		modules: any[];
		ghost: GhostCable | null;
	}>();

	const emit = defineEmits<{ confirm: [] }>();

	const toIsJack = computed(() => !!props.ghost && isGhostJack(props.ghost.to));

	function curve(from: GhostJack, to: GhostJack | GhostPoint): string {
		const f = getJackSvgPos(() => props.modules, from);
		const t = isGhostJack(to) ? getJackSvgPos(() => props.modules, to) : to;
		return f && t ? previewCurvePath(f.x, f.y, t.x, t.y) : '';
	}

	// One path per cable: the main ghost, plus the second cable of a stereo suggestion.
	const pathDs = computed(() => {
		const g = props.ghost;
		if (!g) return [];
		return [curve(g.from, g.to), g.extra ? curve(g.extra.from, g.extra.to) : ''].filter(Boolean);
	});
</script>
