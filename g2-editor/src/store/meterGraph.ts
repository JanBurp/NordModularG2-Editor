// Meter Graph: level meters picked by the user (canvas meter or Parameter Page meter), each
// recorded over time from the live volume_data stream and plotted by MeterGraph.vue.
import { defineStore } from 'pinia';
import { ref, markRaw, watch } from 'vue';
import { useSlotsStore } from '@/store/slots';
import { useLedStore } from '@/store/led';
import { useSettingsStore } from '@/store/settings';
import { getModule } from '@/renderer/nmg2mods';
import { vuStripKey } from '@/utils/vuLevel';
import { formatMeterLine, parseMeterLine, withMeterLine } from '@/utils/meterGraphNotes';
import { showToast } from '@/composables/useToast';
import { SLOT_LABELS } from '@/constants';
import type { ContextMenuItem, SlotLabel } from '@/types';

// Same tuple a Parameter Page meter assignment uses (isLed=1, paramIndex = ledNo).
export interface MeterId {
	slot: SlotLabel;
	location: 0 | 1;
	moduleIndex: number;
	ledNo: number;
}

export interface Trace extends MeterId {
	id: string;
	color: string;
	hidden: boolean; // temporarily not drawn (still recorded)
}

// Ring buffer of (time ms, raw level 0..127 / 255 = off) samples. Not reactive: the graph polls it per frame.
export interface SampleBuffer {
	t: Float64Array;
	v: Uint8Array;
	head: number; // next write index
	count: number;
}

export const WINDOW_OPTIONS = [10, 30, 60, 300] as const;
export type WindowSec = (typeof WINDOW_OPTIONS)[number];
export const BUFFER_CAPACITY = 20000; // 5 min at up to ~65 samples/s

// Distinct from the meter zones' green/yellow/red
const COLORS = ['#4fc3f7', '#ff9800', '#e040fb', '#ffffff', '#ff5252', '#69f0ae', '#ffd740', '#7c4dff'];

export const meterKey = (m: MeterId): string => `${m.slot}-${m.location}-${m.moduleIndex}-${m.ledNo}`;

