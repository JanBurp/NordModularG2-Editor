// Patch Mutator state: one instance per slot (manual ch. 7). Boxes hold immutable genomes; a focused
// box is auditioned through the live-only MUTATOR_VARIATION on the G2. Not saved with the patch —
// reset whenever the slot gets a new patch (history.clearHistory).

import { defineStore } from 'pinia';
import { markRaw, toRaw } from 'vue';
import type { SlotLabel } from '@/types';
import { MUTATOR_VARIATION, type VariationState } from '@/types/patch';
import * as M from '../renderer/mutator';
import { useSlotsStore, deepCloneVariationState } from './slots';
import { useUiStore } from './ui';
import { useHistoryStore } from './history';
import { usePatchAdjusterStore } from './patchAdjuster';

export type BoxKind = 'mother' | 'father' | 'child' | 'storage' | 'variation';
export interface BoxRef {
	kind: BoxKind;
	index: number;
}
export const STORAGE_COLS = 8;
export const STORAGE_ROWS = 3;
export const NUM_VISIBLE_VARIATIONS = 8;

interface Boxes {
	mother: M.Genome | null;
	father: M.Genome | null;
	children: (M.Genome | null)[];
	storage: (M.Genome | null)[];
	coupled: boolean; // children came from two parents (Interpolate/Cross) — drawn in the Couple colours
	focus: BoxRef | null; // null: a regular variation has the focus
}

interface MutatorSlot extends Boxes {
	prob: number;
	range: number;
	cross: number;
	link: boolean;
	lockMask: number;
	soloMask: number;
	selectedOnly: boolean; // Mutate/Randomize only the modules selected on the canvas
}

function emptySlot(): MutatorSlot {
	return {
		mother: null,
		father: null,
		children: Array(M.NUM_CHILDREN).fill(null),
		storage: Array(STORAGE_COLS * STORAGE_ROWS).fill(null),
		coupled: false,
		focus: null,
		prob: M.DEFAULT_PROB,
		range: M.DEFAULT_RANGE,
		cross: M.DEFAULT_CROSS,
		link: true,
		lockMask: M.DEFAULT_LOCK_MASK,
		soloMask: 0,
		selectedOnly: false,
	};
}

const snapshot = (s: Boxes): Boxes => ({
	mother: s.mother,
	father: s.father,
	children: [...s.children],
	storage: [...s.storage],
	coupled: s.coupled,
	focus: s.focus,
});

const sameRef = (a: BoxRef | null, b: BoxRef | null) => a?.kind === b?.kind && a?.index === b?.index;

// What one undo step restores: the boxes, the active variation and the sound in MUTATOR_VARIATION
// (official CUndoRedoPair of CMMutaParamDump + CMMutaSetMarker + CMParamSettingFocus).
interface StepState {
	boxes: Boxes;
	variation: number;
	live: VariationState | undefined;
}

