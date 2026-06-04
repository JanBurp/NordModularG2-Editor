import { defineStore } from 'pinia';
import { ref, reactive, watch } from 'vue';
import type { Patch } from '@/types';
import type { SlotLabel } from '@/store/slots';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { getModule } from '@/renderer/nmg2mods';

export interface LedEntry {
	moduleIndex: number;
	groupId: number;
	area: 'fx' | 'va';
}

type SlotLedData = {
	fxLedList: LedEntry[];
	vaLedList: LedEntry[];
	fxLedStates: Map<string, boolean>;
	vaLedStates: Map<string, boolean>;
	fxStripList: LedEntry[];
	vaStripList: LedEntry[];
	fxStripValues: Map<string, number>;
	vaStripValues: Map<string, number>;
};

function makeSlotData(): SlotLedData {
	return {
		fxLedList: [],
		vaLedList: [],
		fxLedStates: new Map(),
		vaLedStates: new Map(),
		fxStripList: [],
		vaStripList: [],
		fxStripValues: new Map(),
		vaStripValues: new Map(),
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

	function buildLedListForSlot(slot: SlotLabel, patch: Patch): void {
		const d = slotData[slot];
		d.fxLedStates.clear();
		d.vaLedStates.clear();
		d.fxStripValues.clear();
		d.vaStripValues.clear();

		const newFxList: LedEntry[] = [];
		const newVaList: LedEntry[] = [];
		const newFxStripList: LedEntry[] = [];
		const newVaStripList: LedEntry[] = [];

		for (const [areaIdx, areaName] of [[0, 'fx'] as const, [1, 'va'] as const]) {
			const area = patch.areas[areaIdx];
			const sortedMods = [...area.modules].sort((a, b) => a.index - b.index);
			for (const mod of sortedMods) {
				const modDef = getModule(mod.type);
				if (!modDef) continue;

				const ves = modDef.ve || [];
				const hasStrip = ves.some((v: any) => v.type === 'ledArray' || v.type === 'vu' || v.type === 'ledGroup');
				const ledList = areaName === 'fx' ? newFxList : newVaList;
				const stripList = areaName === 'fx' ? newFxStripList : newVaStripList;

				if (hasStrip) {
					let stripGroupId = 0;
					for (const ve of ves) {
						if (ve.type === 'ledArray' || ve.type === 'vu' || ve.type === 'ledGroup') {
							stripList.push({ moduleIndex: mod.index, groupId: stripGroupId++, area: areaName });
						}
					}
				} else {
					let ledGroupId = 0;
					for (const ve of ves) {
						if (ve.type === 'led') {
							ledList.push({ moduleIndex: mod.index, groupId: ledGroupId++, area: areaName });
						}
					}
				}
			}
		}

		d.fxLedList = newFxList;
		d.vaLedList = newVaList;
		d.fxStripList = newFxStripList;
		d.vaStripList = newVaStripList;
	}

	function parseLedData(slot: SlotLabel, data: number[]): void {
		lastLedData.value = { slot, data };

		if (data.length < 2) return;

		const d = slotData[slot];
		let fxIdx = 0;
		let vaIdx = 0;

		for (let i = 1; i < data.length; i++) {
			const byte = data[i];

			for (let bits = 0; bits < 4; bits++) {
				const shift = bits * 2;
				const value = (byte >> shift) & 0x03;
				const on = value === 1;

				let key: string;
				let statesMap: Map<string, boolean>;

				if (fxIdx < d.fxLedList.length) {
					const entry = d.fxLedList[fxIdx];
					key = `${entry.moduleIndex}-${entry.groupId}`;
					statesMap = d.fxLedStates;
					fxIdx++;
				} else if (vaIdx < d.vaLedList.length) {
					const entry = d.vaLedList[vaIdx];
					key = `${entry.moduleIndex}-${entry.groupId}`;
					statesMap = d.vaLedStates;
					vaIdx++;
				} else {
					continue;
				}

				statesMap.set(key, on);
			}
		}
	}

	// Volume data (0x3A): pairs of [unknown, value] bytes, FX strip list then VA strip list.
	// Value = active step index for sequencers (0..cnt-1), or level for VU meters.
	function parseVolumeData(slot: SlotLabel, data: number[]): void {
		const d = slotData[slot];
		let fxIdx = 0;
		let vaIdx = 0;

		for (let i = 0; i + 1 < data.length; i += 2) {
			const value = data[i + 1];

			let key: string;
			let valuesMap: Map<string, number>;

			if (fxIdx < d.fxStripList.length) {
				const entry = d.fxStripList[fxIdx];
				key = `${entry.moduleIndex}-${entry.groupId}`;
				valuesMap = d.fxStripValues;
				fxIdx++;
			} else if (vaIdx < d.vaStripList.length) {
				const entry = d.vaStripList[vaIdx];
				key = `${entry.moduleIndex}-${entry.groupId}`;
				valuesMap = d.vaStripValues;
				vaIdx++;
			} else {
				break;
			}

			valuesMap.set(key, value);
		}
	}

	function getLedState(area: 'fx' | 'va', moduleIndex: number, groupId: number): boolean {
		const key = `${moduleIndex}-${groupId}`;
		const d = slotData[uiStore.slotInFocus];
		return (area === 'fx' ? d.fxLedStates : d.vaLedStates).get(key) ?? false;
	}

	function getStripValue(area: 'fx' | 'va', moduleIndex: number, groupId: number): number {
		const key = `${moduleIndex}-${groupId}`;
		const d = slotData[uiStore.slotInFocus];
		return (area === 'fx' ? d.fxStripValues : d.vaStripValues).get(key) ?? 255;
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
