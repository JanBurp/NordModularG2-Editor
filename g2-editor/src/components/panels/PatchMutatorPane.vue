<template>
	<div class="flex flex-col h-full overflow-y-auto text-xs text-content-primary bg-surface-0 select-none">
		<!-- Patch Adjuster (official Ctrl-3 floater): global offsets for the focused sound -->
		<h2 class="px-2 py-1 text-sm font-bold bg-surface-1 border-y border-line-default">Patch Adjuster</h2>
		<PatchAdjuster class="justify-center" />

		<h2 class="px-2 py-1 text-sm font-bold bg-surface-1 border-y border-line-default">Patch Mutator</h2>
		<StateMessage v-if="!connected" variant="empty" message="The Patch Mutator needs a connected G2." />
		<!-- Mutator keys only act while focus is in this section (not on the adjuster's knobs) -->
		<div v-else data-mutator-pane tabindex="0" class="flex flex-col gap-3 p-2 outline-none" @keydown="onKeydown">
			<!-- Settings and breeding operations -->
			<div class="flex items-end gap-3">
				<div class="flex flex-col items-center gap-1">
					<span>Probability</span>
					<span class="param-display w-14 text-center">{{ Math.round(s.prob * 100) }}%</span>
					<Knob type="KnobSmall" :value="Math.round(s.prob * 127)" @change="(v) => mutator.setProb(v / 127)" />
				</div>
				<Button variant="toggle" size="small" :active="s.link" class="mb-2" @click="mutator.toggleLink()">Link</Button>
				<div class="flex flex-col items-center gap-1">
					<span>Range</span>
					<span class="param-display w-14 text-center">+/-{{ Math.round(s.range * 100) }}%</span>
					<Knob type="KnobSmall" :value="Math.round((s.range / 0.5) * 127)" @change="(v) => mutator.setRange((v / 127) * 0.5)" />
				</div>
				<div class="flex flex-col items-center gap-1">
					<div class="flex gap-1">
						<Button variant="default" size="small" :disabled="!s.mother" @click="mutator.mutate()">Mutate</Button>
						<Button variant="default" size="small" @click="mutator.randomize()">Randomize</Button>
					</div>
					<span class="text-content-muted">(one parent)</span>
				</div>
				<div class="flex flex-col items-center gap-1">
					<div class="flex gap-1">
						<Button variant="default" size="small" :disabled="!s.mother || !s.father" @click="mutator.breed('interpolate')">Interpolate</Button>
						<Button variant="default" size="small" :disabled="!s.mother || !s.father" @click="mutator.breed('cross')">Cross</Button>
					</div>
					<span class="text-content-muted">(both parents)</span>
				</div>
				<div class="flex flex-col items-center gap-1">
					<span>Probability</span>
					<span class="param-display w-14 text-center">{{ Math.round(s.cross * 100) }}%</span>
					<Knob type="KnobSmall" :value="Math.round(s.cross * 127)" @change="(v) => mutator.setCross(v / 127)" />
				</div>
			</div>

			<!-- Mother · Children · Father across the full width, boxes as wide as the storage boxes below.
			     --box = one storage box: (row - x/v column w-6.5 - its gap-1.5 - 7 × gap-1.5) / 8 = (100% - 74px) / 8 -->
			<div class="flex justify-between" style="--box: calc((100% - 74px) / 8)">
				<div class="flex flex-col gap-1.5 w-(--box)">
					<span class="font-bold">Mother</span>
					<MutaBox :genome="mutator.genomeAt(familyRow[0])" family :focused="isFocused(familyRow[0])" v-bind="boxEvents(familyRow[0])" />
				</div>
				<div class="flex flex-col gap-1.5 w-[calc(var(--box)*6+30px)]">
					<span class="text-center font-bold">Children</span>
					<div class="grid grid-cols-6 gap-1.5">
						<MutaBox
							v-for="ref in familyRow.slice(1, -1)"
							:key="key(ref)"
							:genome="mutator.genomeAt(ref)"
							family
							:focused="isFocused(ref)"
							v-bind="boxEvents(ref)"
						/>
					</div>
				</div>
				<div class="flex flex-col gap-1.5 w-(--box)">
					<span class="font-bold text-right">Father</span>
					<MutaBox :genome="mutator.genomeAt(familyRow[7])" family :focused="isFocused(familyRow[7])" v-bind="boxEvents(familyRow[7])" />
				</div>
			</div>

			<!-- Temporary Storage -->
			<div class="flex flex-col gap-1.5">
				<span class="text-center font-bold">Temporary Storage</span>
				<div v-for="row in STORAGE_ROWS" :key="row" class="flex gap-1.5">
					<div class="flex-1 grid grid-cols-8 gap-1.5">
						<MutaBox
							v-for="ref in storageRow(row - 1)"
							:key="key(ref)"
							:genome="mutator.genomeAt(ref)"
							:focused="isFocused(ref)"
							v-bind="boxEvents(ref)"
							@contextmenu.prevent="onStorageContextMenu(ref, $event)"
						/>
					</div>
					<div class="flex flex-col justify-center gap-1 w-6.5">
						<Button variant="default" size="xs" title="Clear Row" @click="mutator.clearStorage(rowIndices(row - 1))">x</Button>
						<Button variant="default" size="xs" title="Copy to Variations" @click="mutator.rowToVariations(row - 1)">v</Button>
					</div>
				</div>
			</div>

			<!-- Variations -->
			<div class="flex flex-col gap-1.5 mr-8">
				<span class="text-center font-bold">Variations</span>
				<div class="grid grid-cols-8 gap-1.5">
					<MutaBox v-for="ref in variationRow" :key="key(ref)" :genome="mutator.genomeAt(ref)" :focused="isFocused(ref)" v-bind="boxEvents(ref)" />
				</div>
			</div>

			<!-- Quick Locks: a lit button = that category is locked -->
			<div class="flex flex-col items-center gap-1">
				<span>Quick Locks during One Parent operations</span>
				<div class="flex gap-1.5">
					<div v-for="q in QUICK_LOCKS" :key="q.label" class="flex flex-col items-center gap-1">
						<Button
							variant="toggle"
							size="small"
							:active="(s.lockMask & q.bit) === 0"
							:disabled="s.soloMask !== 0"
							@click="mutator.toggleLock(q.bit)"
						>
							{{ q.label }}
						</Button>
						<Button variant="toggle" size="xs" :active="(s.soloMask & q.bit) !== 0" @click="mutator.toggleSolo(q.bit)">Solo</Button>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import Button from '../toolbar/Button.vue';
	import Knob from '../common/Knob.vue';
	import StateMessage from '../browser/StateMessage.vue';
	import MutaBox from './MutaBox.vue';
	import PatchAdjuster from '../toolbar/PatchAdjuster.vue';
	import { useMutatorStore, STORAGE_COLS, STORAGE_ROWS, NUM_VISIBLE_VARIATIONS, type BoxRef } from '../../store/mutator';
	import { useDeviceStore, DeviceStatus } from '../../store/device';
	import { useUiStore } from '../../store/ui';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { NUM_CHILDREN, QUICK_LOCKS } from '../../renderer/mutator';

	const mutator = useMutatorStore();
	const uiStore = useUiStore();
	const deviceStore = useDeviceStore();
	const { open: openContextMenu } = useContextMenu();

	const s = computed(() => mutator.current);
	const connected = computed(() => deviceStore.status === DeviceStatus.Connected);

	const familyRow: BoxRef[] = [
		{ kind: 'mother', index: 0 },
		...Array.from({ length: NUM_CHILDREN }, (_, i): BoxRef => ({ kind: 'child', index: i })),
		{ kind: 'father', index: 0 },
	];
	const rowIndices = (row: number) => Array.from({ length: STORAGE_COLS }, (_, c) => row * STORAGE_COLS + c);
	const storageRow = (row: number) => rowIndices(row).map((index): BoxRef => ({ kind: 'storage', index }));
	const variationRow = Array.from({ length: NUM_VISIBLE_VARIATIONS }, (_, index): BoxRef => ({ kind: 'variation', index }));
	// Arrow-key grid: family row, three storage rows, variations — 8 columns each.
	const grid: BoxRef[][] = [familyRow, ...Array.from({ length: STORAGE_ROWS }, (_, r) => storageRow(r)), variationRow];

	const key = (r: BoxRef) => `${r.kind}${r.index}`;
	const sameRef = (a: BoxRef | null, b: BoxRef) => a?.kind === b.kind && a.index === b.index;
	const focusRef = computed<BoxRef>(() => mutator.focus ?? { kind: 'variation', index: uiStore.variation });
	const isFocused = (r: BoxRef) => sameRef(focusRef.value, r);

	const DRAG_TYPE = 'application/x-g2-mutabox';

	function boxEvents(r: BoxRef) {
		return {
			onClick: () => mutator.focusBox(r),
			onDblclick: () => mutator.mutate(r),
			onDragstart: (e: DragEvent) => e.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(r)),
			onDragover: (e: DragEvent) => {
				if (e.dataTransfer?.types.includes(DRAG_TYPE)) e.preventDefault();
			},
			onDrop: (e: DragEvent) => onDrop(r, e),
		};
	}

	// Plain drop copies (storage → storage moves); Shift-drop interpolates and Alt-drop crosses the
	// two sounds (official Shift / Ctrl-drag-drop).
	function onDrop(target: BoxRef, e: DragEvent) {
		const raw = e.dataTransfer?.getData(DRAG_TYPE);
		if (!raw) return;
		e.preventDefault();
		const src = JSON.parse(raw) as BoxRef;
		if (e.shiftKey || e.altKey) {
			if (mutator.genomeAt(target)) mutator.breed(e.shiftKey ? 'interpolate' : 'cross', src, target);
		} else mutator.copy(src, target);
	}

	function onStorageContextMenu(r: BoxRef, e: MouseEvent) {
		openContextMenu(e, [{ label: 'Delete', disabled: !mutator.genomeAt(r), action: () => mutator.clearStorage([r.index]) }]);
	}

	// Moves the focus to the nearest filled box in the arrow's direction.
	function moveFocus(dRow: number, dCol: number) {
		const row = grid.findIndex((cells) => cells.some((c) => sameRef(focusRef.value, c)));
		if (row < 0) return;
		let col = grid[row].findIndex((c) => sameRef(focusRef.value, c));
		let r = row;
		for (;;) {
			r += dRow;
			col += dCol;
			if (r < 0 || r >= grid.length || col < 0 || col >= STORAGE_COLS) return;
			if (mutator.genomeAt(grid[r][col])) return mutator.focusBox(grid[r][col]);
		}
	}

	// Official single-key shortcuts while the pane has focus. Keys 1-8 are menu accelerators and are
	// routed here by useElectronMenuActions (see isMutatorFocused).
	const KEYS: Record<string, () => unknown> = {
		ArrowUp: () => moveFocus(-1, 0),
		ArrowDown: () => moveFocus(1, 0),
		ArrowLeft: () => moveFocus(0, -1),
		ArrowRight: () => moveFocus(0, 1),
		o: () => mutator.assignParent('mother'),
		t: () => mutator.assignParent('father'),
		e: () => mutator.mutate(focusRef.value),
		u: () => mutator.mutate(),
		n: () => mutator.randomize(),
		i: () => mutator.breed('interpolate'),
		x: () => mutator.breed('cross'),
		s: () => mutator.storeFocused(),
	};

	function onKeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey || !connected.value) return;
		const action = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
		if (!action) return;
		e.preventDefault();
		e.stopPropagation();
		action();
	}
</script>
