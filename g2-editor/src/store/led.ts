import { defineStore } from 'pinia';
import { ref, reactive, watch } from 'vue';
import type { Patch } from '@/types';
import type { SlotLabel } from '@/store/slots';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { getModule } from '@/renderer/nmg2mods';

export interface LedEntry {
	area: 'fx' | 'va';
	moduleIndex: number;
	// Per-type visual-element key, matching Module.vue (e.g. 'led-0', 'ledArray-0', 'vu-0', 'ledGroup-0').
	key: string;
}

const stateKey = (e: LedEntry): string => `${e.area}-${e.moduleIndex}-${e.key}`;

// Pure parsers, ordered exactly as the hardware streams the bytes (see buildLedListForSlot).

// led_data (0x39): one leading byte, then 2 bits per single LED, 4 LEDs per byte. on = value 1.
export function parseLedBytes(ledList: LedEntry[], data: number[]): Map<string, boolean> {
	const result = new Map<string, boolean>();
	if (data.length < 2) return result;
	let idx = 0;
	for (let i = 1; i < data.length && idx < ledList.length; i++) {
		const byte = data[i];
		for (let bits = 0; bits < 4 && idx < ledList.length; bits++) {
			const value = (byte >> (bits * 2)) & 0x03;
			result.set(stateKey(ledList[idx++]), value === 1);
		}
	}
	return result;
}

// volume_data (0x3A): pairs of [unknown, value] bytes, one pair per strip entry.
// Value = active step index for sequencers (0..cnt-1), or level for VU meters.
export function parseVolumeBytes(stripList: LedEntry[], data: number[]): Map<string, number> {
	const result = new Map<string, number>();
	let idx = 0;
	for (let i = 0; i + 1 < data.length && idx < stripList.length; i += 2) {
		result.set(stateKey(stripList[idx++]), data[i + 1]);
	}
	return result;
}

type SlotLedData = {
	ledList: LedEntry[];
	stripList: LedEntry[];
	ledStates: Map<string, boolean>;
	stripValues: Map<string, number>;
};

function makeSlotData(): SlotLedData {
	return {
		ledList: [],
		stripList: [],
		ledStates: new Map(),
		stripValues: new Map(),
	};
}

export const useLedStore = defineStore('led', () => {
	const slotData = reactive<Record<SlotLabel, SlotLedData>>({
		A: makeSlotData(),
		B: makeSlotData(),
		C: makeSlotData(),
		D: makeSlotData(),
	});

	const lastLedData = ref<{ slot: SlotLabel; data: number[] } | null>(null);

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	// Build the ordered LED lists for a slot, mirroring the hardware byte order:
	// area VA (areas[1]) before FX (areas[0]), modules by index ascending, then visual-element order.
	function buildLedListForSlot(slot: SlotLabel, patch: Patch): void {
		const d = slotData[slot];

		const ledList: LedEntry[] = [];
		const stripList: LedEntry[] = [];

		for (const [areaIdx, areaName] of [[1, 'va'] as const, [0, 'fx'] as const]) {
			const area = patch.areas[areaIdx];
			if (!area) continue;
			const sortedMods = [...area.modules].sort((a, b) => a.index - b.index);
			for (const mod of sortedMods) {
				const modDef = getModule(mod.type);
				if (!modDef) continue;

				const ves = modDef.ve || [];
				// In sequencer modules the lone `led` is the Park LED, which the hardware groups with the step
				// `ledArray` (one strip entry) rather than streaming it as a single `led_data` LED. So a single
				// `led` only counts in led_data when the module has no step array. (Sequencers are the only
				// module class with both a `led` and a `ledArray`.)
				const hasStepArray = ves.some((v: any) => v.type === 'ledArray');

				let ledIdx = 0;
				let ledArrayIdx = 0;
				let vuIdx = 0;
				let ledGroupIdx = 0;
				for (const ve of ves) {
					if (ve.type === 'led') {
						if (!hasStepArray) ledList.push({ area: areaName, moduleIndex: mod.index, key: `led-${ledIdx++}` });
					} else if (ve.type === 'ledArray') {
						stripList.push({ area: areaName, moduleIndex: mod.index, key: `ledArray-${ledArrayIdx++}` });
					} else if (ve.type === 'vu') {
						stripList.push({ area: areaName, moduleIndex: mod.index, key: `vu-${vuIdx++}` });
					} else if (ve.type === 'ledGroup') {
						stripList.push({ area: areaName, moduleIndex: mod.index, key: `ledGroup-${ledGroupIdx++}` });
					}
				}
			}
		}

		d.ledList = ledList;
		d.stripList = stripList;
		d.ledStates = new Map();
		d.stripValues = new Map();
	}

	function parseLedData(slot: SlotLabel, data: number[]): void {
		lastLedData.value = { slot, data };
		slotData[slot].ledStates = parseLedBytes(slotData[slot].ledList, data);
	}

	function parseVolumeData(slot: SlotLabel, data: number[]): void {
		slotData[slot].stripValues = parseVolumeBytes(slotData[slot].stripList, data);
	}

	function getLedState(area: 'fx' | 'va', moduleIndex: number, key: string): boolean {
		return slotData[uiStore.slotInFocus].ledStates.get(`${area}-${moduleIndex}-${key}`) ?? false;
	}

	function getStripValue(area: 'fx' | 'va', moduleIndex: number, key: string): number {
		return slotData[uiStore.slotInFocus].stripValues.get(`${area}-${moduleIndex}-${key}`) ?? 255;
	}

	for (const slotLabel of ['A', 'B', 'C', 'D'] as SlotLabel[]) {
		watch(
			[
				() => slotsStore.slots[slotLabel].patch,
				() => slotsStore.slots[slotLabel].loading,
				() => slotsStore.slots[slotLabel].patch?.areas?.[0]?.modules,
				() => slotsStore.slots[slotLabel].patch?.areas?.[1]?.modules,
			],
			([patch, loading]) => {
				if (patch && !loading) buildLedListForSlot(slotLabel, patch as Patch);
			},
			{ immediate: true },
		);
	}

	return {
		parseLedData,
		parseVolumeData,
		getLedState,
		getStripValue,
	};
});
