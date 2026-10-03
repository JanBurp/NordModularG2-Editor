import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { getModule } from '../renderer/nmg2mods';
import { isNestDrivenByOutput } from '../parser/cableGraph';
import { getEffectiveJackColor, MODULE_WIDTH } from '../constants';
import { useJackPatching } from './useJackPatching';

export type GhostJack = { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colour: string };
export type GhostPoint = { x: number; y: number };
export type GhostPair = { from: GhostJack; to: GhostJack };
// `extra` is the second cable of a stereo suggestion (e.g. R->R, or a mono output feeding both inputs).
export type GhostCandidate = GhostPair & { extra?: GhostPair };
export type GhostCable = { area: 0 | 1; from: GhostJack; to: GhostJack | GhostPoint; extra?: GhostPair };

export function isGhostJack(to: GhostJack | GhostPoint): to is GhostJack {
	return 'moduleIndex' in to;
}

// A Dynamic jack's colour can flip when its module is uprated (see getEffectiveJackColor): purple -> red,
// orange -> orange (from yellow). Two jacks are considered the same "family" if they'd display the same
// colour once uprated, so a currently-blue purple input still counts as a match for a red output.
function colourFamily(colour: string): string {
	return getEffectiveJackColor(colour, true);
}

type IndexedJack = { jack: any; idx: number };

// Auto-suggest only considers audio-rate jacks (red, or purple which can be uprated to red) in the
// right third of the module, where Osc/Filter/FX/Level/Mixer/... keep their audio inputs and outputs.
function isAudioJackOnRight(jack: any): boolean {
	return colourFamily(jack.colour) === 'red' && jack.x >= (MODULE_WIDTH * 2) / 3;
}

// Groups jacks into stereo pairs (names X+'L' / X+'R', e.g. InL/InR, In1L/In1R) and single jacks.
function toUnits(jacks: IndexedJack[]): IndexedJack[][] {
	const units: IndexedJack[][] = [];
	const paired = new Set<number>();
	for (const left of jacks) {
		const right = left.jack.name.endsWith('L') ? jacks.find((j) => j.jack.name === `${left.jack.name.slice(0, -1)}R`) : undefined;
		if (!right) continue;
		units.push([left, right]);
		paired.add(left.idx).add(right.idx);
	}
	return [...units, ...jacks.filter((j) => !paired.has(j.idx)).map((j) => [j])];
}

const unitY = (unit: IndexedJack[]) => Math.min(...unit.map((j) => j.jack.y));

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
		const outputs = (sourceModDef?.outputs ?? [])
			.map((jack: any, idx: number) => ({ jack, idx }))
			.filter(({ jack }: IndexedJack) => isAudioJackOnRight(jack));
		if (outputs.length === 0) {
			uiStore.ghostCable = null;
			return;
		}

		const freeInputs = (newModDef.inputs ?? [])
			.map((jack: any, idx: number) => ({ jack, idx }))
			.filter(({ jack, idx }: IndexedJack) => isAudioJackOnRight(jack) && !isNestDrivenByOutput(cables, newModuleIndex, idx));
		if (freeInputs.length === 0) {
			uiStore.ghostCable = null;
			return;
		}

		// One candidate per (output unit, input unit), see toUnits: inputs top-first, outputs bottom-first
		// (module layouts put the main audio in at top-right and out at bottom-right). A stereo input gets
		// two cables: L->L and R->R from a stereo output, or the single output into both L and R.
		const pair = (out: IndexedJack, inp: IndexedJack): GhostPair => ({
			from: { moduleIndex: sourceModIndex!, connectorIndex: out.idx, type: 'output', colour: out.jack.colour },
			to: { moduleIndex: newModuleIndex, connectorIndex: inp.idx, type: 'input', colour: inp.jack.colour },
		});
		const outUnits = toUnits(outputs).sort((a, b) => unitY(b) - unitY(a));
		const candidates: GhostCandidate[] = toUnits(freeInputs)
			.sort((a, b) => unitY(a) - unitY(b))
			.flatMap(([inL, inR]) =>
				outUnits.map(([outL, outR]) => {
					const first = pair(outL, inL);
					return inR ? { ...first, extra: pair(outR ?? outL, inR) } : first;
				}),
			);

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
		if (ghost.extra) await connectJacks({ ...ghost.extra.from, area: ghost.area }, { ...ghost.extra.to, area: ghost.area });
	}

	return { computeGhostSuggestion, clearGhostCable, cycleGhostCable, confirmGhostCable };
}
