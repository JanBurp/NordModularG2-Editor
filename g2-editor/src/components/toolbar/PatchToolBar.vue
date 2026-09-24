<template>
	<ToolBar>
		<ToolBarLabel class="w-10">Patch:</ToolBarLabel>
		<ToolBarText class="w-36 cursor-pointer hover:text-input" hint="renamePatch" @click="emit('patchNameClick')">{{ patchName }}</ToolBarText>

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
				:model-value="uiStore.variation"
				:options="VARIATION_OPTIONS"
				variant="variation"
				testIdPrefix="variation"
				draggable
				@update:model-value="onVariationSelect"
				@btn-dragstart="onVariationDragStart"
				@btn-drop="onVariationDrop"
				@btn-contextmenu="onVariationContextMenu"
			/>
		</div>

		<ToolBarDivider />
		<ColorPicker />
		<ToolBarDivider />
		<CableVisibilitySelector />
		<ToolBarDivider />
		<PatchLevel />
	</ToolBar>
</template>

<script setup lang="ts">
	import { computed, ref } from 'vue';

	import ToolBar from './ToolBar.vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import ToolBarBigLabel from './ToolBarBigLabel.vue';
	import ToolBarText from './ToolBarText.vue';
	import ToolBarDivider from './ToolBarDivider.vue';
	import BtnGroup from './BtnGroup.vue';
	import Select from '../common/Select.vue';
	import CableVisibilitySelector from './CableVisibilitySelector.vue';
	import PatchLevel from './PatchLevel.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { SOUND_CATEGORIES as soundCategories, VARIATION_OPTIONS } from '../../constants';
	import { VOICEMODE_OPTIONS, VOICES } from '../../types/patch';
	import ColorPicker from '../common/ColorPicker.vue';

	withDefaults(defineProps<{ patchName: string; mode?: 'classic' | 'compact' }>(), { mode: 'classic' });
	const emit = defineEmits<{
		variationClick: [value: string | number | (string | number)[]];
		patchNameClick: [];
	}>();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));

	const selectedCategory = computed({
		get: () => currentPatch.value?.description?.category ?? 0,
		set: (val: number) => {
			if (currentPatch.value?.description) {
				slotsStore.setPatchDescriptionField('category', Number(val));
				slotsStore.setPatchDescription();
			}
		},
	});

	const selectedVoiceMode = computed({
		get: () => currentPatch.value?.description?.monopoly ?? 1,
		set: (val: number) => {
			if (currentPatch.value?.description) {
				slotsStore.setPatchDescriptionField('monopoly', Number(val));
				slotsStore.setPatchDescription();
			}
		},
	});
	const selectedVoices = computed({
		get: () => currentPatch.value?.description?.voices ?? 0,
		set: (val: number) => {
			if (currentPatch.value?.description) {
				slotsStore.setPatchDescriptionField('voices', Number(val));
				slotsStore.setPatchDescription();
			}
		},
	});
	const assignedVoices = computed(() => slotsStore.assignedVoicesForSlot(uiStore.slotInFocus));

	const { open: openContextMenu } = useContextMenu();
	const dragFrom = ref<number | null>(null);

	function onVariationSelect(v: string | number | (string | number)[]) {
		const idx = v as number;
		if (idx === 8) {
			slotsStore.copyVariation(8, uiStore.variation);
			return;
		}
		emit('variationClick', idx);
	}

	function onVariationDragStart(v: string | number) {
		dragFrom.value = v as number;
	}

	async function onVariationDrop(v: string | number) {
		const target = v as number;
		if (dragFrom.value === null || dragFrom.value === target) return;
		const from = dragFrom.value;
		dragFrom.value = null;
		await slotsStore.copyVariation(from, target);
	}

	function onVariationContextMenu(v: string | number, event: MouseEvent) {
		const varIdx = v as number;
		const items: { type?: 'separator'; label?: string; action?: () => void }[] = VARIATION_OPTIONS.filter(
			(opt) => opt.value !== varIdx && opt.value !== 8,
		).map((opt) => ({ label: `Copy to ${opt.label.trim()}`, action: () => slotsStore.copyVariation(varIdx, opt.value) }));
		if (varIdx !== 8) {
			items.push({ type: 'separator' });
			items.push({ label: 'Copy to INIT', action: () => slotsStore.copyVariation(varIdx, 8) });
			items.push({ type: 'separator' });
			items.push({ label: 'Set to Init', action: () => slotsStore.copyVariation(8, varIdx) });
		}
		openContextMenu(event, items);
	}
</script>
