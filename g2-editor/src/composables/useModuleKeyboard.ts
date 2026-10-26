import { onMounted, onUnmounted } from 'vue';
import { useUiStore } from '../store/ui';
import { useSlotsStore } from '../store/slots';
import { useSettingsStore } from '../store/settings';
import { DeviceStatus, useDeviceStore } from '../store/device';
import { getModule, getParamDefault, getParamNavOrder } from '../renderer/nmg2mods';
import { getParam } from '../renderer/parammap';
import { isValueEditable, useParamEditDialog } from './useParamEditDialog';
import { useValueHint } from './useValueHint';
import type { ModuleInstance } from '../types';
import { clamp } from '@/utils/math';
import { isGrabModifierPressed } from '@/utils/platform';

function isInput(el: unknown): boolean {
	return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

export function useModuleKeyboard() {
	const uiStore = useUiStore();
	const valueHint = useValueHint();
	const slotsStore = useSlotsStore();
	const deviceStore = useDeviceStore();
	const settingsStore = useSettingsStore();
	const { showDialog, openParamEdit } = useParamEditDialog();

	// Mirrors the cursor move to the hardware panel (SUB_COMMAND_SEL_PARAM, 0x2F) so the
	// G2's own Select LED tracks keyboard navigation. Fire-and-forget: a dropped/failed send
	// just means the hardware cursor briefly lags, not a state-correctness issue.
	function syncCursorToHardware(moduleId: number, paramIndex: number, area: 0 | 1) {
		if (deviceStore.status !== DeviceStatus.Connected) return;
		window.cli.run(['select-param', uiStore.slotInFocus, area === 1 ? 'va' : 'fx', String(moduleId), String(paramIndex)]).catch(() => {});
	}

	// Module mutations always replace the area's `modules` array (see patchMutations.ts), so caching
	// by reference is safe: it hits across repeated arrow-key navigation and invalidates automatically
	// the moment the patch changes.
	let columnMapCache: { modules: ModuleInstance[]; result: { columns: Map<number, ModuleInstance[]>; sortedKeys: number[] } } | null = null;
	function buildColumnMap(modules: ModuleInstance[]): { columns: Map<number, ModuleInstance[]>; sortedKeys: number[] } {
		if (columnMapCache?.modules === modules) return columnMapCache.result;
		const columns = new Map<number, ModuleInstance[]>();
		for (const m of modules) {
			if (!columns.has(m.horiz)) columns.set(m.horiz, []);
			columns.get(m.horiz)!.push(m);
		}
		const sortedKeys = Array.from(columns.keys()).sort((a, b) => a - b);
		const result = { columns, sortedKeys };
		columnMapCache = { modules, result };
		return result;
	}

	function getModulesInArea(area: 0 | 1): ModuleInstance[] {
		return slotsStore.getAreaModules(uiStore.slotInFocus, area) as ModuleInstance[];
	}

	function getSelectedArea(): 0 | 1 {
		if (uiStore.selectedModulesArea === 'va') return 1;
		if (uiStore.selectedModulesArea === 'fx') return 0;
		return uiStore.activeArea;
	}

	function getTopLeftModule(area: 0 | 1): ModuleInstance | undefined {
		const mods = getModulesInArea(area);
		if (mods.length === 0) return undefined;
		const minHoriz = Math.min(...mods.map((m) => m.horiz));
		const firstCol = mods.filter((m) => m.horiz === minHoriz);
		return firstCol.reduce((best, m) => (m.vert < best.vert ? m : best));
	}

	function getBottomRightModule(area: 0 | 1): ModuleInstance | undefined {
		const mods = getModulesInArea(area);
		if (mods.length === 0) return undefined;
		const maxHoriz = Math.max(...mods.map((m) => m.horiz));
		const lastCol = mods.filter((m) => m.horiz === maxHoriz);
		return lastCol.reduce((best, m) => (m.vert > best.vert ? m : best));
	}

	function selectInArea(module: ModuleInstance, area: 0 | 1) {
		uiStore.selectModules([module.index], area === 1 ? 'va' : 'fx');
		uiStore.setSelectedParam(module.index, 0);
		syncCursorToHardware(module.index, 0, area);
	}

	function navigateModule(key: string) {
		const area = getSelectedArea();
		const modules = getModulesInArea(area);
		if (modules.length === 0) return;
		const isSplit = uiStore.area === 2;

		if (uiStore.selectedModules.length === 0) {
			// First use: pick top-left of active area
			const topLeft = modules.reduce((best, m) => (m.horiz < best.horiz || (m.horiz === best.horiz && m.vert < best.vert) ? m : best));
			selectInArea(topLeft, area);
			return;
		}

		const originId = uiStore.selectedModules[0];
		const cur = modules.find((m) => m.index === originId);
		if (!cur) return;

		const { columns, sortedKeys: sortedColKeys } = buildColumnMap(modules);

		let next: ModuleInstance | undefined;
		let nextArea = area;

		if (key === 'ArrowDown') {
			const sameCol = (columns.get(cur.horiz) ?? []).filter((m) => m.vert > cur.vert).sort((a, b) => a.vert - b.vert);
			if (sameCol.length > 0) {
				next = sameCol[0];
			} else {
				const nextColIdx = sortedColKeys.findIndex((c) => c > cur.horiz);
				if (nextColIdx >= 0) {
					next = [...columns.get(sortedColKeys[nextColIdx])!].sort((a, b) => a.vert - b.vert)[0];
				} else if (isSplit && area === 1) {
					// Voice bottom-right → cross to FX top-left
					const target = getTopLeftModule(0);
					if (target) {
						next = target;
						nextArea = 0;
					}
				} else {
					// Wrap within same area to first column top
					next = [...columns.get(sortedColKeys[0])!].sort((a, b) => a.vert - b.vert)[0];
				}
			}
		} else if (key === 'ArrowUp') {
			const sameCol = (columns.get(cur.horiz) ?? []).filter((m) => m.vert < cur.vert).sort((a, b) => b.vert - a.vert);
			if (sameCol.length > 0) {
				next = sameCol[0];
			} else {
				const prevColKey = [...sortedColKeys].reverse().find((c) => c < cur.horiz);
				if (prevColKey !== undefined) {
					next = [...columns.get(prevColKey)!].sort((a, b) => b.vert - a.vert)[0];
				} else if (isSplit && area === 0) {
					// FX top-left → cross to Voice bottom-right
					const target = getBottomRightModule(1);
					if (target) {
						next = target;
						nextArea = 1;
					}
				} else {
					// Wrap within same area to last column bottom
					next = [...columns.get(sortedColKeys[sortedColKeys.length - 1])!].sort((a, b) => b.vert - a.vert)[0];
				}
			}
		} else if (key === 'ArrowRight') {
			const nextColKey = sortedColKeys.find((c) => c > cur.horiz);
			if (nextColKey !== undefined) {
				// Always lands on the target column's top module (matches G2 panel cursor nav)
				next = [...columns.get(nextColKey)!].sort((a, b) => a.vert - b.vert)[0];
			} else if (isSplit && area === 1) {
				const target = getTopLeftModule(0);
				if (target) {
					next = target;
					nextArea = 0;
				}
			}
		} else if (key === 'ArrowLeft') {
			const prevColKey = [...sortedColKeys].reverse().find((c) => c < cur.horiz);
			if (prevColKey !== undefined) {
				// Always lands on the target column's top module (matches G2 panel cursor nav)
				next = [...columns.get(prevColKey)!].sort((a, b) => a.vert - b.vert)[0];
			} else if (isSplit && area === 0) {
				const target = getBottomRightModule(1);
				if (target) {
					next = target;
					nextArea = 1;
				}
			}
		}

		if (next) selectInArea(next, nextArea);
	}

	// Find module across both areas, preferring the area that owns the current selection.
	function findModuleAnywhere(moduleId: number): { module: ModuleInstance; area: 0 | 1 } | undefined {
		const preferred: 0 | 1 = uiStore.selectedModulesArea === 'va' ? 1 : 0;
		const other: 0 | 1 = preferred === 1 ? 0 : 1;
		for (const a of [preferred, other]) {
			const m = getModulesInArea(a).find((m) => m.index === moduleId);
			if (m) return { module: m, area: a };
		}
		return undefined;
	}

	function navigateParam(dir: 1 | -1) {
		if (uiStore.selectedModules.length === 0) return;
		const moduleId = uiStore.selectedModules[0];
		const found = findModuleAnywhere(moduleId);
		if (!found) return;
		const moduleDef = getModule(found.module.type);
		if (!moduleDef?.params?.length) return;
		const order = getParamNavOrder(moduleDef);

		const currentParamIndex = uiStore.selectedParam?.moduleId === moduleId ? uiStore.selectedParam.paramIndex : -1;
		const pos = order.indexOf(currentParamIndex);
		const newIndex = order[pos < 0 ? 0 : (pos + dir + order.length) % order.length];
		uiStore.setSelectedParam(moduleId, newIndex);
		syncCursorToHardware(moduleId, newIndex, found.area);
	}

	// Arrow Up/Down target: uiStore.keyTargetParam (none while a toolbar knob is hovered, that knob takes the keys).
	function findKeyTarget(): { sel: { moduleId: number; paramIndex: number }; found: { module: ModuleInstance; area: 0 | 1 } } | undefined {
		const sel = uiStore.keyTargetParam;
		if (!sel) return undefined;
		const area: 0 | 1 = sel.area === 'va' ? 1 : 0;
		const module = getModulesInArea(area).find((m) => m.index === sel.moduleId);
		return module ? { sel, found: { module, area } } : undefined;
	}

	async function changeParamValue(delta: number) {
		const target = findKeyTarget();
		if (!target) return;
		const { sel, found } = target;
		const moduleDef = getModule(found.module.type);
		const param = moduleDef?.params?.[sel.paramIndex];
		if (!param) return;
		const paramDef = getParam(param.type);
		if (!paramDef) return;

		const areaKey = found.area === 1 ? 'voice' : 'fx';
		const variation = uiStore.variation;
		const current = slotsStore.slots[uiStore.slotInFocus]?.variations?.[variation]?.[areaKey]?.[sel.moduleId]?.[sel.paramIndex] ?? paramDef.def;
		const newValue = clamp(current + delta, paramDef.low, paramDef.high);
		valueHint.changed({ moduleIndex: sel.moduleId, paramIndex: sel.paramIndex, area: found.area === 1 ? 'va' : 'fx' });
		await slotsStore.setParam(sel.moduleId, sel.paramIndex, newValue, variation, areaKey as 'voice' | 'fx');
	}

	// Clicks in popups (context menu, Set Value) don't count: they're opened from the canvas.
	let lastPointerOnCanvas = true;
	function handlePointerDown(e: PointerEvent) {
		const el = e.target as Element | null;
		if (el?.closest?.('[role=dialog], [role=menu]')) return;
		lastPointerOnCanvas = !!el?.closest?.('[data-testid^="canvas-"]');
	}

	// `=` opens the Set Value popup for the key-target param, below its control (or mid-window if
	// it's not on screen); Enter resets it to its default, like a double-click.
	function editKeyTargetParam(reset: boolean): boolean {
		const target = findKeyTarget();
		if (!target) return false;
		const { sel, found } = target;
		// Without a hovered param: only while the selected param's module is still selected (like the
		// arrow keys) and the last click was on the canvas — Enter also activates e.g. Patch Browser items
		if (!(settingsStore.hoverKeyTarget && uiStore.hoveredParam) && (!lastPointerOnCanvas || !uiStore.selectedModules.includes(sel.moduleId))) return false;
		const param = getModule(found.module.type)?.params?.[sel.paramIndex];
		if (!param || !isValueEditable(param)) return false;
		const area = found.area === 1 ? 'va' : 'fx';
		if (reset) {
			slotsStore.setParam(sel.moduleId, sel.paramIndex, getParamDefault(param), uiStore.variation, area === 'va' ? 'voice' : 'fx');
			return true;
		}
		const el = document.querySelector?.(`[data-testid="canvas-${area}"] [data-module-idx="${sel.moduleId}"] [data-param-index="${sel.paramIndex}"]`);
		const rect = el?.getBoundingClientRect();
		const pos = rect ? { x: rect.left, y: rect.bottom } : { x: window.innerWidth / 2 - 160, y: window.innerHeight / 3 };
		openParamEdit({ area, moduleIndex: sel.moduleId, paramIndex: sel.paramIndex, ...pos });
		return true;
	}

	// Resolves the currently selected param's module/slot/morph-group context, plus its existing
	// morph assignment (if any) for the currently selected group — shared by nudgeMorphRange and
	// toggleMorphAssign below.
	function findSelectedMorphAssignment() {
		const sel = uiStore.selectedParam;
		if (!sel) return undefined;
		const found = findModuleAnywhere(sel.moduleId);
		if (!found) return undefined;
		const slot = uiStore.slotInFocus;
		if (!slot) return undefined;
		const groupIndex = uiStore.selectedMorphGroup;
		const variation = uiStore.variation;
		const existing = slotsStore
			.getMorphAssignments(slot, variation)
			.find((a) => a.groupIndex === groupIndex && a.location === found.area && a.moduleIndex === sel.moduleId && a.paramIndex === sel.paramIndex);
		return { sel, found, slot, groupIndex, variation, existing };
	}

	// Ctrl/Cmd+Up/Down nudges the selected param's morph range for the currently selected group
	// (only when it's already assigned to that group).
	function nudgeMorphRange(delta: number) {
		const m = findSelectedMorphAssignment();
		if (!m?.existing) return;
		const { sel, found, slot, groupIndex, variation, existing } = m;
		slotsStore.setMorphAssignmentRange(slot, variation, groupIndex, found.area, sel.moduleId, sel.paramIndex, clamp(existing.range + delta, -127, 127));
	}

	// Ctrl/Cmd+Enter toggles the selected param's assignment to the currently selected morph
	// group — the keyboard equivalent of a Ctrl/Cmd-click on a param (see useMorphRangeDrag.ts).
	// Assigns at the same default full range (127) the mouse paths use.
	function toggleMorphAssign() {
		const m = findSelectedMorphAssignment();
		if (!m) return;
		const { sel, found, slot, groupIndex, variation, existing } = m;
		if (existing) slotsStore.deassignParamFromMorphGroup(slot, variation, groupIndex, found.area, sel.moduleId, sel.paramIndex);
		else slotsStore.assignParamToMorphGroup(slot, variation, groupIndex, found.area, sel.moduleId, sel.paramIndex, 127);
	}

	// L assigns the last-received MIDI CC to the selected parameter — matches the original
	// G2 editor's "MIDI Learn" shortcut. Reuses assignMidiCC's existing dedupe-by-cc behavior,
	// so stealing a CC already assigned to another knob just works.
	function assignLastCC() {
		const sel = uiStore.selectedParam;
		if (!sel) return;
		const cc = deviceStore.lastMidiCC;
		if (cc === null) return;
		const found = findModuleAnywhere(sel.moduleId);
		if (!found) return;
		const slot = uiStore.slotInFocus;
		if (!slot) return;
		slotsStore.assignMidiCC(slot, found.area, sel.moduleId, sel.paramIndex, cc);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (showDialog.value) return;
		if (uiStore.showQuickAdd) return;
		// The canvas is only hidden under the Bank Organizer: its keys must not edit the patch
		if (uiStore.showBankOrganizer) return;
		// Also the event's own target: a popup that closes on Enter (Set Value, Quick Add) can already
		// have unmounted its input — and moved focus to <body> — before this window listener runs.
		if (isInput(document.activeElement) || isInput(e.target)) return;
		// A focused slider/button group already handled this arrow key itself
		if (e.defaultPrevented || (document.activeElement as HTMLElement | null)?.closest('[role=slider], [role=menu], [role=listbox]')) return;

		const { key, code, shiftKey, altKey } = e;

		// e.code, not e.key: on macOS Option+digit yields '¡', '™', …
		if (altKey && !shiftKey && !isGrabModifierPressed(e) && /^Digit[1-8]$/.test(code)) {
			uiStore.setSelectedMorphGroup(Number(code.slice(5)) - 1);
			e.preventDefault();
			return;
		}

		if (isGrabModifierPressed(e) && key === 'Enter') {
			toggleMorphAssign();
			e.preventDefault();
			return;
		}

		// Shift allowed for `=` (Shift+0 on e.g. Dutch/German layouts). Plain Enter is also App.vue's
		// "confirm cable" key and activates a focused button — leave it alone then.
		const noMod = !altKey && !isGrabModifierPressed(e);
		const enterFree = !shiftKey && !uiStore.armedJack && !uiStore.ghostCable && (document.activeElement as HTMLElement | null)?.tagName !== 'BUTTON';
		if (noMod && (key === '=' || (key === 'Enter' && enterFree))) {
			if (editKeyTargetParam(key === 'Enter')) e.preventDefault();
			return;
		}

		if (key === 'l' && !shiftKey && !altKey && !isGrabModifierPressed(e)) {
			assignLastCC();
			e.preventDefault();
			return;
		}

		const isArrow = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
		if (!isArrow) return;

		if ((key === 'ArrowUp' || key === 'ArrowDown') && isGrabModifierPressed(e) && uiStore.selectedParam) {
			nudgeMorphRange(key === 'ArrowUp' ? 1 : -1);
			e.preventDefault();
			return;
		}

		// Up/Down on a hovered param works without a selected module
		const hoverValueKey = settingsStore.hoverKeyTarget && uiStore.hoveredParam !== null && (key === 'ArrowUp' || key === 'ArrowDown');
		if (shiftKey && !altKey) {
			navigateModule(key);
			e.preventDefault();
		} else if (!shiftKey && (uiStore.selectedModules.length > 0 || hoverValueKey)) {
			if (key === 'ArrowLeft' || key === 'ArrowRight') {
				navigateParam(key === 'ArrowRight' ? 1 : -1);
				e.preventDefault();
			} else {
				const delta = (key === 'ArrowUp' ? 1 : -1) * (altKey ? 16 : 1);
				changeParamValue(delta);
				e.preventDefault();
			}
		}
	}

	onMounted(() => {
		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('pointerdown', handlePointerDown, true);
	});
	onUnmounted(() => {
		window.removeEventListener('keydown', handleKeydown);
		window.removeEventListener('pointerdown', handlePointerDown, true);
	});

	return { handleKeydown, handlePointerDown };
}
