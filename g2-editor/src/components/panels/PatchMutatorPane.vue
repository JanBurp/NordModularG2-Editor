<template>
	<div class="flex flex-col h-full overflow-y-auto text-xs text-content-primary bg-surface-0 select-none">
		<!-- Two independent sections (either or both open), styled like the Settings pane -->
		<Collapsible v-model="settings.patchAdjusterOpen" title="Patch Adjuster">
			<!-- official Ctrl-3 floater: global offsets for the focused sound -->
			<PatchAdjuster class="justify-center" />
		</Collapsible>

		<Collapsible v-model="settings.patchMutatorOpen" title="Patch Mutator">
			<!-- Mutator keys only act while focus is in this section (not on the adjuster's knobs) -->
			<div data-mutator-pane tabindex="0" class="flex flex-col gap-3 outline-none" @keydown="onKeydown">
				<!-- Settings and breeding operations. Grid without column gaps (cells carry the spacing) so the
				     label lines run through: Probability ─ Range ──╮ over the one-parent buttons, ╭─ Probability over Cross. -->
				<div class="grid grid-cols-[repeat(6,auto)] justify-start items-center gap-y-1 [&>*]:px-2">
					<div class="flex items-center gap-1 ml-4 px-0!">
						<span class="flex-1" />
						<span>Probability</span>
						<span class="flex-1 border-t border-content-secondary" />
					</div>
					<span class="border-t border-content-secondary" />
					<div class="flex items-center gap-1 px-0!">
						<span class="flex-1 border-t border-content-secondary" />
						<span>Range</span>
						<span class="flex-1 border-t border-content-secondary" />
					</div>
					<div class="self-start flex px-0!"><span class="w-1/4 h-2 mt-2 border-t border-r border-content-secondary" /></div>
					<div class="self-start flex justify-end px-0!"><span class="w-1/5 h-2 mt-2 border-t border-l border-content-secondary" /></div>
					<div class="flex items-center gap-1 px-0!">
						<span class="flex-1 border-t border-content-secondary" />
						<span>Probability</span>
						<span class="flex-1" />
					</div>

					<span class="param-display w-14 text-center justify-self-center ml-4">{{ Math.round(s.prob * 100) }}%</span>
					<span />
					<span class="param-display w-14 text-center justify-self-center">+/-{{ Math.round(s.range * 100) }}%</span>
					<div class="flex gap-1 pl-6!">
						<Button variant="default" size="small" :disabled="!s.mother" @click="mutator.mutate()">Mutate</Button>
						<Button variant="default" size="small" @click="mutator.randomize()">Randomize</Button>
					</div>
					<div class="flex gap-1 pl-6!">
						<Button variant="default" size="small" :disabled="!s.mother || !s.father" @click="mutator.breed('interpolate')">Interpolate</Button>
						<Button variant="default" size="small" :disabled="!s.mother || !s.father" @click="mutator.breed('cross')">Cross</Button>
					</div>
					<span class="param-display w-14 text-center justify-self-center ml-4">{{ Math.round(s.cross * 100) }}%</span>

					<div class="justify-self-center ml-4">
						<Knob type="KnobSmall" :value="Math.round(s.prob * 127)" @change="(v) => mutator.setProb(v / 127)" />
					</div>
					<Button variant="toggle" size="small" :active="s.link" @click="mutator.toggleLink()">Link</Button>
					<div class="justify-self-center">
						<Knob type="KnobSmall" :value="Math.round((s.range / 0.5) * 127)" @change="(v) => mutator.setRange((v / 127) * 0.5)" />
					</div>
					<span class="self-start text-center text-content-muted pl-6!">(one parent)</span>
					<span class="self-start text-center text-content-muted pl-6!">(both parents)</span>
					<div class="justify-self-center ml-4">
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
						<!-- bracket from the centre of the first child to the centre of the last: half a box = (column - 5 gaps) / 12 -->
						<BracketLabel title="Children" class="px-[calc((100%-30px)/12)]" />
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
					<!-- bracket from the centre of the first storage box to the centre of the last (half a box = --box / 2, see above) -->
					<BracketLabel title="Temporary Storage" class="pl-[calc((100%-74px)/16)] pr-[calc(32px+(100%-74px)/16)]" />
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
					<!-- bracket from the centre of the first variation to the centre of the last: half a box = (row - 7 gaps) / 16 -->
					<BracketLabel title="Variations" class="px-[calc((100%-42px)/16)]" />
					<div class="grid grid-cols-8 gap-1.5">
						<MutaBox
							v-for="ref in variationRow"
							:key="key(ref)"
							:genome="mutator.genomeAt(ref)"
							:focused="isFocused(ref)"
							v-bind="boxEvents(ref)"
						/>
					</div>
				</div>

				<!-- Quick Locks: a lit button = that category is locked -->
				<div class="self-center flex flex-col gap-4">
					<!-- label stretches to the button row; bracket from the centre of the first lock to the centre of the last: half a column = (row - 6 gaps) / 14 -->
					<BracketLabel title="Quick Locks during One Parent operations" class="px-[calc((100%-120px)/14)]" />
					<div class="grid grid-cols-7 gap-5">
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
		</Collapsible>

		<Collapsible v-model="settings.patchMutatorKeysOpen" title="Key Commands">
			<div class="grid grid-cols-2 gap-6">
				<KeyCommandTable v-for="group in KEY_GROUPS" :key="group.title" :title="group.title" :rows="group.rows" />
			</div>
		</Collapsible>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import Button from '../toolbar/Button.vue';
	import Knob from '../common/Knob.vue';
	import Collapsible from '../common/Collapsible.vue';
	import BracketLabel from './BracketLabel.vue';
	import MutaBox from './MutaBox.vue';
	import PatchAdjuster from '../toolbar/PatchAdjuster.vue';
	import KeyCommandTable, { type KeyCommandGroup } from '../common/KeyCommandTable.vue';
	import { useMutatorStore, STORAGE_COLS, STORAGE_ROWS, NUM_VISIBLE_VARIATIONS, type BoxRef } from '../../store/mutator';
	import { useUiStore } from '../../store/ui';
	import { useSettingsStore } from '../../store/settings';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { useStatusHint } from '../../composables/useStatusHint';
	import { NUM_CHILDREN, QUICK_LOCKS } from '../../renderer/mutator';

	const mutator = useMutatorStore();
	const uiStore = useUiStore();
	const settings = useSettingsStore();
	const { open: openContextMenu } = useContextMenu();
	const { showHint, clearHint } = useStatusHint();

	const s = computed(() => mutator.current);

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
			onMouseenter: () => showHint(r.kind === 'storage' ? 'mutaStorage' : 'mutaBox'),
			onMouseleave: clearHint,
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

	// Shown in the Key Commands section; keep in sync with KEYS.
	const KEY_GROUPS: KeyCommandGroup[] = [
		{
			title: 'Focus & Store',
			rows: [
				{ keys: ['1–8'], action: 'Mother / Child 1–6 / Father' },
				{ keys: ['← → ↑ ↓'], action: 'Nearest filled box' },
				{ keys: ['O', 'T'], action: 'Copy to Mother / Father' },
				{ keys: ['S'], action: 'Copy to first empty storage' },
			],
		},
		{
			title: 'Breed',
			rows: [
				{ keys: ['U'], action: 'Mutate Mother' },
				{ keys: ['E'], action: 'Mutate focused sound' },
				{ keys: ['N'], action: 'Randomize' },
				{ keys: ['I', 'X'], action: 'Interpolate / Cross parents' },
			],
		},
	];

	function onKeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const action = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
		if (!action) return;
		e.preventDefault();
		e.stopPropagation();
		action();
	}
</script>
