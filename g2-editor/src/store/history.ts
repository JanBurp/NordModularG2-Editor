import { defineStore } from 'pinia';
import type { SlotLabel } from '@/types';

export interface HistoryEntry {
	undo: () => Promise<void>;
	redo: () => Promise<void>;
}

interface CoalesceState {
	entry: HistoryEntry;
	box: { initial: number; latest: number };
	timer: ReturnType<typeof setTimeout> | null;
}

interface SlotHistory {
	past: HistoryEntry[];
	future: HistoryEntry[];
	locked: boolean;
	coalescing: Map<string, CoalesceState>;
}

const MAX_HISTORY = 50;
const COALESCE_MS = 1000;

function makeSlotHistory(): SlotHistory {
	return { past: [], future: [], locked: false, coalescing: new Map() };
}

export const useHistoryStore = defineStore('history', {
	state: () => ({
		slots: {
			A: makeSlotHistory(),
			B: makeSlotHistory(),
			C: makeSlotHistory(),
			D: makeSlotHistory(),
		} as Record<SlotLabel, SlotHistory>,
	}),

	actions: {
		isLocked(slot: SlotLabel): boolean {
			return this.slots[slot].locked;
		},

		lock(slot: SlotLabel): void {
			this.slots[slot].locked = true;
		},

		unlock(slot: SlotLabel): void {
			this.slots[slot].locked = false;
		},

		record(slot: SlotLabel, entry: HistoryEntry, coalesceKey?: string, box?: { initial: number; latest: number }): void {
			const h = this.slots[slot];
			if (coalesceKey) {
				const existing = h.coalescing.get(coalesceKey);
				if (existing) {
					if (box !== undefined) existing.box.latest = box.latest;
					if (existing.timer !== null) clearTimeout(existing.timer);
					existing.timer = setTimeout(() => h.coalescing.delete(coalesceKey), COALESCE_MS);
					return;
				}
				h.coalescing.set(coalesceKey, {
					entry,
					box: box ?? { initial: 0, latest: 0 },
					timer: setTimeout(() => h.coalescing.delete(coalesceKey), COALESCE_MS),
				});
			}
			h.future = [];
			h.past = [...h.past.slice(-(MAX_HISTORY - 1)), entry];
		},

		popUndo(slot: SlotLabel): HistoryEntry | null {
			const h = this.slots[slot];
			if (!h.past.length) return null;
			const entry = h.past[h.past.length - 1];
			h.past = h.past.slice(0, -1);
			h.future = [entry, ...h.future];
			return entry;
		},

		popRedo(slot: SlotLabel): HistoryEntry | null {
			const h = this.slots[slot];
			if (!h.future.length) return null;
			const entry = h.future[0];
			h.future = h.future.slice(1);
			h.past = [...h.past, entry];
			return entry;
		},

		restoreUndo(slot: SlotLabel, entry: HistoryEntry): void {
			const h = this.slots[slot];
			// popUndo moved entry from past[-1] to future[0]; reverse that
			if (h.future[0] === entry) h.future = h.future.slice(1);
			h.past = [...h.past, entry];
		},

		restoreRedo(slot: SlotLabel, entry: HistoryEntry): void {
			const h = this.slots[slot];
			// popRedo moved entry from future[0] to past[-1]; reverse that
			if (h.past[h.past.length - 1] === entry) h.past = h.past.slice(0, -1);
			h.future = [entry, ...h.future];
		},

		clearHistory(slot: SlotLabel): void {
			const h = this.slots[slot];
			for (const state of h.coalescing.values()) {
				if (state.timer !== null) clearTimeout(state.timer);
			}
			this.slots[slot] = makeSlotHistory();
		},

		canUndo(slot: SlotLabel): boolean {
			return this.slots[slot].past.length > 0;
		},

		canRedo(slot: SlotLabel): boolean {
			return this.slots[slot].future.length > 0;
		},
	},
});