export const useMutatorStore = defineStore('mutator', {
	state: () => ({
		slots: { A: emptySlot(), B: emptySlot(), C: emptySlot(), D: emptySlot() } as Record<SlotLabel, MutatorSlot>,
	}),

	getters: {
		current(state): MutatorSlot {
			return state.slots[useUiStore().slotInFocus];
		},
		// The focused box, or null when a regular variation is playing (e.g. picked in the toolbar).
		focus(): BoxRef | null {
			return useUiStore().variation === MUTATOR_VARIATION ? this.current.focus : null;
		},
		// "Selected" with nothing selected: Mutate/Randomize would only produce copies of the source.
		noSelection(): boolean {
			return this.current.selectedOnly && useUiStore().selectedModules.length === 0;
		},
	},

	actions: {
		reset(slot: SlotLabel): void {
			this.slots[slot] = emptySlot();
		},

		_slot(): SlotLabel {
			return useUiStore().slotInFocus;
		},

		_variation(index: number): VariationState | undefined {
			return useSlotsStore().slots[this._slot()].variations?.[index];
		},

		_modules(): M.MutaModules {
			const patch = useSlotsStore().slots[this._slot()].patch;
			const ui = useUiStore();
			// "Selected": modules left out of the table are never changed
			const included = (area: 0 | 1, index: number) =>
				!this.current.selectedOnly || (ui.selectedModulesArea === (area === 0 ? 'fx' : 'va') && ui.selectedModules.includes(index));
			const table = (area: 0 | 1) =>
				Object.fromEntries(
					(patch?.areas[area]?.modules ?? [])
						.filter((m) => included(area, m.index))
						.map((m) => [m.index, { type: m.type, locked: m.mutaLock === 1 }]),
				);
			return { fx: table(0), voice: table(1) };
		},

		genomeAt(ref: BoxRef): M.Genome | null {
			const s = this.current;
			if (ref.kind === 'variation') {
				const v = this._variation(ref.index);
				return v ? M.genomeFromVariation(v) : null;
			}
			if (ref.kind === 'mother') return s.mother;
			if (ref.kind === 'father') return s.father;
			return (ref.kind === 'child' ? s.children : s.storage)[ref.index] ?? null;
		},

		_setBox(s: Boxes, ref: BoxRef, g: M.Genome | null): void {
			const raw = g && markRaw(g);
			if (ref.kind === 'mother') s.mother = raw;
			else if (ref.kind === 'father') s.father = raw;
			else if (ref.kind === 'child') s.children[ref.index] = raw;
			else if (ref.kind === 'storage') s.storage[ref.index] = raw;
		},

		// Knob edits made while a box is auditioned land in MUTATOR_VARIATION; fold them back into
		// the box (official CMutaSynthData writes each edit into the focused individual).
		_syncFocused(): void {
			const ref = this.focus;
			const live = this._variation(MUTATOR_VARIATION);
			const g = ref && this.genomeAt(ref);
			if (!ref || !live || !g) return;
			const was = M.variationFromGenome(g);
			const synced = M.genomeFromVariation(live);
			let changed = JSON.stringify(was.patch) !== JSON.stringify(live.patch);
			for (const area of ['fx', 'voice'] as const)
				for (const [idx, vals] of Object.entries(synced[area]))
					vals.forEach((v, p) => {
						const old = g[area][Number(idx)]?.[p];
						if (old !== undefined && Math.floor(old) === Math.floor(v))
							vals[p] = old; // keep the unrounded value
						else changed = true;
					});
			if (changed) this._setBox(this.current, ref, synced);
		},

		_focusedGenome(): M.Genome | null {
			this._syncFocused();
			const ref = this.focus;
			if (ref) return this.genomeAt(ref);
			const v = this._variation(useUiStore().variation);
			return v ? M.genomeFromVariation(v) : null;
		},

		_state(slot: SlotLabel): StepState {
			const live = useSlotsStore().slots[slot].variations?.[MUTATOR_VARIATION];
			return { boxes: snapshot(this.slots[slot]), variation: useUiStore().variation, live: live && deepCloneVariationState(live) };
		},

		async _restore(slot: SlotLabel, st: StepState): Promise<void> {
			Object.assign(this.slots[slot], snapshot(st.boxes));
			const slots = useSlotsStore();
			const live = slots.slots[slot].variations?.[MUTATOR_VARIATION];
			if (st.live && JSON.stringify(live) !== JSON.stringify(st.live)) await slots._writeVariationState(slot, MUTATOR_VARIATION, st.live, 'mutator undo');
			if (this._slot() === slot) await slots.activateVariation(st.variation);
		},

		// Runs `action` as one undoable step. Param edits made afterwards get their own entries (no
		// coalescing across the step), so undo never moves an edit from one box to another.
		async _step(action: (slot: SlotLabel) => Promise<void>): Promise<void> {
			const slot = this._slot();
			const hist = useHistoryStore();
			const before = this._state(slot);
			await action(slot);
			if (hist.isLocked(slot)) return;
			const after = this._state(slot);
			hist.clearCoalescing(slot);
			hist.record(slot, { undo: () => this._restore(slot, before), redo: () => this._restore(slot, after) });
		},

		// Applies `change` to the boxes as one undoable step, then focuses `focusAfter`.
		async _commit(change: (s: Boxes) => void, focusAfter?: BoxRef): Promise<void> {
			await this._step(async (slot) => {
				const s = this.slots[slot];
				change(s);
				if (focusAfter) {
					s.focus = focusAfter;
					await this._audition(slot, focusAfter);
				}
			});
		},

		async _audition(slot: SlotLabel, ref: BoxRef): Promise<void> {
			const g = this.genomeAt(ref);
			if (!g) return;
			const slots = useSlotsStore();
			await slots._writeVariationState(slot, MUTATOR_VARIATION, M.variationFromGenome(g), 'mutator audition');
			await slots.activateVariation(MUTATOR_VARIATION);
			// A new sound has the focus: re-centre the Patch Adjuster on it (official SetFocus → ResetUntouchedData).
			usePatchAdjusterStore().commit();
		},

		// Focusing a box or a variation is an undo step, like in the official editor (box:
		// CMutaSynthData::GetFocusIndividMolecules; variation: CPatch::InternalSetFocusedParamSetting).
		async focusBox(ref: BoxRef): Promise<void> {
			this._syncFocused();
			if (ref.kind === 'variation' ? this.focus === null && useUiStore().variation === ref.index : sameRef(this.focus, ref)) return;
			if (ref.kind !== 'variation' && !this.genomeAt(ref)) return;
			await this._step(async (slot) => {
				if (ref.kind === 'variation') {
					this.slots[slot].focus = null;
					await useSlotsStore().activateVariation(ref.index);
				} else {
					this.slots[slot].focus = ref;
					await this._audition(slot, ref);
				}
			});
		},

		// Keys 1-8: 1 = Mother, 2-7 = children, 8 = Father.
		async focusNumber(n: number): Promise<void> {
			await this.focusBox(n === 1 ? { kind: 'mother', index: 0 } : n === 8 ? { kind: 'father', index: 0 } : { kind: 'child', index: n - 2 });
		},

		// Mutate: `from` (if given) becomes the Mother; six children are mutated from the Mother.
		async mutate(from?: BoxRef): Promise<void> {
			this._syncFocused();
			const src = from ? this.genomeAt(from) : this.current.mother;
			if (!src || this.noSelection) return;
			const { prob, range, lockMask, soloMask } = this.current;
			const modules = this._modules();
			await this._commit(
				(s) => {
					if (from) this._setBox(s, { kind: 'mother', index: 0 }, src);
					s.children = s.children.map(() => markRaw(M.mutate(src, modules, prob, range, lockMask, soloMask, Math.random)));
					s.coupled = false;
				},
				{ kind: 'child', index: 0 },
			);
		},

		// Randomize: locked/excluded params are taken from the focused sound.
		async randomize(): Promise<void> {
			const src = this._focusedGenome();
			if (!src || this.noSelection) return;
			const { lockMask, soloMask } = this.current;
			const modules = this._modules();
			await this._commit(
				(s) => {
					s.children = s.children.map(() => markRaw(M.randomize(src, modules, lockMask, soloMask, Math.random)));
					s.coupled = false;
				},
				{ kind: 'child', index: 0 },
			);
		},

		// Interpolate / Cross: `a`/`b` (if given) first become Mother and Father.
		async breed(op: 'interpolate' | 'cross', a?: BoxRef, b?: BoxRef): Promise<void> {
			this._syncFocused();
			const mother = a ? this.genomeAt(a) : this.current.mother;
			const father = b ? this.genomeAt(b) : this.current.father;
			if (!mother || !father) return;
			const cross = this.current.cross;
			await this._commit(
				(s) => {
					this._setBox(s, { kind: 'mother', index: 0 }, mother);
					this._setBox(s, { kind: 'father', index: 0 }, father);
					s.children = s.children.map((_, i) =>
						markRaw(op === 'interpolate' ? M.interpolate(mother, father, (i + 1) / 7) : M.cross(mother, father, cross, Math.random)),
					);
					s.coupled = true;
				},
				{ kind: 'child', index: 0 },
			);
		},

		// Drag-drop copy. Storage → storage moves; a drop on a variation overwrites that variation.
		async copy(from: BoxRef, to: BoxRef): Promise<void> {
			if (sameRef(from, to) || to.kind === 'child') return;
			this._syncFocused();
			const g = this.genomeAt(from);
			if (!g) return;
			if (to.kind === 'variation') {
				await useSlotsStore().applyVariationState(this._slot(), to.index, M.variationFromGenome(g));
				return;
			}
			await this._commit((s) => {
				this._setBox(s, to, g);
				if (from.kind === 'storage' && to.kind === 'storage') this._setBox(s, from, null);
			}, to);
		},

		// "S": the focused sound into the first empty storage box.
		async storeFocused(): Promise<void> {
			const g = this._focusedGenome();
			const free = this.current.storage.indexOf(null);
			if (!g || free < 0) return;
			await this._commit((s) => this._setBox(s, { kind: 'storage', index: free }, g));
		},

		// Copies the focused sound to Mother ("O") or Father ("T").
		async assignParent(kind: 'mother' | 'father'): Promise<void> {
			const g = this._focusedGenome();
			if (g) await this._commit((s) => this._setBox(s, { kind, index: 0 }, g));
		},

		async clearStorage(indices: number[]): Promise<void> {
			const s = this.current;
			if (indices.every((i) => !s.storage[i])) return;
			await this._commit((b) => {
				for (const i of indices) b.storage[i] = null;
				if (b.focus?.kind === 'storage' && indices.includes(b.focus.index)) b.focus = null;
			});
		},

		// "v": a storage row into variations 1-8 (empty boxes skipped), as one undo step.
		async rowToVariations(row: number): Promise<void> {
			const slot = this._slot();
			const slots = useSlotsStore();
			const hist = useHistoryStore();
			const writes = this.current.storage
				.slice(row * STORAGE_COLS, (row + 1) * STORAGE_COLS)
				.map((g, v) => ({ v, state: g && M.variationFromGenome(g) }))
				.filter((w): w is { v: number; state: VariationState } => w.state !== null);
			if (writes.length === 0) return;
			// _writeVariationState replaces (never mutates) the stored state, so the current objects are a safe snapshot
			const prev = writes.map(({ v }) => ({ v, state: toRaw(slots.slots[slot].variations![v]) }));
			const apply = async (list: { v: number; state: VariationState }[], label: string) => {
				for (const { v, state } of list) await slots._writeVariationState(slot, v, state, label);
			};
			if (!hist.isLocked(slot)) hist.record(slot, { undo: () => apply(prev, 'rowToVariations undo'), redo: () => apply(writes, 'rowToVariations redo') });
			await apply(writes, 'rowToVariations');
		},

		setProb(p: number): void {
			const s = this.current;
			s.prob = p;
			if (s.link) s.range = M.linkedRange(p);
		},
		setRange(r: number): void {
			const s = this.current;
			s.range = r;
			if (s.link) s.prob = M.linkedProb(r);
		},
		setCross(c: number): void {
			this.current.cross = c;
		},
		toggleLink(): void {
			const s = this.current;
			s.link = !s.link;
			if (s.link) s.range = M.linkedRange(s.prob);
		},
		// A lit Quick Lock clears the "mutable" bit; ignored while a Solo is active (official 206870).
		toggleLock(bit: number): void {
			const s = this.current;
			if (s.soloMask === 0) s.lockMask ^= bit;
		},
		toggleSolo(bit: number): void {
			this.current.soloMask ^= bit;
		},
		toggleSelectedOnly(): void {
			this.current.selectedOnly = !this.current.selectedOnly;
		},
	},
});
