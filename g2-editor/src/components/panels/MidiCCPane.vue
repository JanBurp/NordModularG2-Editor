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

		<!-- List -->
		<div class="flex-1 overflow-y-auto select-none">
			<!-- Header -->
			<div class="grid grid-cols-[2.5rem_4rem_5rem_1fr] sticky top-0 bg-neutral-800 text-neutral-400 border-b border-neutral-700 py-1">
				<span class="px-2">CC</span>
				<span class="px-2">Name</span>
				<span class="px-2">Module</span>
				<span class="px-2">Param</span>
			</div>
			<!-- Rows -->
			<div
				v-for="row in allCCRows"
				:key="row.cc"
				class="grid grid-cols-[2.5rem_4rem_5rem_1fr] border-b border-neutral-800 cursor-grab"
				:class="row.assignment
					? (selectedRows.has(row.cc) ? 'bg-blue-900/50' : 'hover:bg-neutral-800')
					: 'opacity-40'"
				draggable="true"
				@click.exact="row.assignment && selectRow(row.cc)"
				@click.ctrl.exact="row.assignment && toggleRow(row.cc)"
				@click.meta.exact="row.assignment && toggleRow(row.cc)"
				@click.shift.exact="row.assignment && shiftSelectRow(row.cc)"
				@dragstart="onRowDragStart(row.cc, $event)"
				@dragover.prevent
				@drop="onRowDrop(row.cc, row.assignment, $event)"
			>
				<span class="px-2 py-0.5">{{ row.cc }}</span>
				<span class="px-2 py-0.5 text-neutral-400">{{ ccShortName(row.cc) }}</span>
				<span class="px-2 py-0.5">{{ row.assignment ? getModuleName(row.assignment) : '' }}</span>
				<span class="px-2 py-0.5">{{ row.assignment ? getParamName(row.assignment) : '' }}</span>
			</div>
		</div>

		<!-- Drop zone hint -->
		<div
			class="shrink-0 py-1 px-2 text-center text-neutral-500 border-t border-neutral-700 text-[10px]"
		>
			Hold F8 to show CC badges · Right-click params to assign
		</div>

		<Dialog v-model="showRemoveAllDialog" title="Remove All CC Assignments" @confirm="confirmRemoveAll">
			<p class="text-sm text-neutral-200">Remove all {{ controllers.length }} CC assignments?</p>
		</Dialog>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed } from 'vue';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useDeviceStore } from '@/store/device';
	import { getModule } from '@/renderer/nmg2mods';
	import { getAllowedCCs } from '@/composables/useMidiCC';
	import type { MidiCCAssignment } from '@/types';
	import Dialog from '@/components/common/Dialog.vue';

	type CCRow = { cc: number; assignment: MidiCCAssignment | null };

	defineProps<{ isActive?: boolean }>();

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const deviceStore = useDeviceStore();

	const selectedRows = ref<Set<number>>(new Set());
	let lastSelectedCC: number | null = null;
	const showRemoveAllDialog = ref(false);

	const slot = computed(() => uiStore.slotInFocus);

	const controllers = computed<MidiCCAssignment[]>(() => {
		if (!slot.value) return [];
		return slotsStore.slots[slot.value].controllers;
	});

	const allCCRows = computed<CCRow[]>(() => {
		const assignedMap = new Map(controllers.value.map((c) => [c.cc, c]));
		return getAllowedCCs().map((cc) => ({ cc, assignment: assignedMap.get(cc) ?? null }));
	});

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
		const lo = Math.min(lastSelectedCC, cc);
		const hi = Math.max(lastSelectedCC, cc);
		const next = new Set(selectedRows.value);
		for (const row of allCCRows.value) {
			if (row.cc >= lo && row.cc <= hi && row.assignment) next.add(row.cc);
		}
		selectedRows.value = next;
	}

	// Buttons
	async function removeSelected() {
		const s = slot.value;
		if (!s) return;
		const ccs = [...selectedRows.value];
		selectedRows.value = new Set();
		await slotsStore.deassignMidiCCs(s, ccs);
	}

	function removeAll() {
		if (!slot.value || controllers.value.length === 0) return;
		showRemoveAllDialog.value = true;
	}

	async function confirmRemoveAll() {
		const s = slot.value;
		if (!s) return;
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

	// Drag-and-drop (within panel)
	function onRowDragStart(cc: number, e: DragEvent) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'cc', cc }));

		// Custom drag image — mirrors ModuleCCBadge ghost styling
		const w = cc >= 100 ? 52 : cc >= 10 ? 46 : 40;
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', String(w));
		svg.setAttribute('height', '15');
		svg.style.cssText = 'position:fixed;top:-200px;left:-200px;pointer-events:none;';
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('width', String(w));
		rect.setAttribute('height', '15');
		rect.setAttribute('fill', '#FFE55C');
		rect.setAttribute('stroke', '#000');
		rect.setAttribute('stroke-width', '0.8');
		rect.setAttribute('rx', '2');
		rect.setAttribute('opacity', '0.8');
		const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		text.setAttribute('x', String(w / 2));
		text.setAttribute('y', '11');
		text.setAttribute('fill', '#000');
		text.setAttribute('font-size', '11');
		text.setAttribute('font-weight', 'bold');
		text.setAttribute('font-family', 'monospace');
		text.setAttribute('text-anchor', 'middle');
		text.textContent = `CC# ${cc}`;
		svg.appendChild(rect);
		svg.appendChild(text);
		document.body.appendChild(svg);
		e.dataTransfer.setDragImage(svg, w / 2, 7);
		requestAnimationFrame(() => document.body.removeChild(svg));
	}

	async function onRowDrop(targetCC: number, targetAssignment: MidiCCAssignment | null, e: DragEvent) {
		const raw = e.dataTransfer?.getData('text/plain');
		if (!raw || !slot.value) return;
		let data: any;
		try { data = JSON.parse(raw); } catch { return; }
		const s = slot.value;
		if (data.type === 'cc' && data.cc !== targetCC) {
			const dragged = controllers.value.find((c) => c.cc === data.cc);
			if (!dragged) return;
			if (targetAssignment) {
				// Swap: both rows are assigned, exchange their CC numbers
				await slotsStore.assignMidiCC(s, targetAssignment.location, targetAssignment.moduleIndex, targetAssignment.paramIndex, dragged.cc);
				await slotsStore.assignMidiCC(s, dragged.location, dragged.moduleIndex, dragged.paramIndex, targetCC);
			} else {
				// Move: reassign dragged param to the target CC, deassign old CC
				await slotsStore.deassignMidiCC(s, dragged.cc);
				await slotsStore.assignMidiCC(s, dragged.location, dragged.moduleIndex, dragged.paramIndex, targetCC);
			}
		}
	}

</script>
