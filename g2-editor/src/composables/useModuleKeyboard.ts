import { onMounted, onUnmounted } from 'vue';
import { useUiStore } from '../store/ui';
import { useSlotsStore } from '../store/slots';
import { DeviceStatus, useDeviceStore } from '../store/device';
import { getModule } from '../renderer/nmg2mods';
import { getParam } from '../renderer/parammap';
import { useParamEditDialog } from './useParamEditDialog';
import type { ModuleInstance } from '../types';
import { clamp } from '@/utils/math';
import { isGrabModifierPressed } from '@/utils/platform';

function isInputFocused(): boolean {
	const el = document.activeElement;
	return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

export function useModuleKeyboard() {
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	const deviceStore = useDeviceStore();
	const { showDialog } = useParamEditDialog();

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
					next = columns.get(sortedColKeys[nextColIdx])!.sort((a, b) => a.vert - b.vert)[0];
				} else if (isSplit && area === 1) {
					// Voice bottom-right → cross to FX top-left
					const target = getTopLeftModule(0);
					if (target) {
						next = target;
						nextArea = 0;
					}
				} else {
					// Wrap within same area to first column top
					next = columns.get(sortedColKeys[0])!.sort((a, b) => a.vert - b.vert)[0];
				}
			}
		} else if (key === 'ArrowUp') {
			const sameCol = (columns.get(cur.horiz) ?? []).filter((m) => m.vert < cur.vert).sort((a, b) => b.vert - a.vert);
			if (sameCol.length > 0) {
				next = sameCol[0];
			} else {
				const prevColKey = [...sortedColKeys].reverse().find((c) => c < cur.horiz);
				if (prevColKey !== undefined) {
					next = columns.get(prevColKey)!.sort((a, b) => b.vert - a.vert)[0];
				} else if (isSplit && area === 0) {
					// FX top-left → cross to Voice bottom-right
					const target = getBottomRightModule(1);
					if (target) {
						next = target;
						nextArea = 1;
					}
				} else {
					// Wrap within same area to last column bottom
					next = columns.get(sortedColKeys[sortedColKeys.length - 1])!.sort((a, b) => b.vert - a.vert)[0];
				}
			}
		} else if (key === 'ArrowRight') {
			const nextColKey = sortedColKeys.find((c) => c > cur.horiz);
			if (nextColKey !== undefined) {
				// Always lands on the target column's top module (matches G2 panel cursor nav)
				next = columns.get(nextColKey)!.sort((a, b) => a.vert - b.vert)[0];
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
				next = columns.get(prevColKey)!.sort((a, b) => a.vert - b.vert)[0];
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
		const params = moduleDef?.params;
		if (!params || params.length === 0) return;

		const currentParamIndex = uiStore.selectedParam?.moduleId === moduleId ? uiStore.selectedParam.paramIndex : -1;
		const newIndex = currentParamIndex < 0 ? 0 : (currentParamIndex + dir + params.length) % params.length;
		uiStore.setSelectedParam(moduleId, newIndex);
		syncCursorToHardware(moduleId, newIndex, found.area);
	}

	async function changeParamValue(delta: number) {
		const sel = uiStore.selectedParam;
		if (!sel) return;
		const found = findModuleAnywhere(sel.moduleId);
		if (!found) return;
		const moduleDef = getModule(found.module.type);
		const param = moduleDef?.params?.[sel.paramIndex];
		if (!param) return;
		const paramDef = getParam(param.type);
		if (!paramDef) return;

		const areaKey = found.area === 1 ? 'voice' : 'fx';
		const variation = uiStore.variation;
		const current = slotsStore.slots[uiStore.slotInFocus]?.variations?.[variation]?.[areaKey]?.[sel.moduleId]?.[sel.paramIndex] ?? paramDef.def;
		const newValue = clamp(current + delta, paramDef.low, paramDef.high);
		await slotsStore.setParam(sel.moduleId, sel.paramIndex, newValue, variation, areaKey as 'voice' | 'fx');
	}

	// Ctrl/Cmd+Up/Down nudges the selected param's morph range for the currently selected group
	// (only when it's already assigned to that group).
	function nudgeMorphRange(delta: number) {
		const sel = uiStore.selectedParam;
		if (!sel) return;
		const found = findModuleAnywhere(sel.moduleId);
		if (!found) return;
		const slot = uiStore.slotInFocus;
		if (!slot) return;
		const groupIndex = uiStore.selectedMorphGroup;
		const variation = uiStore.variation;
		const existing = slotsStore
			.getMorphAssignments(slot, variation)
			.find((a) => a.groupIndex === groupIndex && a.location === found.area && a.moduleIndex === sel.moduleId && a.paramIndex === sel.paramIndex);
		if (!existing) return;
		slotsStore.setMorphAssignmentRange(slot, variation, groupIndex, found.area, sel.moduleId, sel.paramIndex, clamp(existing.range + delta, -127, 127));
	}

	// Ctrl/Cmd+Enter toggles the selected param's assignment to the currently selected morph
	// group — the keyboard equivalent of a Ctrl/Cmd-click on a param (see useMorphRangeDrag.ts).
	// Assigns at the same default full range (127) the mouse paths use.
	function toggleMorphAssign() {
		const sel = uiStore.selectedParam;
		if (!sel) return;
		const found = findModuleAnywhere(sel.moduleId);
		if (!found) return;
		const slot = uiStore.slotInFocus;
		if (!slot) return;
		const groupIndex = uiStore.selectedMorphGroup;
		const variation = uiStore.variation;
		const existing = slotsStore
			.getMorphAssignments(slot, variation)
			.find((a) => a.groupIndex === groupIndex && a.location === found.area && a.moduleIndex === sel.moduleId && a.paramIndex === sel.paramIndex);
		if (existing) slotsStore.deassignParamFromMorphGroup(slot, variation, groupIndex, found.area, sel.moduleId, sel.paramIndex);
		else slotsStore.assignParamToMorphGroup(slot, variation, groupIndex, found.area, sel.moduleId, sel.paramIndex, 127);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (showDialog.value) return;
		if (isInputFocused()) return;

		const { key, shiftKey, altKey } = e;

		if (isGrabModifierPressed(e) && key >= '1' && key <= '8') {
			uiStore.setSelectedMorphGroup(Number(key) - 1);
			e.preventDefault();
			return;
		}

		if (isGrabModifierPressed(e) && key === 'Enter') {
			toggleMorphAssign();
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

		if (shiftKey && !altKey) {
			navigateModule(key);
			e.preventDefault();
		} else if (!shiftKey && uiStore.selectedModules.length > 0) {
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

	onMounted(() => window.addEventListener('keydown', handleKeydown));
	onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

	return { handleKeydown };
}
