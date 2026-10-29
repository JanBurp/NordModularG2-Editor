// Shared Parameter Page cell model + gestures, used by the toolbar (ParameterPagesGroup.vue, one
// page at a time) and the Parameter Overview pane (ParamOverviewPane.vue, all 15 pages at once).
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { useLedStore } from '../store/led';
import { useContextMenu } from './useContextMenu';
import { buildMorphMenuItems } from './useMorphAssign';
import { resolveSwitchDisplayNames } from './useSwitch';
import { defaultPatchParams, morphGroupName } from '../store/slotHelpers';
import { KNOBS_PER_PAGE, slotIndexFor, slotIndexToBankPageKnob } from '../renderer/paramPages';
import { serializeDragPayload, parseDragPayload } from '../utils/dragPayload';
import { setBadgeDragImage } from '../utils/badgeLayout';
import { getModule, getParamDefault } from '../renderer/nmg2mods';
import { getButtonParamIndex } from '../renderer/buttonParams';
import { getParam } from '../renderer/parammap';
import { formatParamDisplay } from '../utils/moduleControls';
import { clamp } from '../utils/math';
import { vuMetersByLedNo } from '../utils/vuLevel';
import type { ContextMenuItem, GlobalParamPageAssignment, ParamPageAssignment, SlotLabel } from '../types';

export type PageAssignment = ParamPageAssignment | GlobalParamPageAssignment;

export interface Cell {
	slotIndex: number;
	assignment: PageAssignment | null;
	moduleLabel: string;
	moduleHeader: string; // moduleLabel, or a continuation dash-run when the previous cell is the same module (mirrors the G2's own display)
	paramLabel: string;
	value: number;
	high: number; // knob param's own range (parammap `high`)
	defaultValue: number; // knob param's default, set by a double-click
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

// Unassigned cells render the same components as assigned ones, so their labels must still
// occupy a text line — an empty string (or a plain space, which HTML collapses) would collapse the
// row and make cell heights diverge. Hence a non-breaking space.
export const BLANK = '\u00a0';

const emptyCell = {
	moduleLabel: BLANK,
	paramLabel: BLANK,
	value: 0,
	high: 127,
	defaultValue: 64,
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

export function useParamPageCells() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const ledStore = useLedStore();
	const { open: openContextMenu } = useContextMenu();

	// A Global Parameter Page assignment carries its own target `slot` (it can address any of the
	// 4 patches); a per-Patch one is implicitly scoped to whichever slot's canvas is showing it.
	function assignmentSlot(a: PageAssignment): SlotLabel {
		return 'slot' in a ? a.slot : uiStore.slotInFocus;
	}

	function sameModule(a: PageAssignment | null, b: PageAssignment | null): boolean {
		return !!a && !!b && a.location === b.location && a.moduleIndex === b.moduleIndex && assignmentSlot(a) === assignmentSlot(b);
	}

	function resolveModule(a: PageAssignment) {
		const slot = assignmentSlot(a);
		const patch = slotsStore.slots[slot].patch;
		const mod = a.location === 2 ? undefined : patch?.areas[a.location]?.modules.find((m) => m.index === a.moduleIndex);
		if (!mod) return null;
		return { mod, moduleDef: getModule(mod.type) };
	}

	// The param the physical button below the knob targets. It often differs from the knob's own
	// param (e.g. Sequencer step-value knobs pair with a step-on/off button), or there is no button
	// function at all (-1) — resolved via buttonParams.ts, ported from BVE.NMG2Data.pas's
	// ButtonParamIndex table in the reference Delphi editor. undefined = not in the table = falls
	// back to mirroring the knob's own param (the documented default).
	function buttonParamIndexFor(a: PageAssignment, moduleInfo: ReturnType<typeof resolveModule>): number {
		const moduleTypeId = moduleInfo?.mod.type;
		const lookedUp = moduleTypeId !== undefined ? getButtonParamIndex(moduleTypeId, a.paramIndex) : undefined;
		return lookedUp ?? a.paramIndex;
	}

	// Reads a module parameter's display label + live formatted value, plus its parammap.ts range/
	// trigger metadata (needed to drive the button below the knob the same way useSwitch.ts does on
	// canvas). Used for both the knob (paramIndex = the assignment's own param) and the button (see
	// buttonParamIndexFor).
	function resolveParamDisplay(
		a: PageAssignment,
		paramIndex: number,
		moduleInfo: ReturnType<typeof resolveModule>,
	): { label: string; userLabel?: string; value: number; valueLabel: string; low: number; high: number; defaultValue: number; isTrigger: boolean } {
		const paramDef = moduleInfo?.moduleDef?.params?.[paramIndex];
		const slot = assignmentSlot(a);
		const areaKey = a.location === 1 ? 'voice' : 'fx';
		const moduleValues = slotsStore.slots[slot].variations?.[uiStore.variation]?.[areaKey]?.[a.moduleIndex];
		const value = moduleValues?.[paramIndex] ?? 64;
		const paramMeta = paramDef ? getParam(paramDef.type) : undefined;
		let label = paramDef?.name ?? String(paramIndex);
		let valueLabel = moduleInfo?.moduleDef ? formatParamDisplay(moduleInfo.moduleDef, paramIndex, moduleValues ?? []) : String(value);
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
			defaultValue: paramDef ? getParamDefault(paramDef) : 64,
			isTrigger: paramMeta?.trigger === true,
		};
	}

