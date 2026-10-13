<template>
	<div class="flex select-none pt-2" data-testid="patch-adjuster">
		<div v-for="{ knob, label } in ADJUSTER_KNOBS" :key="knob" class="flex flex-col items-center w-16 gap-2" :class="{ 'ml-6': knob === 'modRate' }">
			<Knob type="KnobReset" :value="adjuster.knobs[knob]" @change="(v) => adjuster.setKnob(knob, v)" />
			<span class="text-xs leading-none whitespace-nowrap">{{ label }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed, onMounted, watch } from 'vue';
	import Knob from '../common/Knob.vue';
	import { ADJUSTER_KNOBS } from '../../renderer/patchAdjusterMap';
	import { usePatchAdjusterStore } from '../../store/patchAdjuster';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';

	const adjuster = usePatchAdjusterStore();
	const slotsStore = useSlotsStore();
	const ui = useUiStore();

	// Commit points of the original (ResetUntouchedData): variation/slot focus change, and any param
	// dump — a patch load or module add/delete. Not the patch object itself: mutations like move or
	// recolour replace it too, and those must not re-centre the knobs.
	const moduleSet = computed(() =>
		slotsStore.slots[ui.slotInFocus]?.patch?.areas.map((a) => a.modules.map((m) => `${m.index}:${m.type}`).join(',')).join('|'),
	);

	watch([() => ui.slotInFocus, () => ui.variation, () => slotsStore.slots[ui.slotInFocus]?.name, moduleSet], () => adjuster.commit());
	onMounted(() => adjuster.commit());
</script>
