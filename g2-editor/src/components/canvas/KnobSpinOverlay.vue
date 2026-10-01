<template>
	<!-- Rendered after all modules so it always paints above them. -->
	<g v-if="target" class="knob-spin-v" :transform="`translate(${target.x}, ${target.y})`" @mousedown.stop="onMouseDown" @click.stop>
		<use href="#KnobSpinV" width="20" height="10" />
	</g>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule } from '@/renderer/nmg2mods';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { RADII } from '@/composables/useKnob';
	import { useSpinnerHoldInteraction } from '@/composables/useSpinnerHoldInteraction';
	import { isKnob } from '@/utils/moduleControls';

	// Vertical distance from the knob's top edge to the spinner's top edge, as a multiple of the radius plus an offset.
	// Adjust SPIN_OFFSET_Y to move the spinner closer to / further from the knob.
	const SPIN_OFFSET_Y = 0;

	const props = defineProps<{
		modules: ModuleInstance[];
		areaLabel: 'fx' | 'va';
	}>();

	const emit = defineEmits<{
		change: [moduleIndex: number, paramIndex: number, value: number];
	}>();

	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();

	const target = computed(() => {
		const sel = uiStore.selectedParam;
		if (!sel || uiStore.selectedModulesArea !== props.areaLabel) return null;
		const mod = props.modules.find((m) => m.index === sel.moduleId);
		const param = mod && getModule(mod.type)?.params?.[sel.paramIndex];
		if (!mod || !param || !isKnob(param.n)) return null;
		const radius = RADII[param.n] ?? 10;
		const areaKey = props.areaLabel === 'va' ? 'voice' : 'fx';
		const value = slotsStore.slots[uiStore.slotInFocus]?.variations?.[uiStore.variation]?.[areaKey]?.[mod.index]?.[sel.paramIndex] ?? 0;
		return {
			moduleIndex: mod.index,
			paramIndex: sel.paramIndex,
			value,
			x: (mod.horiz ?? 0) * 256 + param.x + radius - 8,
			y: (mod.vert ?? 0) * 16 + param.y + radius * 2 + SPIN_OFFSET_Y,
		};
	});

	// The hold composable is created once; it reads the current target at call time, so the paramIndex arg is unused.
	const { onMouseDown } = useSpinnerHoldInteraction(
		'KnobSpinV',
		0,
		() => target.value?.value ?? 0,
		(_index, value) => {
			if (target.value) emit('change', target.value.moduleIndex, target.value.paramIndex, value);
		},
	);
</script>

<style scoped>
	.knob-spin-v {
		cursor: pointer;
		user-select: none;
	}
</style>
