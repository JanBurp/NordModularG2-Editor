<template>
	<ToolBar v-if="patchName">
		<ToolBarLabel class="w-8">Patch:</ToolBarLabel>
		<ToolBarText class="w-36">{{ patchName }}</ToolBarText>

		<div class="flex items-center gap-1.5">
			<ToolBarLabel>Cat:</ToolBarLabel>
			<Select v-model="selectedCategory" :options="soundCategories" title="Sound Category" />
		</div>

		<ToolBarDivider />

		<Select v-model="selectedVoiceMode" :options="VOICEMODE_OPTIONS" title="Voice mode" />
		<Select v-model="selectedVoices" :options="VOICES" title="Voice mode" :disabled="selectedVoiceMode !== 0" />

		<ToolBarDivider />

		<div class="flex items-center gap-2">
			<BtnGroup v-model="uiStore.variation" :options="VARIATION_OPTIONS" variant="variation" @update:model-value="(v) => emit('variationClick', v)" />
		</div>

		<ToolBarDivider />

		<ColorPicker />

		<ToolBarDivider />

		<CableVisibilitySelector />

		<ToolBarDivider />

		<CPU :va="{ cycles: 25, memory: 33 }" :fx="{ cycles: 12.3, memory: 100 }"></CPU>
	</ToolBar>
</template>

<script setup lang="ts">
	import { computed, ref, watch } from 'vue';
	import ToolBar from './ToolBar.vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import ToolBarText from './ToolBarText.vue';
	import ToolBarDivider from './ToolBarDivider.vue';
	import BtnGroup from './BtnGroup.vue';
	import Select from '../common/Select.vue';
	import ColorPicker from '../common/ColorPicker.vue';
	import CableVisibilitySelector from './CableVisibilitySelector.vue';
	import CPU from './CPU.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { SOUND_CATEGORIES as soundCategories, VARIATION_OPTIONS } from '../../constants';
	import { VOICEMODE_OPTIONS, VOICES } from '../../types/patch';

	defineProps<{ patchName: string }>();
	const emit = defineEmits<{ variationClick: [value: string | number | (string | number)[]] }>();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.activeSlot));

	const selectedCategory = ref<number>(0);
	watch(
		() => (currentPatch.value as any)?.description?.category,
		(cat) => { if (cat !== undefined && cat !== null) selectedCategory.value = cat; },
		{ immediate: true },
	);
	watch(selectedCategory, (cat) => {
		const desc = (currentPatch.value as any)?.description;
		if (desc) desc.category = cat;
	});

	const selectedVoiceMode = computed({
		get: () => currentPatch.value?.description?.monopoly ?? 1,
		set: (val: number) => {
			if (currentPatch.value?.description) currentPatch.value.description.monopoly = val;
		},
	});
	const selectedVoices = computed({
		get: () => currentPatch.value?.description?.voices ?? 0,
		set: (val: number) => {
			if (currentPatch.value?.description) currentPatch.value.description.voices = val;
		},
	});
</script>
