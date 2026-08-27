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
				<div
					v-if="cell.assignment && cell.hasButton"
					class="btn btn-xs w-full truncate text-center"
					@mousedown="onButtonMouseDown(cell)"
					@mouseup="onButtonMouseUp(cell)"
					@click="onButtonClick(cell)"
				>
					{{ cell.buttonValueLabel }}
				</div>
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
	import Knob from '../common/Knob.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { useAltHeld, parseParamDragPayload } from '../../composables/useParamPageAssign';
	import { PAGE_LETTERS, KNOBS_PER_PAGE, slotIndexFor } from '../../renderer/paramPages';
	import { getModule } from '../../renderer/nmg2mods';
	import { getButtonParamIndex } from '../../renderer/buttonParams';
	import { getParam } from '../../renderer/parammap';
	import { formatValue } from '../../utils/moduleControls';
	import { clamp } from '../../utils/math';
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
		buttonParamIndex: number;
		buttonValue: number;
		buttonLow: number;
		buttonHigh: number;
		buttonIsTrigger: boolean;
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

	// Reads a module parameter's display label + live formatted value, plus its parammap.ts range/
	// trigger metadata (needed to drive the button below the knob the same way useSwitch.ts does on
	// canvas). Used for both the knob (paramIndex = the assignment's own param) and the button (see
	// buttonParamIndex note at the call site).
	function resolveParamDisplay(
		a: ParamPageAssignment,
		paramIndex: number,
		moduleInfo: ReturnType<typeof resolveModule>,
	): { label: string; value: number; valueLabel: string; low: number; high: number; isTrigger: boolean } {
		const paramDef = moduleInfo?.moduleDef?.params?.[paramIndex];
		const slot = uiStore.slotInFocus;
		const areaKey = a.location === 1 ? 'voice' : 'fx';
		const value = slot ? (slotsStore.slots[slot].variations?.[uiStore.variation]?.[areaKey]?.[a.moduleIndex]?.[paramIndex] ?? 64) : 0;
		const paramMeta = paramDef ? getParam(paramDef.type) : undefined;
		return {
			label: paramDef?.name ?? String(paramIndex),
			value,
			valueLabel: paramDef ? formatValue(value, paramDef.type) : String(value),
			low: paramMeta?.low ?? 0,
			high: paramMeta?.high ?? 127,
			isTrigger: paramMeta?.trigger === true,
		};
	}

	const emptyCell = {
		moduleLabel: '',
		paramLabel: '',
		value: 0,
		valueLabel: '',
		hasButton: false,
		buttonParamIndex: 0,
		buttonValue: 0,
		buttonLow: 0,
		buttonHigh: 0,
		buttonIsTrigger: false,
		buttonLabel: '',
		buttonValueLabel: '',
	};

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
				buttonParamIndex,
				buttonValue: buttonDisplay?.value ?? 0,
				buttonLow: buttonDisplay?.low ?? 0,
				buttonHigh: buttonDisplay?.high ?? 0,
				buttonIsTrigger: buttonDisplay?.isTrigger ?? false,
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

	// buttonParamIndex may differ from a.paramIndex (see the buttonParams.ts lookup above) — write
	// to whichever param the button actually targets, not necessarily the knob's own.
	function onButtonChange(a: ParamPageAssignment, buttonParamIndex: number, value: number) {
		const areaKey = a.location === 1 ? 'voice' : 'fx';
		slotsStore.setParam(a.moduleIndex, buttonParamIndex, value, uiStore.variation, areaKey);
	}

	// Mirrors useSwitch.ts's isTrigger handling exactly (same composable ModuleSwitch.vue uses on
	// canvas): a momentary trigger param (parammap.ts's `trigger: true`, e.g. TrigBtn) is pressed
	// (1) on mousedown and released (0) on mouseup — sending a single "cycled" value on click, as
	// non-trigger params do below, doesn't match how the device actually treats it and the optimistic
	// echo-confirmation never matches what the device reports back.
	function onButtonMouseDown(cell: Cell) {
		if (!cell.assignment || !cell.buttonIsTrigger) return;
		onButtonChange(cell.assignment, cell.buttonParamIndex, 1);
	}

	function onButtonMouseUp(cell: Cell) {
		if (!cell.assignment || !cell.buttonIsTrigger) return;
		onButtonChange(cell.assignment, cell.buttonParamIndex, 0);
	}

	// Non-trigger params (e.g. OffOnBlank) cycle through their [low, high] range on click, mirroring
	// useSwitch.ts's onCycleValue.
	function onButtonClick(cell: Cell) {
		if (!cell.assignment || cell.buttonIsTrigger) return;
		const { buttonLow: low, buttonHigh: high } = cell;
		const range = high - low + 1;
		const current = clamp(cell.buttonValue, low, high);
		onButtonChange(cell.assignment, cell.buttonParamIndex, low + ((current - low + 1) % range));
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
