<template>
	<ToolBar>
		<ToolBarLabel>Param<br />Pages:</ToolBarLabel>
		<BtnGroup
			:model-value="uiStore.displayedParamPage"
			:options="pageOptions"
			variant="toggle"
			testIdPrefix="param-page"
			@update:model-value="(v) => uiStore.setDisplayedParamPage(v as number)"
		/>
		<BtnGroup
			:model-value="uiStore.selectedParamBank + 1"
			:options="bankOptions"
			variant="variation"
			testIdPrefix="param-bank"
			@update:model-value="(v) => uiStore.setSelectedParamBank((v as number) - 1)"
		/>

		<ToolBarDivider />

		<div class="flex items-center gap-2">
			<div
				v-for="cell in cells"
				:key="cell.slotIndex"
				class="flex flex-col items-center w-14"
				:draggable="altHeld"
				@dragstart="onCellDragStart(cell, $event)"
				@dragover.prevent
				@drop="onDrop(cell.slotIndex, $event)"
				@contextmenu.prevent="onCellContextMenu(cell, $event)"
			>
				<span class="text-[10px] w-full truncate text-center" :class="{ 'opacity-40': !cell.assignment }">
					{{ cell.assignment ? cell.moduleLabel : '—' }}
				</span>
				<Knob v-if="cell.assignment" :value="cell.value" @change="(v) => onKnobChange(cell.assignment!, v)" />
				<div v-else class="w-8 h-8 rounded-full border border-line-default opacity-40 my-1" />
				<span class="text-[10px] w-full truncate text-center" :class="{ 'opacity-40': !cell.assignment }">
					{{ cell.assignment ? cell.paramLabel : '—' }}
				</span>
				<span class="text-[10px] text-content-secondary w-full truncate text-center" :class="{ 'opacity-40': !cell.assignment }">
					{{ cell.assignment ? cell.valueLabel : '' }}
				</span>
			</div>
		</div>
	</ToolBar>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import ToolBar from './ToolBar.vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import ToolBarDivider from './ToolBarDivider.vue';
	import BtnGroup from './BtnGroup.vue';
	import Knob from '../common/Knob.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { useAltHeld, parseParamDragPayload } from '../../composables/useParamPageAssign';
	import { PAGE_LETTERS, KNOBS_PER_PAGE, slotIndexFor } from '../../renderer/paramPages';
	import { getModule } from '../../renderer/nmg2mods';
	import { formatValue } from '../../utils/moduleControls';
	import type { ContextMenuItem, ParamPageAssignment } from '../../types';

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const { open: openContextMenu } = useContextMenu();
	const { altHeld } = useAltHeld();

	const pageOptions = PAGE_LETTERS.map((label, value) => ({ label, value }));
	const bankOptions = [1, 2, 3];

	interface Cell {
		slotIndex: number;
		assignment: ParamPageAssignment | null;
		moduleLabel: string;
		paramLabel: string;
		value: number;
		valueLabel: string;
	}

	function moduleAndParamLabel(a: ParamPageAssignment): { moduleLabel: string; paramLabel: string; paramType: string } | null {
		const slot = uiStore.slotInFocus;
		const patch = slot ? slotsStore.slots[slot].patch : null;
		const mod = patch?.areas[a.location]?.modules.find((m) => m.index === a.moduleIndex);
		if (!mod) return null;
		const moduleDef = getModule(mod.type);
		const paramDef = moduleDef?.params?.[a.paramIndex];
		return {
			moduleLabel: mod.uname || moduleDef?.short || String(a.moduleIndex),
			paramLabel: paramDef?.name ?? String(a.paramIndex),
			paramType: paramDef?.type ?? '',
		};
	}

	function paramValue(a: ParamPageAssignment): number {
		const slot = uiStore.slotInFocus;
		if (!slot) return 0;
		const areaKey = a.location === 1 ? 'voice' : 'fx';
		return slotsStore.slots[slot].variations?.[uiStore.variation]?.[areaKey]?.[a.moduleIndex]?.[a.paramIndex] ?? 64;
	}

	const cells = computed<Cell[]>(() => {
		const slot = uiStore.slotInFocus;
		const list = slot ? slotsStore.slots[slot].paramPages : [];
		return Array.from({ length: KNOBS_PER_PAGE }, (_, knob) => {
			const slotIndex = slotIndexFor(uiStore.selectedParamBank, uiStore.displayedParamPage, knob);
			const assignment = list.find((k) => k.slotIndex === slotIndex) ?? null;
			if (!assignment) return { slotIndex, assignment: null, moduleLabel: '', paramLabel: '', value: 0, valueLabel: '' };
			const info = moduleAndParamLabel(assignment);
			const value = paramValue(assignment);
			return {
				slotIndex,
				assignment,
				moduleLabel: info?.moduleLabel ?? String(assignment.moduleIndex),
				paramLabel: info?.paramLabel ?? String(assignment.paramIndex),
				value,
				valueLabel: info ? formatValue(value, info.paramType) : String(value),
			};
		});
	});

	function onKnobChange(a: ParamPageAssignment, value: number) {
		const areaKey = a.location === 1 ? 'voice' : 'fx';
		slotsStore.setParam(a.moduleIndex, a.paramIndex, value, uiStore.variation, areaKey);
	}

	function onCellContextMenu(cell: Cell, event: MouseEvent) {
		if (!cell.assignment) return;
		const slot = uiStore.slotInFocus;
		const items: ContextMenuItem[] = [{ label: 'Deassign', disabled: !slot, action: () => slot && slotsStore.deassignParamPage(slot, cell.slotIndex) }];
		openContextMenu(event, items);
	}

	// Drag source for knob-to-knob move/swap within the toolbar (gated on Alt, like canvas param
	// drag, so it doesn't compete with the Knob's own mousedown-based value-drag gesture).
	function onCellDragStart(cell: Cell, e: DragEvent) {
		if (!cell.assignment || !e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'knob-slot', slotIndex: cell.slotIndex }));
	}

	// Drop target for both: an Alt-dragged canvas param (assign) and another toolbar knob (move/swap).
	function onDrop(targetSlotIndex: number, e: DragEvent) {
		const slot = uiStore.slotInFocus;
		if (!slot) return;

		const paramPayload = parseParamDragPayload(e);
		if (paramPayload) {
			slotsStore.assignParamToPage(slot, targetSlotIndex, paramPayload.location, paramPayload.moduleIndex, paramPayload.paramIndex);
			return;
		}

		const raw = e.dataTransfer?.getData('text/plain');
		if (!raw) return;
		let data: any;
		try {
			data = JSON.parse(raw);
		} catch {
			return;
		}
		if (data.type !== 'knob-slot' || data.slotIndex === targetSlotIndex) return;
		const sourceSlotIndex = data.slotIndex as number;
		const source = slotsStore.slots[slot].paramPages.find((k) => k.slotIndex === sourceSlotIndex);
		if (!source) return;
		const target = slotsStore.slots[slot].paramPages.find((k) => k.slotIndex === targetSlotIndex);
		slotsStore.assignParamToPage(slot, targetSlotIndex, source.location, source.moduleIndex, source.paramIndex);
		if (target) slotsStore.assignParamToPage(slot, sourceSlotIndex, target.location, target.moduleIndex, target.paramIndex);
	}
</script>
