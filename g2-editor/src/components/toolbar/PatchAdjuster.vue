<template>
	<!-- Envelope and tone: two groups of four. A narrower side panel (@container in SidePanel) first shrinks the
	     knob spacing and labels (cqw); only below ~420px does the tone group wrap onto a second row. -->
	<div class="flex flex-wrap gap-x-[clamp(0.5rem,4cqw,1.5rem)] gap-y-3 select-none pt-2 text-[clamp(9px,2cqw,12px)]" data-testid="patch-adjuster">
		<div v-for="(group, g) in GROUPS" :key="g" class="flex">
			<div v-for="{ knob, label } in group" :key="knob" class="flex flex-col items-center w-[clamp(2.75rem,10.5cqw,4rem)] gap-2">
				<Knob type="KnobReset" :value="adjuster.knobs[knob]" @change="(v) => adjuster.setKnob(knob, v)" />
				<span class="leading-none whitespace-nowrap">{{ label }}</span>
			</div>
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

	const GROUPS = [ADJUSTER_KNOBS.slice(0, 4), ADJUSTER_KNOBS.slice(4)]; // Attack…Release, Mod. Rate…Effects
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
