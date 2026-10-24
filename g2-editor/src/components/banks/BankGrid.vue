<template>
	<div class="flex flex-col min-w-0 min-h-0 flex-1 border border-line-default rounded-xs overflow-hidden" :data-testid="`bank-grid-${side}`">
		<div class="flex items-center gap-2 px-2 py-1.5 border-b border-line-subtle">
			<span class="text-xs text-content-secondary">Bank</span>
			<Select :model-value="bank" :options="bankOptions" title="Bank" @update:model-value="(v) => emit('update:bank', Number(v))" />
			<span v-if="sameBank" class="text-xs text-content-muted">(also shown on the other side)</span>
			<BtnGroup
				class="ml-auto"
				:model-value="sort"
				:options="sortOptions"
				variant="toggle"
				@update:model-value="(v) => emit('update:sort', v as PatchSortMode)"
			/>
		</div>
		<div class="grid grid-cols-8 auto-rows-fr flex-1 min-h-0 overflow-y-auto">
			<div
				v-for="cell in cells"
				:key="cell.location"
				class="flex items-center gap-1 px-1 min-w-0 text-xs select-none border-r border-b border-line-subtle/60 nth-[8n]:border-r-0"
				:class="[
					cell.patch ? 'bg-surface-2' : '',
					{
						'animate-pulse': isBusy(cell.location),
						'outline-2 outline-input -outline-offset-2': dropTarget === cell.location,
						'ring-2 ring-inset ring-input': org.isSelected(asCell(loc(cell.location))),
					},
				]"
				:style="cell.patch ? { backgroundColor: categoryTint(cell.patch.category) } : undefined"
				:draggable="!!cell.patch"
				:data-testid="`bank-cell-${cell.location}`"
				:title="cell.patch ? `${bank}-${cell.location} ${cell.patch.name}` : `${bank}-${cell.location} (empty)`"
				@click="(e: MouseEvent) => org.select(asCell(loc(cell.location)), e.shiftKey || e.metaKey || e.ctrlKey)"
				@contextmenu.prevent="(e: MouseEvent) => cell.patch && onContextMenu(e, cell.location)"
				@dragstart="org.start($event, { type: 'cell', loc: loc(cell.location) })"
				@dragend="org.end()"
				@dragover="onDragOver($event, cell.location)"
				@dragleave="dropTarget = null"
				@drop.prevent="onDrop($event, cell.location)"
				@mouseenter="showHint('organizerCell')"
				@mouseleave="clearHint()"
			>
				<span class="shrink-0 w-6 text-right text-content-muted tabular-nums">{{ cell.location }}</span>
				<span class="truncate" :class="cell.patch ? 'text-content-primary' : 'text-content-muted'">{{ cell.patch?.name ?? '—' }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed, ref } from 'vue';
	import Select from '../common/Select.vue';
	import BtnGroup from '../toolbar/BtnGroup.vue';
	import { useBrowserStore, type BankKind, type BankLoc, type SynthPatch } from '@/store/browser';
	import { sortPatches, type PatchSortMode } from '@/utils/sortPatches';
	import { categoryTint } from './categoryTint';
	import { useStatusHint } from '@/composables/useStatusHint';
	import { asCell, useOrganizer, type OrganizerDragSource } from './useOrganizer';
	import { useContextMenu } from '@/composables/useContextMenu';
	import { SLOT_LABELS } from '@/constants';
	import type { ContextMenuItem } from '@/types';

	const props = defineProps<{
		side: 'left' | 'right';
		kind: BankKind;
		bank: number;
		sort: PatchSortMode;
		sameBank: boolean;
	}>();

	const emit = defineEmits<{
		'update:bank': [bank: number];
		'update:sort': [sort: PatchSortMode];
	}>();

	const browser = useBrowserStore();
	const org = useOrganizer();
	const { showHint, clearHint } = useStatusHint();
	const { open: openContextMenu } = useContextMenu();
	const dropTarget = ref<number | null>(null);

	const LOCATIONS = 128;

	// "3 (12)": bank number and its number of occupied locations, as the Patch Browser's bank headers show.
	const bankOptions = computed(() => {
		const list = props.kind === 'performance' ? browser.synthPerformances : browser.synthPatches;
		return Array.from({ length: props.kind === 'performance' ? 8 : 32 }, (_, i) => {
			const count = list.filter((p) => p.bank === i + 1).length;
			return { id: i + 1, name: `${i + 1} (${count})` };
		});
	});

	const sortOptions = computed(() => [
		{ label: 'Loc', value: 'location', hint: 'organizerSort' as const },
		{ label: 'A–Z', value: 'name', hint: 'organizerSort' as const },
		{ label: 'Z–A', value: 'name-desc', hint: 'organizerSort' as const },
		{ label: 'Cat', value: 'category', hint: 'organizerSort' as const, disabled: props.kind !== 'patch' },
	]);

	// 'location' is the real 8x16 layout. Sorted modes list the occupied locations in order,
	// then the empty ones, so every location stays a drop target.
	const cells = computed(() => {
		const list = props.kind === 'performance' ? browser.synthPerformances : browser.synthPatches;
		const entries = list.filter((p) => p.bank === props.bank);
		const byLoc = new Map(entries.map((p) => [p.location, p]));
		const all = Array.from({ length: LOCATIONS }, (_, i) => ({ location: i + 1, patch: byLoc.get(i + 1) as SynthPatch | undefined }));
		if (props.sort === 'location') return all;
		return [...sortPatches(entries, props.sort).map((p) => ({ location: p.location, patch: p as SynthPatch | undefined })), ...all.filter((c) => !c.patch)];
	});

	const loc = (location: number): BankLoc => ({ kind: props.kind, bank: props.bank, location });
	const isBusy = (location: number) => browser.organizerBusy.includes(`${props.kind}-${props.bank}-${location}`);

	// Same kind only (Perf slot ↔ performance banks), and never a cell onto itself.
	function accepts(location: number) {
		return (src: OrganizerDragSource) => {
			if (src.type === 'slot') return (src.slot === 4) === (props.kind === 'performance');
			if (src.type === 'storage') return src.item.kind === props.kind;
			return src.loc.kind === props.kind && !(src.loc.bank === props.bank && src.loc.location === location);
		};
	}

	function onDragOver(e: DragEvent, location: number) {
		org.over(e, accepts(location));
		if (e.defaultPrevented) dropTarget.value = location;
	}

	function onDrop(e: DragEvent, location: number) {
		dropTarget.value = null;
		org.dropOnCell(e, loc(location));
	}

	// Acts on the whole selection when the cell is part of it (else selects just this cell).
	function onContextMenu(e: MouseEvent, location: number) {
		const here = loc(location);
		if (!org.isSelected(asCell(here))) org.select(asCell(here), false);
		const targets = org.targetsFor(asCell(here));
		const locs = targets.flatMap((t) => (t.type === 'cell' ? [t.loc] : []));
		const slots = props.kind === 'performance' ? [{ slot: 4, label: 'Perf' }] : SLOT_LABELS.map((label, slot) => ({ slot, label }));
		const items: ContextMenuItem[] = [
			{
				label: locs.length > 1 ? `Copy ${locs.length} to Temporary Storage` : 'Copy to Temporary Storage',
				action: () => locs.forEach((l) => browser.toStorage(l)),
			},
			{
				label: 'Load into slot',
				disabled: locs.length > 1,
				children: slots.map(({ slot, label }) => ({ label, action: () => org.loadIntoSlot(here, slot) })),
			},
			{ type: 'separator' },
			{ label: locs.length > 1 ? `Delete ${locs.length} locations…` : 'Delete…', action: () => org.requestClear(targets) },
		];
		openContextMenu(e, items);
	}
</script>
