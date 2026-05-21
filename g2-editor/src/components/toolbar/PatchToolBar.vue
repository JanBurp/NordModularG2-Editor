<template>
	<ToolBar v-if="patchName">
		<ToolBarLabel class="w-8">Patch:</ToolBarLabel>
		<ToolBarText class="w-36 cursor-pointer hover:text-white" @click="emit('patchNameClick')">{{ patchName }}</ToolBarText>

		<div class="flex items-center gap-1.5">
			<ToolBarLabel>Cat:</ToolBarLabel>
			<Select v-model="selectedCategory" :options="soundCategories" title="Sound Category" />
		</div>

		<ToolBarDivider />

		<Select v-model="selectedVoiceMode" :options="VOICEMODE_OPTIONS" title="Voice mode" />
		<div class="flex items-center gap-1 w-20">
			<Select v-model="selectedVoices" :options="VOICES" title="Voice count" :disabled="selectedVoiceMode !== 0" />
			<ToolBarBigLabel>({{ assignedVoices }})</ToolBarBigLabel>
		</div>

		<ToolBarDivider />

		<div class="flex items-center gap-2">
			<BtnGroup
				v-model="uiStore.variation"
				:options="VARIATION_OPTIONS"
				variant="variation"
				testIdPrefix="variation"
				@update:model-value="(v) => emit('variationClick', v)"
			/>
		</div>

		<ToolBarLabel>Patch<br />Level:</ToolBarLabel>
		<div class="module-bevel px-1 h-8 flex items-baseline">
			<Knob :value="patchParams?.[uiStore.variation]?.patchVol ?? 100" @change="(val) => slotsStore.setPatchParam(uiStore.variation, 'patchVol', val)" />
			<Switch
				:value="patchParams?.[uiStore.variation]?.activeMuted ?? 1"
				paramType="ActiveMonitor"
				@change="(val) => slotsStore.setPatchParam(uiStore.variation, 'activeMuted', val)"
			/>
		</div>

		<ToolBarDivider />

		<ColorPicker />

		<ToolBarDivider />

		<CableVisibilitySelector />
	</ToolBar>
</template>

<script setup lang="ts">
	import { computed, ref, watch } from 'vue';
	import ToolBar from './ToolBar.vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import ToolBarBigLabel from './ToolBarBigLabel.vue';
	import ToolBarText from './ToolBarText.vue';
	import ToolBarDivider from './ToolBarDivider.vue';
	import BtnGroup from './BtnGroup.vue';
	import Select from '../common/Select.vue';
	import ColorPicker from '../common/ColorPicker.vue';
	import CableVisibilitySelector from './CableVisibilitySelector.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { useDeviceStore } from '../../store/device';
	import { SOUND_CATEGORIES as soundCategories, VARIATION_OPTIONS } from '../../constants';
	import { VOICEMODE_OPTIONS, VOICES } from '../../types/patch';
	import Knob from '../common/Knob.vue';
	import Switch from '../common/Switch.vue';

	defineProps<{ patchName: string }>();
	const emit = defineEmits<{
		variationClick: [value: string | number | (string | number)[]];
		patchNameClick: [];
	}>();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const deviceStore = useDeviceStore();

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));
	const patchParams = computed(() => slotsStore.getPatchParams(uiStore.slotInFocus));

	const selectedCategory = ref<number>(0);
	watch(
		() => (currentPatch.value as any)?.description?.category,
		(cat) => {
			if (cat !== undefined && cat !== null) selectedCategory.value = cat;
		},
		{ immediate: true },
	);
	watch(selectedCategory, (cat) => {
		const desc = (currentPatch.value as any)?.description;
		if (desc) desc.category = cat;
	});

	const selectedVoiceMode = computed({
		get: () => currentPatch.value?.description?.monopoly ?? 1,
		set: (val: number) => {
			if (currentPatch.value?.description) {
				currentPatch.value.description.monopoly = val;
				slotsStore.setPatchDescription();
			}
		},
	});
	const selectedVoices = computed({
		get: () => currentPatch.value?.description?.voices ?? 0,
		set: (val: number) => {
			if (currentPatch.value?.description) {
				currentPatch.value.description.voices = val;
				slotsStore.setPatchDescription();
			}
		},
	});
	const assignedVoices = computed(() => deviceStore.assignedVoicesForSlot(uiStore.slotInFocus));
</script>
