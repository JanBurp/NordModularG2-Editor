<template>
	<div class="flex flex-col h-full overflow-hidden text-xs text-neutral-200 bg-neutral-900">
		<!-- Button row -->
		<div class="flex flex-wrap gap-1 p-2 border-b border-neutral-700 shrink-0">
			<button
				class="px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
				:disabled="selectedRows.size === 0"
				@click="removeSelected"
			>Remove</button>
			<button
				class="px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
				:disabled="controllers.length === 0"
				@click="removeAll"
			>Remove All</button>
			<button
				class="px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
				:disabled="assignDisabled"
				@click="assignLastCC"
				:title="assignTitle"
			>{{ assignLabel }}</button>
			<button
				class="px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
				:disabled="autoAssignDisabled"
				@click="autoAssign"
			>Auto Assign</button>
		</div>

		<!-- Table -->
		<div class="flex-1 overflow-y-auto">
			<table class="w-full border-collapse">
				<thead class="sticky top-0 bg-neutral-800 text-neutral-400">
					<tr>
						<th class="text-left px-2 py-1 font-normal border-b border-neutral-700 w-10">CC</th>
						<th class="text-left px-2 py-1 font-normal border-b border-neutral-700 w-16">Name</th>
						<th class="text-left px-2 py-1 font-normal border-b border-neutral-700 w-20">Module</th>
						<th class="text-left px-2 py-1 font-normal border-b border-neutral-700">Param</th>
					</tr>
				</thead>
				<tbody>
					<tr v-if="controllers.length === 0">
						<td colspan="4" class="text-center text-neutral-500 py-4">No CC assignments</td>
					</tr>
					<tr
						v-for="c in sortedControllers"
						:key="c.cc"
						class="cursor-pointer border-b border-neutral-800"
						:class="selectedRows.has(c.cc) ? 'bg-blue-900/50' : 'hover:bg-neutral-800'"
						draggable="true"
						@click.exact="selectRow(c.cc)"
						@click.ctrl.exact="toggleRow(c.cc)"
						@click.meta.exact="toggleRow(c.cc)"
						@click.shift.exact="shiftSelectRow(c.cc)"
						@dragstart="onRowDragStart(c, $event)"
						@dragover.prevent
						@drop="onRowDrop(c, $event)"
					>
						<td class="px-2 py-0.5">{{ c.cc }}</td>
						<td class="px-2 py-0.5 text-neutral-400">{{ ccShortName(c.cc) }}</td>
						<td class="px-2 py-0.5">{{ getModuleName(c) }}</td>
						<td class="px-2 py-0.5">{{ getParamName(c) }}</td>
					</tr>
				</tbody>
			</table>
		</div>

		<!-- Drop zone hint -->
		<div
			class="shrink-0 py-1 px-2 text-center text-neutral-500 border-t border-neutral-700 text-[10px]"
		>
			Hold F8 to show CC badges · Right-click params to assign
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed } from 'vue';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useDeviceStore } from '@/store/device';
	import { getModule } from '@/renderer/nmg2mods';
	import type { MidiCCAssignment } from '@/types';

	defineProps<{ isActive?: boolean }>();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const deviceStore = useDeviceStore();

	const selectedRows = ref<Set<number>>(new Set());
	let lastSelectedCC: number | null = null;

	const slot = computed(() => uiStore.slotInFocus);

	const controllers = computed<MidiCCAssignment[]>(() => {
		if (!slot.value) return [];
		return slotsStore.slots[slot.value].controllers;
	});

	const sortedControllers = computed(() =>
		[...controllers.value].sort((a, b) => a.cc - b.cc),
	);

	const CC_SHORT: Record<number, string> = {
		2: 'Breath', 4: 'Foot', 5: 'Port.T', 6: 'DataEnt',
		8: 'Balance', 10: 'Pan', 12: 'FX1', 13: 'FX2',
		65: 'Portam', 66: 'Sosnut', 67: 'Soft', 68: 'Legato',
		69: 'Hold2', 71: 'Timbre', 72: 'Release', 73: 'Attack',
		74: 'Bright', 84: 'Port.C', 91: 'FX1D', 92: 'FX2D',
		93: 'FX3D', 94: 'FX4D', 95: 'FX5D',
	};

	function ccShortName(cc: number): string {
		return CC_SHORT[cc] ?? '';
	}

	function getModuleName(c: MidiCCAssignment): string {
		if (c.location === 2) return 'Morph';
		const patch = slot.value ? slotsStore.slots[slot.value]?.patch : null;
		if (!patch) return String(c.moduleIndex);
		const areaIdx = c.location === 0 ? 0 : 1;
		const mod = patch.areas[areaIdx]?.modules.find((m) => m.index === c.moduleIndex);
		if (!mod) return String(c.moduleIndex);
		return getModule(mod.type)?.short ?? String(c.moduleIndex);
	}

	function getParamName(c: MidiCCAssignment): string {
		if (c.location === 2) return `Morph ${c.paramIndex + 1}`;
		const patch = slot.value ? slotsStore.slots[slot.value]?.patch : null;
		if (!patch) return String(c.paramIndex);
		const areaIdx = c.location === 0 ? 0 : 1;
		const mod = patch.areas[areaIdx]?.modules.find((m) => m.index === c.moduleIndex);
		if (!mod) return String(c.paramIndex);
		return getModule(mod.type)?.params?.[c.paramIndex]?.name ?? String(c.paramIndex);
	}

	// Selection
	function selectRow(cc: number) {
		selectedRows.value = new Set([cc]);
		lastSelectedCC = cc;
	}

	function toggleRow(cc: number) {
		const next = new Set(selectedRows.value);
		if (next.has(cc)) next.delete(cc);
		else next.add(cc);
		selectedRows.value = next;
		lastSelectedCC = cc;
	}

	function shiftSelectRow(cc: number) {
		if (lastSelectedCC === null) { selectRow(cc); return; }
		const sorted = sortedControllers.value.map((c) => c.cc);
		const from = sorted.indexOf(lastSelectedCC);
		const to = sorted.indexOf(cc);
		if (from === -1 || to === -1) { selectRow(cc); return; }
		const [lo, hi] = from < to ? [from, to] : [to, from];
		const next = new Set(selectedRows.value);
		for (let i = lo; i <= hi; i++) next.add(sorted[i]);
		selectedRows.value = next;
	}

	// Buttons
	async function removeSelected() {
		const s = slot.value;
		if (!s) return;
		const ccs = [...selectedRows.value];
		selectedRows.value = new Set();
		await Promise.all(ccs.map((cc) => slotsStore.deassignMidiCC(s, cc)));
	}

	async function removeAll() {
		const s = slot.value;
		if (!s || controllers.value.length === 0) return;
		if (!window.confirm(`Remove all ${controllers.value.length} CC assignments?`)) return;
		selectedRows.value = new Set();
		await slotsStore.deassignAllMidiCC(s);
	}

	const assignLabel = computed(() => {
		const cc = deviceStore.lastMidiCC;
		return cc !== null ? `Assign (CC:${cc})` : 'Assign (#–)';
	});

	const assignTitle = computed(() => {
		const p = uiStore.selectedParam;
		if (!p) return 'Select a param on the canvas first';
		if (deviceStore.lastMidiCC === null) return 'Send a MIDI CC from your keyboard first';
		return `Assign CC ${deviceStore.lastMidiCC} to param ${p.paramIndex} of module ${p.moduleId}`;
	});

	const assignDisabled = computed(() =>
		deviceStore.lastMidiCC === null || !uiStore.selectedParam || !slot.value,
	);

	async function assignLastCC() {
		const s = slot.value;
		const p = uiStore.selectedParam;
		const cc = deviceStore.lastMidiCC;
		if (!s || !p || cc === null) return;
		// Location: derive from selectedModulesArea
		const area = uiStore.selectedModulesArea;
		const location: 0 | 1 | 2 = area === 'va' ? 1 : 0;
		await slotsStore.assignMidiCC(s, location, p.moduleId, p.paramIndex, cc);
	}

	const autoAssignDisabled = computed(() =>
		!slot.value || uiStore.selectedModules.length === 0,
	);

	async function autoAssign() {
		const s = slot.value;
		if (!s || uiStore.selectedModules.length === 0) return;
		const area = uiStore.selectedModulesArea;
		const location: 0 | 1 | 2 = area === 'va' ? 1 : 0;
		const patch = slotsStore.slots[s].patch;
		if (!patch) return;
		const areaIdx = location === 0 ? 0 : 1;
		const targets: { location: 0 | 1 | 2; moduleIndex: number; paramIndex: number }[] = [];
		for (const modId of uiStore.selectedModules) {
			const mod = patch.areas[areaIdx].modules.find((m) => m.index === modId);
			if (!mod) continue;
			for (let pi = 0; pi < (mod.pcnt ?? 0); pi++) {
				targets.push({ location, moduleIndex: modId, paramIndex: pi });
			}
		}
		await slotsStore.autoAssignMidiCC(s, targets);
	}

	// Drag-and-drop (row → row within panel: swap assignments)
	function onRowDragStart(c: MidiCCAssignment, e: DragEvent) {
		e.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'cc', cc: c.cc }));
	}

	async function onRowDrop(target: MidiCCAssignment, e: DragEvent) {
		const raw = e.dataTransfer?.getData('text/plain');
		if (!raw || !slot.value) return;
		let data: any;
		try { data = JSON.parse(raw); } catch { return; }
		const s = slot.value;
		if (data.type === 'cc' && data.cc !== target.cc) {
			// Swap: reassign dragged CC to target's param, and target CC to dragged param
			const dragged = controllers.value.find((c) => c.cc === data.cc);
			if (!dragged) return;
			await slotsStore.assignMidiCC(s, target.location, target.moduleIndex, target.paramIndex, dragged.cc);
			await slotsStore.assignMidiCC(s, dragged.location, dragged.moduleIndex, dragged.paramIndex, target.cc);
		} else if (data.type === 'param') {
			// Assign this row's CC to dropped param
			await slotsStore.assignMidiCC(s, data.location, data.moduleIndex, data.paramIndex, target.cc);
		}
	}

</script>