export const useMeterGraphStore = defineStore('meterGraph', () => {
	const slotsStore = useSlotsStore();
	const ledStore = useLedStore();
	const settingsStore = useSettingsStore();

	const traces = ref<Trace[]>([]);
	const paused = ref(false);
	const windowSec = ref<WindowSec>(10);
	const buffers = markRaw(new Map<string, SampleBuffer>());

	function findModule(m: MeterId) {
		return slotsStore.slots[m.slot].patch?.areas[m.location]?.modules.find((mod) => mod.index === m.moduleIndex);
	}

	// led store key of the meter, or null once its module/meter is gone
	function stripKey(m: MeterId): string | null {
		const mod = findModule(m);
		return mod ? vuStripKey(getModule(mod.type), m.ledNo) : null;
	}

	function label(m: MeterId): string {
		const mod = findModule(m);
		const name = mod ? mod.uname || getModule(mod.type)?.short || String(m.moduleIndex) : String(m.moduleIndex);
		return `${m.slot}: ${name} Meter ${m.ledNo + 1}`;
	}

	function has(m: MeterId): boolean {
		return traces.value.some((t) => t.id === meterKey(m));
	}

	function remove(m: MeterId) {
		const id = meterKey(m);
		traces.value = traces.value.filter((t) => t.id !== id);
		buffers.delete(id);
	}

	// open: show the panel (a user action); a restore from the patch notes leaves it as it is
	function add(m: MeterId, open = true, hidden = false) {
		const id = meterKey(m);
		if (has(m)) return;
		const used = new Set(traces.value.map((t) => t.color));
		const color = COLORS.find((c) => !used.has(c)) ?? COLORS[traces.value.length % COLORS.length];
		traces.value = [...traces.value, { slot: m.slot, location: m.location, moduleIndex: m.moduleIndex, ledNo: m.ledNo, id, color, hidden }];
		buffers.set(id, { t: new Float64Array(BUFFER_CAPACITY), v: new Uint8Array(BUFFER_CAPACITY), head: 0, count: 0 });
		if (open) settingsStore.showMeterGraph = true;
	}

	function toggle(m: MeterId) {
		if (has(m)) remove(m);
		else add(m);
	}

	function addAll(meters: MeterId[]) {
		meters.forEach((m) => add(m));
	}

	function toggleHidden(m: MeterId) {
		const id = meterKey(m);
		traces.value = traces.value.map((t) => (t.id === id ? { ...t, hidden: !t.hidden } : t));
	}

	function clear() {
		for (const b of buffers.values()) {
			b.head = 0;
			b.count = 0;
		}
	}

	// Called for every volume_data message, after the led store parsed it.
	function record(slot: SlotLabel, now: number) {
		if (paused.value) return;
		for (const tr of traces.value) {
			if (tr.slot !== slot) continue;
			const key = stripKey(tr);
			const b = buffers.get(tr.id);
			if (!key || !b) continue;
			b.t[b.head] = now;
			b.v[b.head] = ledStore.getStripValue(tr.location === 1 ? 'va' : 'fx', tr.moduleIndex, key, slot);
			b.head = (b.head + 1) % BUFFER_CAPACITY;
			b.count = Math.min(b.count + 1, BUFFER_CAPACITY);
		}
	}

	// Drop traces whose module or meter no longer exists (deleted, replaced, other patch loaded)
	watch(
		() => traces.value.filter((t) => !stripKey(t)),
		(gone) => gone.forEach(remove),
	);

	// Patch notes sync: each slot's meters are kept as a tag line in that patch's notes
	// (meterGraphNotes.ts), so they are saved with the patch, in files and on the G2.
	const lineOf = (slot: SlotLabel) => formatMeterLine(traces.value.filter((t) => t.slot === slot));
	const warnedFull = new Set<SlotLabel>();

	function writeLine(slot: SlotLabel) {
		if (slotsStore.setMeterGraphLine(slot, lineOf(slot))) warnedFull.delete(slot);
		else if (!warnedFull.has(slot)) {
			warnedFull.add(slot);
			showToast(`Slot ${slot}: Meter Graph not saved in patch notes: notes are full`);
		}
	}

	// Graph -> notes, whenever a slot's meters change (no-op when the tag is already right)
	watch(
		() => SLOT_LABELS.map(lineOf),
		(lines, prev) => SLOT_LABELS.forEach((s, i) => lines[i] !== prev[i] && writeLine(s)),
	);

	// Notes -> graph, when a slot gets a new patch object (file, G2, performance, reload).
	const loadedNames: Partial<Record<SlotLabel, string>> = {};
	function onPatchLoaded(slot: SlotLabel, prevText: string | undefined) {
		const entry = slotsStore.slots[slot];
		const text = entry.patch?.text ?? '';
		const sameName = loadedNames[slot] === entry.name;
		loadedNames[slot] = entry.name;
		const saved = parseMeterLine(text);
		// The same patch back from the G2 without our tag (its notes weren't uploaded yet): keep the
		// meters and put the tag back. Anything else is another patch: its own tag, or no meters.
		if (!saved && prevText !== undefined && sameName && withMeterLine(prevText, '').text === text) {
			writeLine(slot);
			return;
		}
		traces.value.filter((t) => t.slot === slot).forEach(remove);
		for (const m of saved ?? []) add({ slot, location: m.location, moduleIndex: m.moduleIndex, ledNo: m.ledNo }, false, m.hidden);
	}

	watch(
		() => SLOT_LABELS.map((s) => slotsStore.slots[s].patch),
		(patches, prev) =>
			SLOT_LABELS.forEach((s, i) => {
				if (patches[i] && patches[i] !== prev?.[i]) onPatchLoaded(s, prev?.[i]?.text ?? (prev?.[i] ? '' : undefined));
			}),
		{ immediate: true },
	);

	function menuItem(m: MeterId): ContextMenuItem {
		return { label: has(m) ? 'Remove from Meter Graph' : 'Show in Meter Graph', action: () => toggle(m) };
	}

	return { traces, paused, windowSec, buffers, label, has, add, addAll, remove, toggle, toggleHidden, clear, record, menuItem };
});
