<template>
	<!-- Rendered after all modules so it always paints above them. -->
	<g
		v-if="target"
		class="knob-spin-v"
		:transform="`translate(${target.x}, ${target.y})`"
		@mousedown.stop="onSpinMouseDown"
		@click.stop
		@mouseleave="uiStore.clearHoveredParam()"
	>
		<use href="#KnobSpinV" width="20" height="10" />
	</g>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import type { ModuleInstance } from '@/types';
	import { getModule, getParamDefault } from '@/renderer/nmg2mods';
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
		const sel = uiStore.keyTargetParam;
		if (!sel || sel.area !== props.areaLabel) return null;
		const mod = props.modules.find((m) => m.index === sel.moduleId);
		const param = mod && getModule(mod.type)?.params?.[sel.paramIndex];
		if (!mod || !param || !isKnob(param.n)) return null;
		const radius = RADII[param.n] ?? 10;
		return {
			moduleIndex: mod.index,
			paramIndex: sel.paramIndex,
			param,
			x: (mod.horiz ?? 0) * 256 + param.x + radius - 8,
			y: (mod.vert ?? 0) * 16 + param.y + radius * 2 + SPIN_OFFSET_Y,
		};
	});

	// The target is pinned at mousedown: with settings.hoverKeyTarget it can move to another knob while the
	// hold repeats (pointer leaves the arrows). The paramIndex arg of the hold composable is unused.
	let pinned: NonNullable<typeof target.value> | null = null;
	function pinnedValue(): number {
		if (!pinned) return 0;
		const areaKey = props.areaLabel === 'va' ? 'voice' : 'fx';
		return slotsStore.slots[uiStore.slotInFocus]?.variations?.[uiStore.variation]?.[areaKey]?.[pinned.moduleIndex]?.[pinned.paramIndex] ?? 0;
	}
	const { onMouseDown } = useSpinnerHoldInteraction(
		'KnobSpinV',
		0,
		pinnedValue,
		(_index, value) => {
			if (pinned) emit('change', pinned.moduleIndex, pinned.paramIndex, value);
		},
		() => (pinned ? getParamDefault(pinned.param) : 0),
	);
	function onSpinMouseDown(e: MouseEvent) {
		pinned = target.value;
		onMouseDown(e);
	}
</script>

<style scoped>
	.knob-spin-v {
		cursor: pointer;
		user-select: none;
	}
</style>
