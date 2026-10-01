import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { getModule } from '../renderer/nmg2mods';
import { getJackSvgPos } from '../renderer/jackGeometry';
import { isNestDrivenByOutput } from '../parser/cableGraph';
import { getEffectiveJackColor } from '../constants';
import { useJackPatching } from './useJackPatching';

export type GhostJack = { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colour: string };
export type GhostPoint = { x: number; y: number };
export type GhostCable = { area: 0 | 1; from: GhostJack; to: GhostJack | GhostPoint };
export type GhostCandidate = { from: GhostJack; to: GhostJack };

export function isGhostJack(to: GhostJack | GhostPoint): to is GhostJack {
	return 'moduleIndex' in to;
}

// A jack's colour can flip when its module is uprated (see getEffectiveJackColor): blue/purple -> red,
// yellow -> orange. Two jacks are considered the same "family" if they'd display the same colour once
// uprated, so a currently-blue input still counts as a match for a red output.
function colourFamily(colour: string): string {
	return getEffectiveJackColor(colour, true);
}

// Most recently added module (any entry point, see finalizeModuleAdd in useAddModule.ts) for
// auto-suggest's fallback tier. Lives here, not in useAddModule.ts, so the import stays one-way.
let lastAddedModule: { index: number; area: 'va' | 'fx'; slot: string } | null = null;

export function setLastAddedModule(index: number, area: 'va' | 'fx', slot: string) {
	lastAddedModule = { index, area, slot };
}

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
			uiStore.ghostCable = null;
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
			const last = lastAddedModule;
			if (last && last.index !== newModuleIndex && last.area === area && last.slot === uiStore.slotInFocus) sourceModIndex = last.index;
		}
		if (sourceModIndex === null) {
			uiStore.ghostCable = null;
			return;
		}

		const sourceMod = modules.find((m: any) => m.index === sourceModIndex);
		const sourceModDef = sourceMod ? getModule(sourceMod.type) : null;
		const outputs = sourceModDef?.outputs ?? [];
		if (outputs.length === 0) {
			uiStore.ghostCable = null;
			return;
		}

		const freeInputs = (newModDef.inputs ?? [])
			.map((jack: any, idx: number) => ({ jack, idx }))
			.filter(({ idx }: { idx: number }) => !isNestDrivenByOutput(cables, newModuleIndex, idx));
		if (freeInputs.length === 0) {
			uiStore.ghostCable = null;
			return;
		}

		// Rank every (output, free input) pair on the two already-chosen modules: same-colour-family
		// pairs first (a jack that can flip to another colour counts as that colour, see colourFamily),
		// then by physical jack distance — modules lay out related jacks near each other, so the
		// closest pair within a matching family is the most likely intended connection.
		const getModules = () => modules;
		const candidates = outputs
			.map((output: any, outIdx: number) => {
				const outPos = getJackSvgPos(getModules, { moduleIndex: sourceModIndex!, connectorIndex: outIdx, type: 'output' });
				return freeInputs.map(({ jack: input, idx: inIdx }: { jack: any; idx: number }) => {
					const inPos = getJackSvgPos(getModules, { moduleIndex: newModuleIndex, connectorIndex: inIdx, type: 'input' });
					const distance = outPos && inPos ? Math.hypot(outPos.x - inPos.x, outPos.y - inPos.y) : Infinity;
					const matched = colourFamily(output.colour) === colourFamily(input.colour);
					const candidate: GhostCandidate = {
						from: { moduleIndex: sourceModIndex!, connectorIndex: outIdx, type: 'output', colour: output.colour },
						to: { moduleIndex: newModuleIndex, connectorIndex: inIdx, type: 'input', colour: input.colour },
					};
					return { candidate, matched, distance };
				});
			})
			.flat()
			.sort((a, b) => (a.matched === b.matched ? a.distance - b.distance : a.matched ? -1 : 1))
			.map(({ candidate }) => candidate);

		uiStore.ghostCandidates = candidates;
		uiStore.ghostCandidateIndex = 0;
		uiStore.ghostCable = { area: areaIdx, ...candidates[0] };
	}

	function clearGhostCable(): void {
		uiStore.ghostCable = null;
		uiStore.ghostCandidates = [];
		uiStore.ghostCandidateIndex = 0;
	}

	// Cycles the auto-suggest ghost cable to the next-best candidate pair on the same source/target
	// module, wrapping back to the first (best) candidate after the last.
	function cycleGhostCable(): void {
		const candidates = uiStore.ghostCandidates;
		if (candidates.length < 2 || !uiStore.ghostCable) return;
		uiStore.ghostCandidateIndex = (uiStore.ghostCandidateIndex + 1) % candidates.length;
		uiStore.ghostCable = { area: uiStore.ghostCable.area, ...candidates[uiStore.ghostCandidateIndex] };
	}

	async function confirmGhostCable(): Promise<void> {
		const ghost = uiStore.ghostCable;
		if (!ghost || !isGhostJack(ghost.to)) return; // a live-preview ghost (to = mouse point) has nothing to confirm here
		clearGhostCable();
		await connectJacks({ ...ghost.from, area: ghost.area }, { ...ghost.to, area: ghost.area });
	}

	return { computeGhostSuggestion, clearGhostCable, cycleGhostCable, confirmGhostCable };
}
