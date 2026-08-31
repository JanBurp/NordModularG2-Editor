<template>
	<div class="flex flex-col h-full overflow-hidden text-xs text-content-primary bg-surface-0">
		<!-- MIDI Learn indicator -->
		<div class="shrink-0 px-2 py-1 border-b border-line-default text-center font-medium">
			<span v-if="deviceStore.lastMidiCC !== null" class="text-input">MIDI Learn: last CC received #{{ deviceStore.lastMidiCC }}</span>
			<span v-else class="text-content-muted">MIDI Learn: waiting for CC…</span>
		</div>

		<!-- Button row -->
		<div class="flex flex-wrap gap-1 p-2 border-b border-line-default shrink-0">
			<button
				class="px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed"
				:disabled="selectedRows.size === 0"
				@click="removeSelected"
			>
				Remove
			</button>
			<button
				class="px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed"
				:disabled="controllers.length === 0"
				@click="removeAll"
			>
				Remove All
			</button>
			<button
				class="px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed"
				:disabled="autoAssignDisabled"
				@click="autoAssign"
			>
				Auto Assign
			</button>
		</div>

		<!-- List -->
		<div class="flex-1 overflow-y-auto select-none">
			<!-- Header -->
			<div class="grid grid-cols-[2.5rem_4rem_5rem_1fr] sticky top-0 bg-surface-1 text-content-secondary border-b border-line-default py-1">
				<span class="px-2">CC</span>
				<span class="px-2">Name</span>
				<span class="px-2">Module</span>
				<span class="px-2">Param</span>
			</div>
			<!-- Rows -->
			<div
				v-for="row in allCCRows"
				:key="row.cc"
				class="grid grid-cols-[2.5rem_4rem_5rem_1fr] border-b border-line-subtle cursor-grab"
				:class="row.assignment ? (selectedRows.has(row.cc) ? 'bg-blue-900/50' : 'hover:bg-surface-1') : 'opacity-40'"
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
				<span class="px-2 py-0.5 text-content-secondary">{{ ccShortName(row.cc) }}</span>
				<span class="px-2 py-0.5">{{ row.assignment ? getModuleName(row.assignment) : '' }}</span>
				<span class="px-2 py-0.5">{{ row.assignment ? getParamName(row.assignment) : '' }}</span>
			</div>
		</div>

		<!-- Drop zone hint -->
		<div class="shrink-0 py-1 px-2 text-center text-content-muted border-t border-line-default text-[10px]">F8 - show CC's on params</div>

		<Dialog v-model="showRemoveAllDialog" title="Remove All CC Assignments" @confirm="confirmRemoveAll">
			<p class="text-sm text-content-primary">Remove all {{ controllers.length }} CC assignments?</p>
		</Dialog>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed } from 'vue';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useDeviceStore } from '@/store/device';
	import { getModule } from '@/renderer/nmg2mods';
	import { getAllowedCCs, CC_SHORT } from '@/composables/useMidiCC';
	import { setBadgeDragImage } from '@/utils/badgeLayout';
	import { serializeDragPayload, parseDragPayload } from '@/utils/dragPayload';
	import type { MidiCCAssignment } from '@/types';
	import Dialog from '@/components/common/Dialog.vue';

	type CCRow = { cc: number; assignment: MidiCCAssignment | null };

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

	const ccAssignmentMap = computed(() => new Map(controllers.value.map((c) => [c.cc, c])));

	const allCCRows = computed<CCRow[]>(() => getAllowedCCs().map((cc) => ({ cc, assignment: ccAssignmentMap.value.get(cc) ?? null })));

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
		return mod.uname || getModule(mod.type)?.short || String(c.moduleIndex);
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
		if (lastSelectedCC === null) {
			selectRow(cc);
			return;
		}
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

	const autoAssignDisabled = computed(() => !slot.value || uiStore.selectedModules.length === 0);

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
		e.dataTransfer.setData('text/plain', serializeDragPayload({ type: 'cc', cc }));
		// Mirrors MidiBadge ghost styling (CCBadgesOverlay uses the same "CC# n" text)
		setBadgeDragImage(e, `CC# ${cc}`);
	}

	async function onRowDrop(targetCC: number, targetAssignment: MidiCCAssignment | null, e: DragEvent) {
		const data = parseDragPayload(e);
		if (data?.type !== 'cc' || !slot.value) return;
		const s = slot.value;
		if (data.cc !== targetCC) {
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
