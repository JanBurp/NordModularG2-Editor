import { ref } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { getModule } from '../renderer/nmg2mods';
import { isNestDrivenByOutput } from '../parser/cableGraph';
import { useJackPatching } from './useJackPatching';
import { getLastAddedModule } from './useAddModule';

export type GhostJack = { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colour: string };
export type GhostPoint = { x: number; y: number };
export type GhostCable = { area: 0 | 1; from: GhostJack; to: GhostJack | GhostPoint };

export function isGhostJack(to: GhostJack | GhostPoint): to is GhostJack {
	return 'moduleIndex' in to;
}

// Prefer audio (red) jacks, then control (blue), then logic (yellow); anything else is lowest priority.
const COLOUR_PRIORITY: Record<string, number> = { red: 0, blue: 1, yellow: 2 };
function colourRank(colour: string): number {
	return COLOUR_PRIORITY[colour] ?? 3;
}

// Shared across every useGhostCable() call so a suggestion computed from useAddModule.ts/
// usePatchOperations.ts is visible to whichever PatchCanvas renders it.
const ghostCable = ref<GhostCable | null>(null);

export function useGhostCable() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const { connectJacks } = useJackPatching();

	function computeGhostSuggestion(newModuleIndex: number, col: number, row: number, area: 'va' | 'fx'): void {
		const areaIdx: 0 | 1 = area === 'va' ? 1 : 0;
		const modules = slotsStore.getAreaModules(uiStore.slotInFocus, areaIdx);
		const cables = slotsStore.getAreaCables(uiStore.slotInFocus, areaIdx);
		const newMod = modules.find((m: any) => m.index === newModuleIndex);
		const newModDef = newMod ? getModule(newMod.type) : null;
		if (!newModDef) {
			ghostCable.value = null;
			return;
		}

		let sourceModIndex: number | null = null;
		if (uiStore.selectedModules.length === 1 && uiStore.selectedModulesArea === area) {
			sourceModIndex = uiStore.selectedModules[0];
		}
		if (sourceModIndex === null) {
			const above = modules.find((m: any) => {
				if (m.index === newModuleIndex || m.horiz !== col) return false;
				const height = getModule(m.type)?.height ?? 2;
				return m.vert + height === row;
			});
			if (above) sourceModIndex = above.index;
		}
		if (sourceModIndex === null) {
			const last = getLastAddedModule();
			if (last && last.index !== newModuleIndex && last.area === area) sourceModIndex = last.index;
		}
		if (sourceModIndex === null) {
			ghostCable.value = null;
			return;
		}

		const sourceMod = modules.find((m: any) => m.index === sourceModIndex);
		const sourceModDef = sourceMod ? getModule(sourceMod.type) : null;
		const outputs = sourceModDef?.outputs ?? [];
		if (outputs.length === 0) {
			ghostCable.value = null;
			return;
		}
		let bestOutIdx = 0;
		for (let i = 1; i < outputs.length; i++) {
			if (colourRank(outputs[i].colour) < colourRank(outputs[bestOutIdx].colour)) bestOutIdx = i;
		}

		const freeInputs = (newModDef.inputs ?? [])
			.map((jack: any, idx: number) => ({ jack, idx }))
			.filter(({ idx }: { idx: number }) => !isNestDrivenByOutput(cables, newModuleIndex, idx));
		if (freeInputs.length === 0) {
			ghostCable.value = null;
			return;
		}
		let best = freeInputs[0];
		for (const cand of freeInputs) {
			if (colourRank(cand.jack.colour) < colourRank(best.jack.colour)) best = cand;
		}

		ghostCable.value = {
			area: areaIdx,
			from: { moduleIndex: sourceModIndex, connectorIndex: bestOutIdx, type: 'output', colour: outputs[bestOutIdx].colour },
			to: { moduleIndex: newModuleIndex, connectorIndex: best.idx, type: 'input', colour: best.jack.colour },
		};
	}

	function clearGhostCable(): void {
		ghostCable.value = null;
	}

	async function confirmGhostCable(): Promise<void> {
		const ghost = ghostCable.value;
		if (!ghost || !isGhostJack(ghost.to)) return; // a live-preview ghost (to = mouse point) has nothing to confirm here
		clearGhostCable();
		await connectJacks({ ...ghost.from, area: ghost.area }, { ...ghost.to, area: ghost.area });
	}

	return { ghostCable, computeGhostSuggestion, clearGhostCable, confirmGhostCable };
}
