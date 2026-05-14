import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { Patch } from '@/types';
import type { SlotLabel } from '@/store/slots';
import { useSlotsStore } from '@/store/slots';
import { getModule } from '@/renderer/nmg2mods';

export interface LedEntry {
	moduleIndex: number;
	groupId: number;
	area: 'fx' | 'va';
}

export const useLedStore = defineStore('led', () => {
	const fxLedList = shallowRef<LedEntry[]>([]);
	const vaLedList = shallowRef<LedEntry[]>([]);

	const fxLedStates = ref<Map<string, boolean>>(new Map());
	const vaLedStates = ref<Map<string, boolean>>(new Map());

	// Strip list (volume_data 0x3A): modules with ledArray VEs, one entry per ledArray VE
	const fxStripList = shallowRef<LedEntry[]>([]);
	const vaStripList = shallowRef<LedEntry[]>([]);
	// Strip values: step index (0..cnt-1) sent by G2 per strip entry
	const fxStripValues = ref<Map<string, number>>(new Map());
	const vaStripValues = ref<Map<string, number>>(new Map());

	const lastLedData = ref<{ slot: SlotLabel; data: number[] } | null>(null);

	const slotsStore = useSlotsStore();

	function buildLedListFromPatch(patch: Patch): void {
		fxLedStates.value.clear();
		vaLedStates.value.clear();
		fxStripValues.value.clear();
		vaStripValues.value.clear();

		const newFxList: LedEntry[] = [];
		const newVaList: LedEntry[] = [];
		const newFxStripList: LedEntry[] = [];
		const newVaStripList: LedEntry[] = [];

		for (const [areaIdx, areaName] of [
			[0, 'fx'] as const,
			[1, 'va'] as const,
		]) {
			const area = patch.areas[areaIdx];
			const sortedMods = [...area.modules].sort((a, b) => a.index - b.index);
			for (const mod of sortedMods) {
				const modDef = getModule(mod.type);
				if (!modDef) continue;

				const ves = modDef.ve || [];
				// Modules with ledArray VEs belong entirely to volume_data (0x3A)
				const hasLedArray = ves.some((v: any) => v.type === 'ledArray');
				const ledList = areaName === 'fx' ? newFxList : newVaList;
				const stripList = areaName === 'fx' ? newFxStripList : newVaStripList;

				if (hasLedArray) {
					let stripGroupId = 0;
					for (const ve of ves) {
						if (ve.type === 'ledArray') {
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

		fxLedList.value = newFxList;
		vaLedList.value = newVaList;
		fxStripList.value = newFxStripList;
		vaStripList.value = newVaStripList;
	}

	function parseLedData(slot: SlotLabel, data: number[]): void {
		lastLedData.value = { slot, data };

		if (data.length < 2) return;

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

				if (fxIdx < fxLedList.value.length) {
					const entry = fxLedList.value[fxIdx];
					key = `${entry.moduleIndex}-${entry.groupId}`;
					statesMap = fxLedStates.value;
					fxIdx++;
				} else if (vaIdx < vaLedList.value.length) {
					const entry = vaLedList.value[vaIdx];
					key = `${entry.moduleIndex}-${entry.groupId}`;
					statesMap = vaLedStates.value;
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
		let fxIdx = 0;
		let vaIdx = 0;

		for (let i = 0; i + 1 < data.length; i += 2) {
			const value = data[i + 1];

			let key: string;
			let valuesMap: Map<string, number>;

			if (fxIdx < fxStripList.value.length) {
				const entry = fxStripList.value[fxIdx];
				key = `${entry.moduleIndex}-${entry.groupId}`;
				valuesMap = fxStripValues.value;
				fxIdx++;
			} else if (vaIdx < vaStripList.value.length) {
				const entry = vaStripList.value[vaIdx];
				key = `${entry.moduleIndex}-${entry.groupId}`;
				valuesMap = vaStripValues.value;
				vaIdx++;
			} else {
				break;
			}

			valuesMap.set(key, value);
		}
	}

	function getLedState(area: 'fx' | 'va', moduleIndex: number, groupId: number): boolean {
		const key = `${moduleIndex}-${groupId}`;
		if (area === 'fx') {
			return fxLedStates.value.get(key) ?? false;
		}
		return vaLedStates.value.get(key) ?? false;
	}

	function getStripValue(area: 'fx' | 'va', moduleIndex: number, groupId: number): number {
		const key = `${moduleIndex}-${groupId}`;
		if (area === 'fx') {
			return fxStripValues.value.get(key) ?? 255;
		}
		return vaStripValues.value.get(key) ?? 255;
	}

	function init(): void {
		slotsStore.$subscribe((_, state) => {
			for (const slotLabel of ['A', 'B', 'C', 'D'] as SlotLabel[]) {
				const slot = state.slots[slotLabel];
				if (slot?.patch) {
					buildLedListFromPatch(slot.patch);
					break;
				}
			}
		});
	}

	init();

	return {
		fxLedList,
		vaLedList,
		lastLedData,
		buildLedListFromPatch,
		parseLedData,
		parseVolumeData,
		getLedState,
		getStripValue,
	};
});
