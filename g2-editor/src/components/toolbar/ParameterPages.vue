<template>
	<ToolBar>
		<ToolBarLabel>Param<br />Pages:</ToolBarLabel>
		<div class="flex items-center gap-4">
			<div
				v-for="cell in cells"
				:key="cell.slotIndex"
				class="flex flex-col items-center w-16 gap-1"
				:draggable="altHeld"
				@dragstart="onCellDragStart(cell, $event)"
				@dragover.prevent
				@drop="onDrop(cell.slotIndex, $event)"
				@contextmenu.prevent="onCellContextMenu(cell, $event)"
			>
				<span class="text-xs w-full truncate text-center font-bold" :class="{ 'opacity-40': !cell.assignment }">
					{{ cell.moduleHeader }}
				</span>

				<div class="w-full rounded px-1 py-0.5 text-center" :class="cell.assignment ? 'bg-surface-3' : 'opacity-40'">
					<div class="text-xs truncate">{{ cell.assignment ? cell.paramLabel : '—' }}</div>
					<div class="text-xs text-content-secondary truncate">{{ cell.assignment ? cell.valueLabel : '' }}</div>
				</div>

				<Knob v-if="cell.assignment" :value="cell.value" @change="(v) => onKnobChange(cell.assignment!, v)" />
				<div v-else class="w-8 h-8 rounded-full border border-line-default opacity-40 my-1" />

				<!-- Physical pushbutton below the knob. Targets whatever ParameterPages.vue's buttonParams
				     lookup resolves (mirrors the knob's own param, a different param, or none at all) —
				     see the buttonParamIndex comment below. -->
				<span class="text-xs w-full truncate text-center" :class="{ 'opacity-40': !cell.assignment || !cell.hasButton }">
					{{ cell.assignment && cell.hasButton ? cell.buttonLabel : '—' }}
				</span>
				<Button v-if="cell.assignment && cell.hasButton" variant="default" size="xs" class="w-full truncate">{{ cell.buttonValueLabel }}</Button>
				<div v-else class="w-full h-5 rounded border border-line-default opacity-40" />
			</div>
		</div>

		<ToolBarDivider></ToolBarDivider>

		<div class="flex flex-col h-full">
			<div class="grow">&nbsp;</div>
			<BtnGroup
				:model-value="uiStore.selectedParamBank + 1"
				:options="bankOptions"
				variant="variation"
				testIdPrefix="param-bank"
				@update:model-value="(v) => uiStore.setSelectedParamBank((v as number) - 1)"
			/>
		</div>

		<BtnGroup
			:model-value="uiStore.displayedParamPage"
			:options="pageOptions"
			variant="toggle"
			vertical
			testIdPrefix="param-page"
			@update:model-value="(v) => uiStore.setDisplayedParamPage(v as number)"
		/>
	</ToolBar>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import ToolBar from './ToolBar.vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import ToolBarDivider from './ToolBarDivider.vue';
	import BtnGroup from './BtnGroup.vue';
	import Button from './Button.vue';
	import Knob from '../common/Knob.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { useAltHeld, parseParamDragPayload } from '../../composables/useParamPageAssign';
	import { PAGE_LETTERS, KNOBS_PER_PAGE, slotIndexFor } from '../../renderer/paramPages';
	import { getModule } from '../../renderer/nmg2mods';
	import { getButtonParamIndex } from '../../renderer/buttonParams';
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
		moduleHeader: string; // moduleLabel, or a continuation dash-run when the previous cell is the same module (mirrors the G2's own display)
		paramLabel: string;
		value: number;
		valueLabel: string;
		hasButton: boolean;
		buttonLabel: string;
		buttonValueLabel: string;
	}

	function sameModule(a: ParamPageAssignment | null, b: ParamPageAssignment | null): boolean {
		return !!a && !!b && a.location === b.location && a.moduleIndex === b.moduleIndex;
	}

	function resolveModule(a: ParamPageAssignment) {
		const slot = uiStore.slotInFocus;
		const patch = slot ? slotsStore.slots[slot].patch : null;
		const mod = patch?.areas[a.location]?.modules.find((m) => m.index === a.moduleIndex);
		if (!mod) return null;
		return { mod, moduleDef: getModule(mod.type) };
	}

	// Reads a module parameter's display label + live formatted value. Used for both the knob
	// (paramIndex = the assignment's own param) and the button below it (see buttonParamIndex note
	// at the call site).
	function resolveParamDisplay(
		a: ParamPageAssignment,
		paramIndex: number,
		moduleInfo: ReturnType<typeof resolveModule>,
	): { label: string; value: number; valueLabel: string } {
		const paramDef = moduleInfo?.moduleDef?.params?.[paramIndex];
		const slot = uiStore.slotInFocus;
		const areaKey = a.location === 1 ? 'voice' : 'fx';
		const value = slot ? (slotsStore.slots[slot].variations?.[uiStore.variation]?.[areaKey]?.[a.moduleIndex]?.[paramIndex] ?? 64) : 0;
		return {
			label: paramDef?.name ?? String(paramIndex),
			value,
			valueLabel: paramDef ? formatValue(value, paramDef.type) : String(value),
		};
	}

	const emptyCell = { moduleLabel: '', paramLabel: '', value: 0, valueLabel: '', hasButton: false, buttonLabel: '', buttonValueLabel: '' };

	const cells = computed<Cell[]>(() => {
		const slot = uiStore.slotInFocus;
		const list = slot ? slotsStore.slots[slot].paramPages : [];
		const base: Omit<Cell, 'moduleHeader'>[] = Array.from({ length: KNOBS_PER_PAGE }, (_, knob) => {
			const slotIndex = slotIndexFor(uiStore.selectedParamBank, uiStore.displayedParamPage, knob);
			const assignment = list.find((k) => k.slotIndex === slotIndex) ?? null;
			if (!assignment) return { slotIndex, assignment: null, ...emptyCell };
			const moduleInfo = resolveModule(assignment);
			const moduleLabel = moduleInfo
				? moduleInfo.mod.uname || moduleInfo.moduleDef?.short || String(assignment.moduleIndex)
				: String(assignment.moduleIndex);
			const knobDisplay = resolveParamDisplay(assignment, assignment.paramIndex, moduleInfo);
			// The physical button below the knob often targets a DIFFERENT module parameter (e.g.
			// Sequencer step-value knobs pair with a step-on/off button), or has no button function
			// at all — resolved via buttonParams.ts, ported from BVE.NMG2Data.pas's ButtonParamIndex
			// table in the reference Delphi editor. undefined = not in the table = falls back to
			// mirroring the knob's own param (the documented default).
			const moduleTypeId = moduleInfo?.mod.type;
			const lookedUp = moduleTypeId !== undefined ? getButtonParamIndex(moduleTypeId, assignment.paramIndex) : undefined;
			const buttonParamIndex = lookedUp ?? assignment.paramIndex;
			const hasButton = buttonParamIndex !== -1;
			const buttonDisplay = hasButton ? resolveParamDisplay(assignment, buttonParamIndex, moduleInfo) : null;
			return {
				slotIndex,
				assignment,
				moduleLabel,
				paramLabel: knobDisplay.label,
				value: knobDisplay.value,
				valueLabel: knobDisplay.valueLabel,
				hasButton,
				buttonLabel: buttonDisplay?.label ?? '',
				buttonValueLabel: buttonDisplay?.valueLabel ?? '',
			};
		});
		return base.map((cell, i) => {
			if (!cell.assignment) return { ...cell, moduleHeader: '—' };
			const isContinuation = sameModule(cell.assignment, base[i - 1]?.assignment ?? null);
			if (!isContinuation) return { ...cell, moduleHeader: cell.moduleLabel };
			const isLastOfRun = !sameModule(cell.assignment, base[i + 1]?.assignment ?? null);
			return { ...cell, moduleHeader: isLastOfRun ? '———]' : '———' };
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
