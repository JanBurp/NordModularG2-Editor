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

	const lastLedData = ref<{ slot: SlotLabel; data: number[] } | null>(null);

	const slotsStore = useSlotsStore();

	function buildLedListFromPatch(patch: Patch): void {
		fxLedStates.value.clear();
		vaLedStates.value.clear();

		const newFxList: LedEntry[] = [];
		const newVaList: LedEntry[] = [];

		for (const [areaIdx, areaName] of [
			[0, 'fx'] as const,
			[1, 'va'] as const,
		]) {
			const area = patch.areas[areaIdx];
			for (const mod of area.modules) {
				const modDef = getModule(mod.type);
				if (!modDef) continue;

				for (const ve of modDef.ve || []) {
					if (ve.type === 'led') {
						const entry: LedEntry = {
							moduleIndex: mod.index,
							groupId: 0,
							area: areaName,
						};
						if (areaName === 'fx') {
							newFxList.push(entry);
						} else {
							newVaList.push(entry);
						}
					} else if (ve.type === 'ledArray') {
						const cnt = Number(ve.cnt) || 1;
						for (let g = 0; g < cnt; g++) {
							const entry: LedEntry = {
								moduleIndex: mod.index,
								groupId: g,
								area: areaName,
							};
							if (areaName === 'fx') {
								newFxList.push(entry);
							} else {
								newVaList.push(entry);
							}
						}
					}
				}
			}
		}

		fxLedList.value = newFxList;
		vaLedList.value = newVaList;
	}

	function parseLedData(slot: SlotLabel, data: number[]): void {
		lastLedData.value = { slot, data };

		if (data.length < 2) return;

		let fxIdx = 0;
		let vaIdx = 0;

		for (let i = 1; i < data.length; i++) {
			const byte = data[i];

			for (let bits = 0; bits < 4; bits++) {
				const shift = 6 - bits * 2;
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

	function getLedState(area: 'fx' | 'va', moduleIndex: number, groupId: number): boolean {
		const key = `${moduleIndex}-${groupId}`;
		if (area === 'fx') {
			return fxLedStates.value.get(key) ?? false;
		}
		return vaLedStates.value.get(key) ?? false;
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
		getLedState,
	};
});