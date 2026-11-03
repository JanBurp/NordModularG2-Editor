<template>
	<!-- Mini Patch Mutator: rewrites the current variation in place (selected modules, or the whole patch) -->
	<ToolBarLabel>Mutator:</ToolBarLabel>
	<div class="flex items-center gap-1" data-testid="mini-mutator">
		<div class="flex items-center gap-1 text-xs" @mouseenter="showHint('miniMutateProb')" @mouseleave="clearHint">
			<span class="param-display w-10 text-center">{{ Math.round(mutator.current.prob * 100) }}%</span>
			<Knob :value="Math.round(mutator.current.prob * 127)" :default-value="Math.round(DEFAULT_PROB * 127)" @change="(v) => mutator.setProb(v / 127)" />
		</div>
		<Button variant="default" size="xs" hint="miniMutate" :disabled="!hasPatch" @click="mutator.mutateCurrent('mutate')">Mutate</Button>
		<Button variant="default" size="xs" hint="miniRandomize" :disabled="!hasPatch" @click="mutator.mutateCurrent('randomize')">Randomize</Button>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import Button from './Button.vue';
	import Knob from '../common/Knob.vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import { useMutatorStore } from '../../store/mutator';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { useStatusHint } from '../../composables/useStatusHint';
	import { DEFAULT_PROB } from '../../renderer/mutator';

	const mutator = useMutatorStore();
	const slots = useSlotsStore();
	const uiStore = useUiStore();
	const { showHint, clearHint } = useStatusHint();

	const hasPatch = computed(() => !!slots.slots[uiStore.slotInFocus].variations);
</script>
