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
				draggable
				@update:model-value="(v) => emit('variationClick', v)"
				@btn-dragstart="onVariationDragStart"
				@btn-drop="onVariationDrop"
				@btn-contextmenu="onVariationContextMenu"
			/>
		</div>

		<Dialog v-model="confirmDialog" title="Copy Variation" @confirm="onConfirmCopy">
			{{ confirmMessage }}
		</Dialog>

		<ColorPicker />

		<ToolBarDivider />

		<CableVisibilitySelector />

		<ToolBarDivider />
		<Button variant="default" size="small" :disabled="!canUndo" @click="slotsStore.undo()" title="Undo (⌘Z)">
			<Icon name="undo" class="w-3.5 h-3.5" />
		</Button>
		<Button variant="default" size="small" :disabled="!canRedo" @click="slotsStore.redo()" title="Redo (⇧⌘Z)">
			<Icon name="redo" class="w-3.5 h-3.5" />
		</Button>
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
	import ColorPicker from '../common/ColorPicker.vue';
	import CableVisibilitySelector from './CableVisibilitySelector.vue';
	import Button from './Button.vue';
	import Icon from '../common/Icon.vue';
	import Dialog from '../common/Dialog.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useHistoryStore } from '../../store/history';
	import { useUiStore } from '../../store/ui';
	import { useContextMenu } from '../../composables/useContextMenu';
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

	const selectedCategory = computed({
		get: () => currentPatch.value?.description?.category ?? 0,
		set: (val: number) => {
			if (currentPatch.value?.description) {
				currentPatch.value.description.category = Number(val);
				slotsStore.setPatchDescription();
			}
		},
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

	const { open: openContextMenu } = useContextMenu();
	const dragFrom = ref<number | null>(null);
	const confirmDialog = ref(false);
	const confirmMessage = ref('');
	const pendingCopy = ref<{ from: number; to: number } | null>(null);

	function onVariationDragStart(v: string | number) {
		dragFrom.value = v as number;
	}

	function onVariationDrop(v: string | number) {
		const target = v as number;
		if (dragFrom.value === null || dragFrom.value === target) return;
		const from = dragFrom.value;
		dragFrom.value = null;
		confirmMessage.value = `Copy variation ${VARIATION_OPTIONS[from].label.trim()} to ${VARIATION_OPTIONS[target].label.trim()}?`;
		pendingCopy.value = { from, to: target };
		confirmDialog.value = true;
	}

	async function onConfirmCopy() {
		if (!pendingCopy.value) return;
		await slotsStore.copyVariation(pendingCopy.value.from, pendingCopy.value.to);
		pendingCopy.value = null;
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