	// Live level (0-127) of the level meter a LED-assigned cell points at. LED number = rank of the
	// module's vu elements by x (see Module.vue's onVuContextMenu); the led store keys them `vu-N` in
	// element order. Read from the assignment's own patch: a Global Page meter can target any slot.
	function meterLevel(a: PageAssignment, moduleInfo: ReturnType<typeof resolveModule>): number {
		const target = vuMetersByLedNo(moduleInfo?.moduleDef)[a.paramIndex];
		if (!target) return 0;
		const vus = (moduleInfo?.moduleDef?.ve ?? []).filter((v) => v.type === 'vu');
		const raw = ledStore.getStripValue(a.location === 1 ? 'va' : 'fx', a.moduleIndex, `vu-${vus.indexOf(target)}`, assignmentSlot(a));
		return raw === 255 ? 0 : Math.min(raw, 127);
	}

	// Assignments of whichever pages are showing: the Global list, or the focused slot's own.
	function currentAssignments(): PageAssignment[] {
		const slot = uiStore.slotInFocus;
		return uiStore.globalPagesActive ? slotsStore.globalParamPages : slot ? slotsStore.slots[slot].paramPages : [];
	}

	// The 8 cells of one bank/page. Reactive when called inside a computed.
	function buildPageCells(bank: number, page: number): Cell[] {
		const global = uiStore.globalPagesActive;
		const list = currentAssignments();
		const base: Omit<Cell, 'moduleHeader'>[] = Array.from({ length: KNOBS_PER_PAGE }, (_, knob) => {
			const slotIndex = slotIndexFor(bank, page, knob);
			const assignment = list.find((k) => k.slotIndex === slotIndex) ?? null;
			if (!assignment) return { slotIndex, assignment: null, ...emptyCell };
			// location=2 = the PATCH_MORPH pseudo-module: paramIndex is a Morph Group, the knob is its dial.
			// No button and no morph colouring (a morph dial can't itself be morph-assigned).
			if (assignment.location === 2) {
				const target = slotsStore.slots[assignmentSlot(assignment)];
				const value = target.variations?.[uiStore.variation]?.patch.morphDials[assignment.paramIndex] ?? 0;
				return {
					slotIndex,
					assignment,
					...emptyCell,
					moduleLabel: 'Morph',
					paramLabel: morphGroupName(target.patch, assignment.paramIndex),
					value,
					valueLabel: String(value),
					defaultValue: defaultPatchParams().morphDials[assignment.paramIndex],
				};
			}
			const moduleInfo = resolveModule(assignment);
			const moduleLabel = moduleInfo
				? moduleInfo.mod.uname || moduleInfo.moduleDef?.short || String(assignment.moduleIndex)
				: String(assignment.moduleIndex);
			// Level-meter target (isLed=1): paramIndex is a LED number, not a param. The hardware shows
			// it as a circular VU around the knob; the editor shows a live VU meter (VuMeterRound/VuMeterBar).
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
			const buttonParamIndex = buttonParamIndexFor(assignment, moduleInfo);
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
				defaultValue: knobDisplay.defaultValue,
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
	}

	// The real mode-switch is the SHIFT+GLOBAL front-panel combo (set-knob-source, opcode 0x3F
	// sub-mode 0x02 — confirmed against real hardware 2026-08-28), NOT the page-select opcodes.
	// Push that first so the front panel actually switches source, then read back the page the
	// G2 shows in that source (it keeps a separate Patch and Global page) instead of pushing ours.
	async function toggleGlobalPages() {
		const next = !uiStore.globalPagesActive;
		uiStore.setGlobalPagesActive(next);
		await slotsStore.setKnobSource(next);
		await slotsStore.requestVisibleParamPage();
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
		if (a.location === 2) return openContextMenu(event, items);
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
		setBadgeDragImage(e, label);
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

	return {
		assignmentSlot,
		resolveModule,
		buttonParamIndexFor,
		currentAssignments,
		buildPageCells,
		toggleGlobalPages,
		onCellContextMenu,
		onKnobDragStart,
		onKnobDrop,
	};
}
