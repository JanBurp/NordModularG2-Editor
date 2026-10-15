<template>
	<ToolBarLabel v-if="!compact">Param<br />Pages:</ToolBarLabel>
	<div class="flex items-center gap-4" :class="{ 'ml-2 gap-2!': compact }">
		<div
			v-for="cell in cells"
			:key="cell.slotIndex"
			class="flex flex-col items-center w-16 gap-1 select-none cursor-pointer"
			:class="{ 'opacity-40': !cell.assignment, 'w-14!': compact }"
			:data-cell-slot="cell.slotIndex"
			:data-cell-global="uiStore.globalPagesActive ? '' : undefined"
			:draggable="altHeld"
			@dragstart="onKnobDragStart(cell, $event)"
			@contextmenu.prevent="onCellContextMenu(cell, $event)"
			@dragover.prevent
			@drop.prevent="onKnobDrop(cell, $event)"
		>
			<span class="text-xs w-full truncate text-center font-bold">{{ cell.moduleHeader }}</span>

			<div class="w-full rounded-xs px-1 text-center bg-input-dimmed">
				<div class="text-xs text-black truncate">{{ cell.paramLabel }}</div>
				<div class="text-xs text-black truncate">{{ cell.valueLabel }}</div>
			</div>

			<!-- The whole cell column is both the Alt+drag source (:draggable/@dragstart above) and the drop
			     target (data-cell-slot, @drop above); style.css's .alt-assign rules give it the grab cursor.
			     The Knob inside goes pointer-events-none under Alt, so the gesture never races useKnob.ts's
			     value-drag. Empty slots drag too: dropping one on a canvas param assigns that param here. -->
			<div @mousedown.capture="onKnobMorphMouseDown(cell, $event)" @mouseenter="showHint('paramPageKnob')" @mouseleave="clearHint" class="-mb-1">
				<!-- Unassigned slots render the same Knob, just at value 0 and inert (the cell-level
				     opacity above dims it). The wrapper keeps its own pointer events, so the assign
				     drag/drop still works on empty cells. -->
				<Knob
					:value="cell.value"
					:class="{ 'pointer-events-none': altHeld || !cell.assignment || cell.assignment.isLed }"
					:colorVariant="cell.morphColor"
					:morphRange="cell.morphRange"
					:max="cell.high"
					@change="(v) => onKnobChange(cell.assignment!, v)"
				/>
			</div>

			<!-- hasButton is false for unassigned cells too, so it alone gates the button's liveness.
			     The extra opacity only applies to assigned-but-buttonless params, which the cell-level
			     opacity doesn't already cover. -->
			<template v-if="!compact">
				<span class="text-xs w-full truncate text-center" :class="{ 'opacity-40': cell.assignment && !cell.hasButton }">{{ cell.buttonLabel }}</span>
				<div
					class="btn btn-xs w-full truncate text-center"
					:class="{ 'opacity-40': cell.assignment && !cell.hasButton, 'pointer-events-none': altHeld || !cell.hasButton }"
					@mousedown="onButtonMouseDown(cell)"
					@click="onButtonClick(cell)"
				>
					{{ cell.buttonValueLabel }}
				</div>
			</template>
		</div>
	</div>

	<div class="self-stretch flex flex-col justify-between py-0.5">
		<Button variant="toggle" :active="uiStore.globalPagesActive" @click="onToggleGlobalPages()" data-testid="global-pages-toggle"> Global </Button>

		<BtnGroup
			:model-value="(uiStore.globalPagesActive ? uiStore.selectedGlobalParamBank : uiStore.selectedParamBank) + 1"
			:options="bankOptions"
			variant="variation"
			testIdPrefix="param-bank"
			@update:model-value="(v) => onBankSelect((v as number) - 1)"
		/>
	</div>
	<div class="flex gap-2">
		<BtnGroup
			:model-value="uiStore.globalPagesActive ? uiStore.displayedGlobalParamPage : uiStore.displayedParamPage"
			:options="pageOptions"
			variant="variation"
			:size="compact ? 'xs' : 'normal'"
			vertical
			testIdPrefix="param-page"
			@update:model-value="(v) => onPageSelect(v as number)"
			class="w-8"
		/>
		<div v-if="!compact" class="flex flex-col text-content-muted">
			<div>Osc</div>
			<div>LFO</div>
			<div>Env</div>
			<div>Filter</div>
			<div>Effect</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import BtnGroup from './BtnGroup.vue';
	import Button from './Button.vue';
	import Knob from '../common/Knob.vue';

	const { compact = false } = defineProps<{ compact?: boolean }>();
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { useLedStore } from '../../store/led';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { useAltHeld } from '../../composables/useParamPageAssign';
	import { buildMorphMenuItems } from '../../composables/useMorphAssign';
	import { useMorphRangeDrag } from '../../composables/useMorphRangeDrag';
	import { useStatusHint } from '../../composables/useStatusHint';
	import { isGrabModifierPressed } from '../../utils/platform';
	import { PAGE_LETTERS, KNOBS_PER_PAGE, slotIndexFor, slotIndexToBankPageKnob } from '../../renderer/paramPages';
	import { serializeDragPayload, parseDragPayload } from '../../utils/dragPayload';
	import { setBadgeDragImage } from '../../utils/badgeLayout';
	import { getModule } from '../../renderer/nmg2mods';
	import { getButtonParamIndex } from '../../renderer/buttonParams';
	import { getParam } from '../../renderer/parammap';
	import { formatValue, formatCombinedValue, isSwitch, isSpinner, isSpinnerH } from '../../utils/moduleControls';
	import { clamp } from '../../utils/math';
	import { resolveSwitchDisplayNames } from '../../composables/useSwitch';
	import type { ContextMenuItem, GlobalParamPageAssignment, ParamPageAssignment, SlotLabel } from '../../types';

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const { open: openContextMenu } = useContextMenu();
	const { altHeld } = useAltHeld();
	const { startDrag: startMorphRangeDrag } = useMorphRangeDrag();
	const { showHint, clearHint } = useStatusHint();

	const pageOptions = PAGE_LETTERS.map((label, value) => ({ label, value }));
	const bankOptions = [1, 2, 3];

	interface Cell {
		slotIndex: number;
		assignment: ParamPageAssignment | GlobalParamPageAssignment | null;
		moduleLabel: string;
		moduleHeader: string; // moduleLabel, or a continuation dash-run when the previous cell is the same module (mirrors the G2's own display)
		paramLabel: string;
		value: number;
		high: number; // knob param's own range (parammap `high`)
		valueLabel: string;
		hasButton: boolean;
		buttonParamIndex: number;
		buttonValue: number;
		buttonLow: number;
		buttonHigh: number;
		buttonIsTrigger: boolean;
		buttonLabel: string;
		buttonValueLabel: string;
		// Morph Group state for the currently-selected toolbar group, mirroring Module.vue's
		// morphColorFor/morphRangeFor exactly: red = assigned to the selected group, blue = assigned to
		// a different group, null = not assigned at all.
		morphColor: 'red' | 'blue' | null;
		morphRange: number | undefined;
	}

	// A Global Parameter Page assignment carries its own target `slot` (it can address any of the
	// 4 patches); a per-Patch one is implicitly scoped to whichever slot's canvas is showing it.
	function assignmentSlot(a: ParamPageAssignment | GlobalParamPageAssignment): SlotLabel {
		return 'slot' in a ? a.slot : uiStore.slotInFocus;
	}

	function sameModule(a: ParamPageAssignment | GlobalParamPageAssignment | null, b: ParamPageAssignment | GlobalParamPageAssignment | null): boolean {
		return !!a && !!b && a.location === b.location && a.moduleIndex === b.moduleIndex && assignmentSlot(a) === assignmentSlot(b);
	}

	function resolveModule(a: ParamPageAssignment | GlobalParamPageAssignment) {
		const slot = assignmentSlot(a);
		const patch = slotsStore.slots[slot].patch;
		const mod = patch?.areas[a.location]?.modules.find((m) => m.index === a.moduleIndex);
		if (!mod) return null;
		return { mod, moduleDef: getModule(mod.type) };
	}

	// Reads a module parameter's display label + live formatted value, plus its parammap.ts range/
	// trigger metadata (needed to drive the button below the knob the same way useSwitch.ts does on
	// canvas). Used for both the knob (paramIndex = the assignment's own param) and the button (see
	// buttonParamIndex note at the call site).
	function resolveParamDisplay(
		a: ParamPageAssignment | GlobalParamPageAssignment,
		paramIndex: number,
		moduleInfo: ReturnType<typeof resolveModule>,
	): { label: string; userLabel?: string; value: number; valueLabel: string; low: number; high: number; isTrigger: boolean } {
		const paramDef = moduleInfo?.moduleDef?.params?.[paramIndex];
		const slot = assignmentSlot(a);
		const areaKey = a.location === 1 ? 'voice' : 'fx';
		const moduleValues = slotsStore.slots[slot].variations?.[uiStore.variation]?.[areaKey]?.[a.moduleIndex];
		const value = moduleValues?.[paramIndex] ?? 64;
		const paramMeta = paramDef ? getParam(paramDef.type) : undefined;
		// A param that leads a combined canvas display (e.g. Osc Freq = [coarse, fine, FreqMode]) is
		// formatted the same way as there, so the mode param (the cell's button) drives the text.
		const combined = moduleInfo?.moduleDef?.ve?.find((e) => e.type === 'valueDisplay' && Array.isArray(e.ref) && e.ref[0] === paramIndex);
		let label = paramDef?.name ?? String(paramIndex);
		let valueLabel =
			combined && moduleValues
				? formatCombinedValue(combined.ref as number[], combined.func, moduleInfo?.moduleDef?.params, moduleValues)
				: paramDef
					? formatValue(value, paramDef.type)
					: String(value);
		// User-renamed switch options: show the same text as the canvas switch (useSwitch.ts)
		const userLabel = moduleInfo?.mod.paramLabels?.find((l) => l.paramIndex === paramIndex);
		if (userLabel && paramDef && paramMeta) {
			const names = resolveSwitchDisplayNames(paramDef, paramMeta, userLabel);
			if (paramMeta.names?.length === 1) label = names[0] || label;
			else if (Array.isArray(names)) valueLabel = names[clamp(value, paramMeta.low ?? 0, paramMeta.high ?? names.length - 1)] || valueLabel;
		}
		return {
			label,
			userLabel: paramMeta?.names?.length === 1 ? userLabel?.labels[0] || undefined : undefined,
			value,
			valueLabel,
			low: paramMeta?.low ?? 0,
			high: paramMeta?.high ?? 127,
			isTrigger: paramMeta?.trigger === true,
		};
	}

	// Unassigned cells render the same components as assigned ones, so their labels must still
	// occupy a text line — an empty string would collapse the row and make cell heights diverge.
	const BLANK = ' ';

	const emptyCell = {
		moduleLabel: BLANK,
		paramLabel: BLANK,
		value: 0,
		high: 127,
		valueLabel: BLANK,
		hasButton: false,
		buttonParamIndex: 0,
		buttonValue: 0,
		buttonLow: 0,
		buttonHigh: 0,
		buttonIsTrigger: false,
		buttonLabel: BLANK,
		buttonValueLabel: BLANK,
		morphColor: null as 'red' | 'blue' | null,
		morphRange: undefined as number | undefined,
	};

	// Live level (0-127) of the level meter a LED-assigned cell points at. LED number = rank of the
	// module's vu elements by x (see Module.vue's onVuContextMenu); the led store keys them `vu-N` in
	// element order. Patch-level assignments only, so the led store's focused slot is the right one.
	const ledStore = useLedStore();
	function meterLevel(a: ParamPageAssignment | GlobalParamPageAssignment, moduleInfo: ReturnType<typeof resolveModule>): number {
		const vus = (moduleInfo?.moduleDef?.ve ?? []).filter((v) => v.type === 'vu');
		const target = [...vus].sort((p, q) => (p.x as number) - (q.x as number))[a.paramIndex];
		if (!target) return 0;
		const raw = ledStore.getStripValue(a.location === 1 ? 'va' : 'fx', a.moduleIndex, `vu-${vus.indexOf(target)}`);
		return raw === 255 ? 0 : Math.min(raw, 127);
	}

	const cells = computed<Cell[]>(() => {
		const global = uiStore.globalPagesActive;
		const slot = uiStore.slotInFocus;
		const list: (ParamPageAssignment | GlobalParamPageAssignment)[] = global ? slotsStore.globalParamPages : slot ? slotsStore.slots[slot].paramPages : [];
		const bank = global ? uiStore.selectedGlobalParamBank : uiStore.selectedParamBank;
		const page = global ? uiStore.displayedGlobalParamPage : uiStore.displayedParamPage;
		const base: Omit<Cell, 'moduleHeader'>[] = Array.from({ length: KNOBS_PER_PAGE }, (_, knob) => {
			const slotIndex = slotIndexFor(bank, page, knob);
			const assignment = list.find((k) => k.slotIndex === slotIndex) ?? null;
			if (!assignment) return { slotIndex, assignment: null, ...emptyCell };
			const moduleInfo = resolveModule(assignment);
			const moduleLabel = moduleInfo
				? moduleInfo.mod.uname || moduleInfo.moduleDef?.short || String(assignment.moduleIndex)
				: String(assignment.moduleIndex);
			// Level-meter target (isLed=1): paramIndex is a LED number, not a param. The hardware shows
			// it as a circular VU around the knob; here the knob mirrors the live level, read-only.
			if (assignment.isLed) {
				return {
					slotIndex,
					assignment,
					...emptyCell,
					moduleLabel,
					paramLabel: `Meter ${assignment.paramIndex + 1}`,
					valueLabel: '[LED]',
					value: meterLevel(assignment, moduleInfo),
				};
			}
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
			// Morph Group state, mirroring Module.vue's morphColorFor/morphRangeFor exactly: looked up by
			// the same (location, moduleIndex, paramIndex) tuple, against the assignment's own target
			// slot (not uiStore.slotInFocus) so a Global Page cell reflects the right patch.
			const paramMorphAssignments = slotsStore
				.getMorphAssignments(assignmentSlot(assignment), uiStore.variation)
				.filter((m) => m.location === assignment.location && m.moduleIndex === assignment.moduleIndex && m.paramIndex === assignment.paramIndex);
			const morphColor: 'red' | 'blue' | null =
				paramMorphAssignments.length === 0 ? null : paramMorphAssignments.some((m) => m.groupIndex === uiStore.selectedMorphGroup) ? 'red' : 'blue';
			const morphRange = paramMorphAssignments.find((m) => m.groupIndex === uiStore.selectedMorphGroup)?.range;
			return {
				slotIndex,
				assignment,
				moduleLabel,
				// A knob paired with a user-labeled button (e.g. Mixer level + mute) is named by that label
				paramLabel: buttonDisplay?.userLabel ?? knobDisplay.label,
				value: knobDisplay.value,
				high: knobDisplay.high,
				valueLabel: knobDisplay.valueLabel,
				hasButton,
				buttonParamIndex,
				buttonValue: buttonDisplay?.value ?? 0,
				buttonLow: buttonDisplay?.low ?? 0,
				buttonHigh: buttonDisplay?.high ?? 0,
				buttonIsTrigger: buttonDisplay?.isTrigger ?? false,
				buttonLabel: buttonDisplay?.label ?? BLANK,
				buttonValueLabel: buttonDisplay?.valueLabel ?? BLANK,
				morphColor,
				morphRange,
			};
		});
		return base.map((cell, i) => {
			if (!cell.assignment) return { ...cell, moduleHeader: BLANK };
			const isContinuation = sameModule(cell.assignment, base[i - 1]?.assignment ?? null);
			if (!isContinuation) {
				// A Global cell's module can belong to a DIFFERENT patch than any other cell on the
				// page, so prefix the target slot letter to disambiguate (patch mode never needs
				// this — every cell is implicitly the same, currently-focused slot).
				const label = global ? `${assignmentSlot(cell.assignment)}: ${cell.moduleLabel}` : cell.moduleLabel;
				return { ...cell, moduleHeader: label };
			}
			const isLastOfRun = !sameModule(cell.assignment, base[i + 1]?.assignment ?? null);
			return { ...cell, moduleHeader: isLastOfRun ? '————]' : '————' };
		});
	});

	// The G2's own A-E / 1-3 buttons are the same selection: push it to the hardware so the front
	// panel follows the toolbar. Optimistic — the ui-store value is set first, exactly like
	// handleVariationClick in useSlotManagement.ts. selectParamPage is a no-op when offline, and the
	// device's echo (param_page_change, handled in useSlotEvents.ts) writes the identical value back,
	// so there's nothing to suppress. Both selectors send the whole page byte, hence one shared push.
	function pushParamPage() {
		if (uiStore.globalPagesActive) {
			slotsStore.selectGlobalParamPage(uiStore.selectedGlobalParamBank, uiStore.displayedGlobalParamPage);
		} else {
			slotsStore.selectParamPage(uiStore.selectedParamBank, uiStore.displayedParamPage);
		}
	}

	// The real mode-switch is the SHIFT+GLOBAL front-panel combo (set-knob-source, opcode 0x3F
	// sub-mode 0x02 — confirmed against real hardware 2026-08-28), NOT the page-select opcodes.
	// Push that first so the front panel actually switches source, then read back the page the
	// G2 shows in that source (it keeps a separate Patch and Global page) instead of pushing ours.
	async function onToggleGlobalPages() {
		const next = !uiStore.globalPagesActive;
		uiStore.setGlobalPagesActive(next);
		await slotsStore.setKnobSource(next);
		await slotsStore.requestVisibleParamPage();
	}

	function onBankSelect(bank: number) {
		if (uiStore.globalPagesActive) uiStore.setSelectedGlobalParamBank(bank);
		else uiStore.setSelectedParamBank(bank);
		pushParamPage();
	}

	function onPageSelect(page: number) {
		if (uiStore.globalPagesActive) uiStore.setDisplayedGlobalParamPage(page);
		else uiStore.setDisplayedParamPage(page);
		pushParamPage();
	}

	function onKnobChange(a: ParamPageAssignment | GlobalParamPageAssignment, value: number) {
		const areaKey = a.location === 1 ? 'voice' : 'fx';
		slotsStore.setParam(a.moduleIndex, a.paramIndex, value, uiStore.variation, areaKey, false, assignmentSlot(a));
	}

	// Cmd(mac)/Ctrl-drag a knob to set its morph range for the currently-selected toolbar group,
	// mirroring Module.vue's onParamMorphMouseDown exactly (same useMorphRangeDrag.ts gesture: a plain
	// Cmd/Ctrl+click toggles assign/deassign, dragging past the threshold sets the range instead).
	// Captured on the wrapper (not the Knob itself) so it fires before useKnob.ts's own value-drag —
	// startMorphRangeDrag no-ops (and doesn't stopPropagation) unless the grab modifier is actually held.
	function onKnobMorphMouseDown(cell: Cell, e: MouseEvent) {
		if (!cell.assignment || !isGrabModifierPressed(e)) return;
		const a = cell.assignment;
		const slot = assignmentSlot(a);
		const groupIndex = uiStore.selectedMorphGroup;
		const variation = uiStore.variation;
		// Buttons/switches/spinners always get the fixed max range (no drag needed for those) — same
		// rule Module.vue applies, based on the knob's own param (not buttonParamIndex).
		const param = resolveModule(a)?.moduleDef?.params?.[a.paramIndex];
		const isFixedRange = param ? isSwitch(param.n) || isSpinner(param.n) || isSpinnerH(param.n) : false;
		startMorphRangeDrag(a.moduleIndex, a.paramIndex, a.location === 1 ? 'va' : 'fx', e, {
			isAssigned: () => cell.morphColor === 'red',
			getRange: () => cell.morphRange ?? 0,
			// Freshly assigned params start at the full parameter range (matches the real editor); the
			// user then Cmd/Ctrl-drags to narrow it.
			onAssign: () => slotsStore.assignParamToMorphGroup(slot, variation, groupIndex, a.location, a.moduleIndex, a.paramIndex, 127),
			onDeassign: () => slotsStore.deassignParamFromMorphGroup(slot, variation, groupIndex, a.location, a.moduleIndex, a.paramIndex),
			onRangeChange: isFixedRange
				? undefined
				: (range) => slotsStore.setMorphAssignmentRange(slot, variation, groupIndex, a.location, a.moduleIndex, a.paramIndex, range),
		});
	}

	// buttonParamIndex may differ from a.paramIndex (see the buttonParams.ts lookup above) — write
	// to whichever param the button actually targets, not necessarily the knob's own.
	function onButtonChange(a: ParamPageAssignment | GlobalParamPageAssignment, buttonParamIndex: number, value: number) {
		const areaKey = a.location === 1 ? 'voice' : 'fx';
		slotsStore.setParam(a.moduleIndex, buttonParamIndex, value, uiStore.variation, areaKey, false, assignmentSlot(a));
	}

	// Mirrors useSwitch.ts's isTrigger handling exactly (same composable ModuleSwitch.vue uses on
	// canvas): a momentary trigger param (parammap.ts's `trigger: true`, e.g. TrigBtn) is pressed
	// (1) on mousedown and released (0) on mouseup — sending a single "cycled" value on click, as
	// non-trigger params do below, doesn't match how the device actually treats it and the optimistic
	// echo-confirmation never matches what the device reports back.
	// Release is listened for on window so letting go outside the button (or the app window) still sends 0.
	function onButtonMouseDown(cell: Cell) {
		const a = cell.assignment;
		if (!a || !cell.buttonIsTrigger) return;
		onButtonChange(a, cell.buttonParamIndex, 1);
		window.addEventListener('mouseup', () => onButtonChange(a, cell.buttonParamIndex, 0), { once: true });
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
		const a = cell.assignment;
		let items: ContextMenuItem[];
		if (uiStore.globalPagesActive) {
			items = [{ label: 'Deassign', action: () => slotsStore.deassignGlobalParamPage(cell.slotIndex) }];
		} else {
			const slot = uiStore.slotInFocus;
			items = [{ label: 'Deassign', disabled: !slot, action: () => slot && slotsStore.deassignParamPage(slot, cell.slotIndex) }];
		}
		// Same single-group-toggle gesture as canvas (Module.vue): toggles this param's membership in
		// whichever Morph Group is currently selected on the MorphGroups.vue toolbar. Resolved against
		// the assignment's own target slot (assignmentSlot), not uiStore.slotInFocus, since a Global
		// Page cell can target a different patch than the one currently focused.
		items.push({ type: 'separator' });
		items.push(
			...buildMorphMenuItems({
				slot: assignmentSlot(a),
				variation: uiStore.variation,
				groupIndex: uiStore.selectedMorphGroup,
				location: a.location,
				moduleIndex: a.moduleIndex,
				paramIndex: a.paramIndex,
				isAssigned: cell.morphColor === 'red',
				defaultRange: 127, // full range — same literal Module.vue's canvas call site uses
			}),
		);
		openContextMenu(event, items);
	}

	// Alt+drag a knob onto a canvas param (assign) or onto another knob (move/swap). This direction is
	// plain HTML5 DnD — an HTML drag source, which Chromium handles reliably, exactly like
	// MidiCCPane.vue's CC rows. Only the reverse direction needs useParamPageDrag.ts's custom
	// pointer-tracked drag, because an SVG drag source is the case Chromium doesn't handle.
	// `draggable` is gated on altHeld so a plain drag still turns the knob.
	function onKnobDragStart(cell: Cell, e: DragEvent) {
		if (!e.dataTransfer) return;
		// 'all', not 'move': the gesture holds Alt/Option throughout, and macOS folds that modifier
		// into the drag's operation mask (Option = copy) before Blink sees it. A 'move'-only mask
		// then reduces to no allowed operation while Option is down, and the drop event is never
		// dispatched — the user has to let go of Alt before the mouse. dropEffect is deliberately
		// left alone at the drop targets for the same reason; the handlers don't read it.
		e.dataTransfer.effectAllowed = 'all';
		e.dataTransfer.setData('text/plain', serializeDragPayload({ type: 'knob-slot', slotIndex: cell.slotIndex, global: uiStore.globalPagesActive }));
		const label = cell.assignment ? cell.paramLabel : `Knob ${slotIndexToBankPageKnob(cell.slotIndex).knob + 1}`;
		setBadgeDragImage(e, label, '#8bd3ff');
	}

	async function onKnobDrop(cell: Cell, e: DragEvent) {
		const data = parseDragPayload(e);
		if (data?.type !== 'knob-slot') return;
		if (data.global) {
			await slotsStore.swapGlobalParamPageSlots(data.slotIndex, cell.slotIndex);
			return;
		}
		const slot = uiStore.slotInFocus;
		if (!slot) return;
		await slotsStore.swapParamPageSlots(slot, data.slotIndex, cell.slotIndex);
	}
</script>
