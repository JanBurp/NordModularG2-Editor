import { onMounted, onUnmounted } from 'vue';
import { useUiStore } from '../store/ui';
import { useSlotsStore } from '../store/slots';
import { getModule } from '../renderer/nmg2mods';
import { getParam } from '../renderer/parammap';
import { useParamEditDialog } from './useParamEditDialog';
import type { ModuleInstance } from '../types';

function isInputFocused(): boolean {
	const el = document.activeElement;
	return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

function closestVert(modules: ModuleInstance[], targetVert: number): ModuleInstance {
	return modules.reduce((best, m) => (Math.abs(m.vert - targetVert) < Math.abs(best.vert - targetVert) ? m : best));
}

export function useModuleKeyboard() {
	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	const { showDialog } = useParamEditDialog();

	function getModulesInArea(area: 0 | 1): ModuleInstance[] {
		return slotsStore.getAreaModules(uiStore.slotInFocus, area) as ModuleInstance[];
	}

	function getSelectedArea(): 0 | 1 {
		if (uiStore.selectedModulesArea === 'va') return 1;
		if (uiStore.selectedModulesArea === 'fx') return 0;
		return uiStore.activeArea;
	}

	function getActiveModules(): ModuleInstance[] {
		return getModulesInArea(getSelectedArea());
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
	}

	function navigateModule(key: string) {
		const area = getSelectedArea();
		const modules = getModulesInArea(area);
		if (modules.length === 0) return;
		const isSplit = uiStore.area === 2;

		if (uiStore.selectedModules.length === 0) {
			// First use: pick top-left of active area
			const topLeft = modules.reduce((best, m) =>
				m.horiz < best.horiz || (m.horiz === best.horiz && m.vert < best.vert) ? m : best,
			);
			selectInArea(topLeft, area);
			return;
		}

		const originId = uiStore.selectedModules[0];
		const cur = modules.find((m) => m.index === originId);
		if (!cur) return;

		const columns = new Map<number, ModuleInstance[]>();
		for (const m of modules) {
			if (!columns.has(m.horiz)) columns.set(m.horiz, []);
			columns.get(m.horiz)!.push(m);
		}
		const sortedColKeys = Array.from(columns.keys()).sort((a, b) => a - b);

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
					if (target) { next = target; nextArea = 0; }
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
					if (target) { next = target; nextArea = 1; }
				} else {
					// Wrap within same area to last column bottom
					next = columns.get(sortedColKeys[sortedColKeys.length - 1])!.sort((a, b) => b.vert - a.vert)[0];
				}
			}
		} else if (key === 'ArrowRight') {
			const nextColKey = sortedColKeys.find((c) => c > cur.horiz);
			if (nextColKey !== undefined) {
				next = closestVert(columns.get(nextColKey)!, cur.vert);
			} else if (isSplit && area === 1) {
				const target = getTopLeftModule(0);
				if (target) { next = target; nextArea = 0; }
			}
		} else if (key === 'ArrowLeft') {
			const prevColKey = [...sortedColKeys].reverse().find((c) => c < cur.horiz);
			if (prevColKey !== undefined) {
				next = closestVert(columns.get(prevColKey)!, cur.vert);
			} else if (isSplit && area === 0) {
				const target = getBottomRightModule(1);
				if (target) { next = target; nextArea = 1; }
			}
		}

		if (next) selectInArea(next, nextArea);
	}

	// Find module across both areas
	function findModuleAnywhere(moduleId: number): { module: ModuleInstance; area: 0 | 1 } | undefined {
		for (const a of [0, 1] as const) {
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
		const newValue = Math.max(paramDef.low, Math.min(paramDef.high, current + delta));
		await slotsStore.setParam(sel.moduleId, sel.paramIndex, newValue, variation, areaKey as 'voice' | 'fx');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (showDialog.value) return;
		if (isInputFocused()) return;

		const { key, shiftKey, altKey } = e;

		const isArrow = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
		if (!isArrow) return;

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
}
