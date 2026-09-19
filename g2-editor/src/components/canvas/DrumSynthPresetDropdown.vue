<template>
	<Teleport to="body">
		<div class="fixed inset-0 z-40" @click="emit('close')" @contextmenu.prevent="emit('close')" />
		<div
			ref="popupEl"
			data-testid="drumsynth-preset-dropdown"
			class="fixed z-50 min-w-16 max-h-80 overflow-y-auto bg-surface-2 border border-line-default shadow-lg flex flex-col"
			:style="{ left: adjustedX + 'px', top: adjustedY + 'px', transform: `scale(${zoom})`, transformOrigin: 'top left' }"
		>
			<div
				v-for="(preset, i) in DRUM_SYNTH_PRESETS"
				:key="preset.name"
				class="px-2 py-1 text-xs whitespace-nowrap cursor-pointer"
				:class="i === selectedIndex ? 'bg-input text-black' : 'text-content-primary hover:bg-surface-3'"
				:data-testid="`drumsynth-preset-option-${i}`"
				@click="onSelect(i)"
			>
				{{ preset.name }}
			</div>
		</div>
	</Teleport>
</template>
<script setup lang="ts">
	import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
	import { useSettingsStore } from '../../store/settings';
	import { DRUM_SYNTH_PRESETS } from '../../renderer/drumSynthPresets';

	const props = defineProps<{
		x: number;
		y: number;
		selectedIndex: number;
	}>();

	const emit = defineEmits<{
		select: [index: number];
		close: [];
	}>();

	const settingsStore = useSettingsStore();
	const zoom = computed(() => settingsStore.canvasZoom);

	const popupEl = ref<HTMLElement | null>(null);
	const adjustedX = ref(props.x);
	const adjustedY = ref(props.y);

	// Same viewport-clamping approach as ModuleModeDropdown.vue: measure post-scale (the popup is
	// CSS-transform-scaled to match canvas zoom), then flip above the click point if it would
	// overflow the bottom edge.
	async function clampToViewport() {
		await nextTick();
		if (!popupEl.value) return;
		const { width: w, height: h } = popupEl.value.getBoundingClientRect();
		adjustedX.value = Math.min(props.x, window.innerWidth - w - 4);
		adjustedY.value = props.y + h > window.innerHeight ? props.y - h : props.y;
	}

	watch(() => [props.x, props.y, zoom.value], clampToViewport, { immediate: true });

	// Scroll the currently-matched preset into view on open, so picking from a long list doesn't
	// always start scrolled to the top.
	onMounted(() => {
		nextTick(() => {
			popupEl.value?.querySelector<HTMLElement>(`[data-testid="drumsynth-preset-option-${props.selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' });
		});
	});

	function onSelect(index: number) {
		emit('select', index);
		emit('close');
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') emit('close');
	}

	onMounted(() => window.addEventListener('keydown', onKeydown));
	onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>
