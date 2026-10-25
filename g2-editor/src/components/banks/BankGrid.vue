<template>
	<div class="flex flex-col min-w-0 min-h-0 flex-1 border border-line-default rounded-xs overflow-hidden" :data-testid="`bank-grid-${side}`">
		<div class="flex items-center gap-2 px-2 py-1.5 border-b border-line-subtle">
			<span class="text-xs text-content-secondary">Bank</span>
			<Select :model-value="bank" :options="bankOptions" title="Bank" @update:model-value="(v) => emit('update:bank', Number(v))" />
			<span v-if="sameBank" class="text-xs text-content-muted">(also shown on the other side)</span>
			<Button
				variant="toggle"
				class="ml-auto w-6 px-0!"
				:active="sortLinked"
				title="Same sort for both columns"
				hint="organizerSortLink"
				:data-testid="`sort-link-${side}`"
				@click="emit('update:sortLinked', !sortLinked)"
			>
				<Icon name="link" class="w-3.5 h-3.5" />
			</Button>
			<BtnGroup :model-value="sort" :options="sortOptions" variant="toggle" @update:model-value="(v) => emit('update:sort', v as PatchSortMode)" />
		</div>
		<div ref="gridRef" class="grid grid-cols-8 auto-rows-fr flex-1 min-h-0 overflow-y-auto">
			<div
				v-for="cell in cells"
				:key="cell.location"
				class="flex px-1 min-w-0 text-xs select-none border-r border-b border-line-subtle/60 nth-[8n]:border-r-0"
				:class="[
					twoLines ? 'flex-col justify-center' : 'items-center gap-1',
					cell.patch ? 'bg-surface-cell cursor-grab active:cursor-grabbing organizer-hover' : '',
					{
						'animate-pulse': isBusy(cell.location),
						'outline-2 outline-input -outline-offset-2': dropTarget === cell.location,
						'ring-2 ring-inset ring-input': org.isSelected(asCell(loc(cell.location))),
						'outline-1 outline-dashed outline-input -outline-offset-2': dropTarget !== cell.location && org.isCursor(asCell(loc(cell.location))),
					},
				]"
				:style="cell.patch ? { backgroundColor: categoryTint(cell.patch.category) } : undefined"
				:draggable="!!cell.patch"
				:data-testid="`bank-cell-${cell.location}`"
				:title="cell.patch ? `${bank}-${cell.location} ${cell.patch.name}` : `${bank}-${cell.location} (empty)`"
				@click="(e: MouseEvent) => org.select(asCell(loc(cell.location)), clickMode(e), areaId)"
				@contextmenu.prevent="(e: MouseEvent) => cell.patch && onContextMenu(e, cell.location)"
				@dragstart="org.startItem($event, asCell(loc(cell.location)), areaId)"
				@dragend="org.end()"
				@dragover="onDragOver($event, cell.location)"
				@dragleave="dropTarget = null"
				@drop.prevent="onDrop($event, cell.location)"
				@mouseenter="showHint('organizerCell')"
				@mouseleave="clearHint()"
			>
				<!-- Tall enough: "17 Bass" over the name, like the storage boxes; else location and name in one line -->
				<span v-if="twoLines" class="truncate" :class="cell.patch ? 'text-content-primary/60' : 'text-content-muted'">
					<span class="tabular-nums">{{ cell.location }}</span>
					<template v-if="cell.patch && kind === 'patch'">&nbsp;{{ getCategoryNameFromSlug(cell.patch.category) || 'No Cat' }}</template>
				</span>
				<span v-else class="shrink-0 w-6 text-right tabular-nums" :class="cell.patch ? 'text-content-primary/60' : 'text-content-muted'">{{
					cell.location
				}}</span>
				<span class="truncate" :class="cell.patch ? 'text-content-primary' : 'text-content-muted'">{{ cell.patch?.name ?? '—' }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed, onMounted, onUnmounted, ref } from 'vue';
	import Select from '../common/Select.vue';
	import BtnGroup from '../toolbar/BtnGroup.vue';
	import Button from '../toolbar/Button.vue';
	import Icon from '../common/Icon.vue';
	import { useBrowserStore, type BankKind, type BankLoc, type SynthPatch } from '@/store/browser';
	import { sortPatches, type PatchSortMode } from '@/utils/sortPatches';
	import { categoryTint } from './categoryTint';
	import { getCategoryNameFromSlug } from '@/constants/categories';
	import { useStatusHint } from '@/composables/useStatusHint';
	import { asCell, categoryMenu, clickMode, useOrganizer, type OrganizerDragSource } from './useOrganizer';
	import { useContextMenu } from '@/composables/useContextMenu';
	import { SLOT_LABELS } from '@/constants';
	import type { ContextMenuItem } from '@/types';

	const props = defineProps<{
		side: 'left' | 'right';
		kind: BankKind;
		bank: number;
		sort: PatchSortMode;
		sortLinked: boolean;
		sameBank: boolean;
	}>();

	const emit = defineEmits<{
		'update:bank': [bank: number];
		'update:sort': [sort: PatchSortMode];
		'update:sortLinked': [linked: boolean];
	}>();

	const browser = useBrowserStore();
	const org = useOrganizer();
	const { showHint, clearHint } = useStatusHint();
	const { open: openContextMenu } = useContextMenu();
	const dropTarget = ref<number | null>(null);

	const LOCATIONS = 128;
	const ROWS = LOCATIONS / 8;
	const TWO_LINE_MIN_HEIGHT = 30; // px per row for the two-line cells

	// Two-line cells only when all 16 rows still fit at that height (small windows keep one line).
	const gridRef = ref<HTMLElement>();
	const twoLines = ref(false);
	const resizeObserver = new ResizeObserver(([entry]) => {
		twoLines.value = entry.contentRect.height / ROWS >= TWO_LINE_MIN_HEIGHT;
	});
	onMounted(() => gridRef.value && resizeObserver.observe(gridRef.value));
	onUnmounted(() => resizeObserver.disconnect());

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

	// This grid as a selection area, in display order (sorted modes included), 8 per row.
	const areaId = `grid-${props.side}`;
	onUnmounted(org.registerArea({ id: areaId, items: () => cells.value.map((c) => asCell(loc(c.location))), cols: () => 8 }));
	const isBusy = (location: number) => browser.organizerBusy.includes(`${props.kind}-${props.bank}-${location}`);

	// Same kind only (Perf slot ↔ performance banks), and never onto a cell that is itself being dragged.
	function accepts(location: number) {
		const onItself = (l: BankLoc) => l.bank === props.bank && l.location === location;
		return (src: OrganizerDragSource) => {
			if (src.type === 'slot') return (src.slot === 4) === (props.kind === 'performance');
			if (src.type === 'storage') return src.item.kind === props.kind;
			if (src.type === 'many')
				return src.items.every((s) => (s.type === 'cell' ? s.loc.kind === props.kind && !onItself(s.loc) : s.item.kind === props.kind));
			return src.loc.kind === props.kind && !onItself(src.loc);
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
		if (!org.isSelected(asCell(here))) org.select(asCell(here), 'single', areaId);
		const targets = org.targetsFor(asCell(here));
		const locs = targets.flatMap((t) => (t.type === 'cell' && browser.entryAt(t.loc) ? [t.loc] : []));
		const slots = props.kind === 'performance' ? [{ slot: 4, label: 'Perf' }] : SLOT_LABELS.map((label, slot) => ({ slot, label }));
		const items: ContextMenuItem[] = [
			{
				label: locs.length > 1 ? `Copy ${locs.length} to Temporary Storage` : 'Copy to Temporary Storage',
				action: () => browser.toStorage(locs),
			},
			...org.copyToBankItems(locs.map(asCell), (dst) => browser.moveLocation(here, dst, true)),
			{
				label: 'Load into slot',
				disabled: locs.length > 1,
				children: slots.map(({ slot, label }) => ({ label, action: () => org.loadIntoSlot(here, slot) })),
			},
			...(props.kind === 'patch'
				? [categoryMenu(locs.length > 1 ? `Category of ${locs.length}` : 'Category', (id) => browser.setCategory(locs.map(asCell), id))]
				: []),
			{ type: 'separator' },
			{ label: locs.length > 1 ? `Delete ${locs.length} locations…` : 'Delete', action: () => org.requestClear(targets) },
		];
		openContextMenu(e, items);
	}
</script>
