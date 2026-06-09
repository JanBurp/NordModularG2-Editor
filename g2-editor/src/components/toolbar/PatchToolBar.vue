<template>
	<ToolBar v-if="patchName">
		<ToolBarLabel class="w-10">Patch:</ToolBarLabel>
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

		<ColorPicker />

		<ToolBarDivider />

		<CableVisibilitySelector />

		<ToolBarDivider />
		<Button variant="default" size="small" :disabled="!canUndo" @click="slotsStore.undo()" title="Undo (⌘Z)">
			<svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M3 9a5.5 5.5 0 1 0 1.5-3.5"/>
				<polyline points="1,3 3,6 6,4"/>
			</svg>
		</Button>
		<Button variant="default" size="small" :disabled="!canRedo" @click="slotsStore.redo()" title="Redo (⇧⌘Z)">
			<svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M13 9a5.5 5.5 0 1 1-1.5-3.5"/>
				<polyline points="15,3 13,6 10,4"/>
			</svg>
		</Button>
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
	import Button from './Button.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useHistoryStore } from '../../store/history';
	import { useUiStore } from '../../store/ui';
	import { SOUND_CATEGORIES as soundCategories, VARIATION_OPTIONS } from '../../constants';
	import { VOICEMODE_OPTIONS, VOICES } from '../../types/patch';

	defineProps<{ patchName: string }>();
	const emit = defineEmits<{
		variationClick: [value: string | number | (string | number)[]];
		patchNameClick: [];
	}>();

	const slotsStore = useSlotsStore();
	const historyStore = useHistoryStore();
	const uiStore = useUiStore();

	const canUndo = computed(() => historyStore.canUndo(uiStore.slotInFocus));
	const canRedo = computed(() => historyStore.canRedo(uiStore.slotInFocus));

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));

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
				currentPatch.value.description.monopoly = Number(val);
				slotsStore.setPatchDescription();
			}
		},
	});
	const selectedVoices = computed({
		get: () => currentPatch.value?.description?.voices ?? 0,
		set: (val: number) => {
			if (currentPatch.value?.description) {
				currentPatch.value.description.voices = Number(val);
				slotsStore.setPatchDescription();
			}
		},
	});
	const assignedVoices = computed(() => slotsStore.assignedVoicesForSlot(uiStore.slotInFocus));
</script>
