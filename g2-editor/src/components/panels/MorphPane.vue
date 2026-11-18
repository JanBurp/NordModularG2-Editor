<template>
	<div class="flex flex-col h-full overflow-hidden text-xs text-content-primary bg-surface-0" data-testid="morph-pane">
		<!-- Variation and the G2's morph limit (distinct params, maximum 25) -->
		<div class="relative shrink-0 px-2 py-1 border-b border-line-default text-center font-medium">
			<span data-testid="morph-pane-title">Variation {{ uiStore.variation + 1 }} · {{ count }}/{{ MAX_MORPHED_PARAMS }} params</span>
			<button
				class="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary cursor-pointer"
				aria-label="Close"
				data-testid="morph-pane-close"
				@click="settingsStore.toggleSidebar('morph')"
			>
				<Icon name="close" class="w-3 h-3" />
			</button>
		</div>

		<!-- Group filter: each group toggles on/off; one row, names truncate when the pane is narrow -->
		<div class="flex flex-nowrap gap-1 p-2 border-b border-line-default shrink-0">
			<button
				v-for="(_, i) in MORPH_NAMES"
				:key="i"
				class="flex-1 min-w-0 truncate rounded-xs px-1 text-center text-xs leading-4 bg-input-dimmed text-black cursor-pointer"
				:class="{ 'opacity-40 grayscale': !filter.has(i) }"
				:data-testid="`morph-filter-${i}`"
				@click="toggleFilter(i)"
				@contextmenu.prevent.stop="openContextMenu($event, buildMorphGroupMenuItems(i))"
			>
				{{ morphGroupName(patch, i) }}
			</button>
		</div>

		<!-- List -->
		<div class="flex-1 overflow-y-auto select-none">
			<div :class="COLS" class="sticky top-0 bg-surface-1 text-content-secondary border-b border-line-default py-1">
				<button
					v-for="c in SORT_COLS"
					:key="c.key"
					class="px-2 text-left truncate cursor-pointer hover:text-content-primary"
					:class="{ 'text-content-primary': sortKey === c.key }"
					:data-testid="`morph-sort-${c.key}`"
					@click="sortBy(c.key)"
				>
					{{ c.label }}{{ sortKey === c.key ? (sortDir > 0 ? ' ▲' : ' ▼') : '' }}
				</button>
				<span class="px-2 text-right">Range</span>
				<span />
			</div>
			<div v-if="rows.length === 0" class="px-2 py-2 text-content-muted">
				No morph assignments{{ filter.size === MORPH_NAMES.length ? '' : ' in the selected groups' }}.
			</div>
			<div
				v-for="r in rows"
				:key="morphKey(r.a)"
				:class="COLS"
				class="items-center border-b border-line-subtle cursor-pointer hover:bg-surface-1"
				data-testid="morph-row"
				@click="select(r.a)"
				@contextmenu.prevent.stop="onRowContextMenu(r.a, $event)"
				@mouseenter="showHint('morphRow')"
				@mouseleave="clearHint"
			>
				<span class="px-2 py-1.5">{{ r.a.location === 0 ? 'FX' : 'VA' }}</span>
				<span class="px-2 py-1.5 truncate">{{ r.module }}</span>
				<span class="px-2 py-1.5 truncate">{{ r.param }}</span>
				<span class="px-2 py-1.5 min-w-0">
					<span
						class="block truncate rounded-xs px-1 text-white"
						:style="{ background: MORPH_CHIP[r.a.groupIndex === uiStore.selectedMorphGroup ? 'red' : 'blue'] }"
					>
						{{ morphGroupName(patch, r.a.groupIndex) }}
					</span>
				</span>
				<span class="flex items-center justify-end gap-1 px-1 py-1.5 tabular-nums" @click.stop>
					{{ r.a.range > 0 ? `+${r.a.range}` : r.a.range }}
					<svg width="10" height="10" class="shrink-0 -mt-2.5" data-testid="morph-row-range">
						<ModuleKnobSpin :param="SPIN" :value="r.a.range" :param-index="0" :min="-127" :max="127" @change="(_, v) => setRange(r.a, v)" />
					</svg>
				</span>
				<button
					class="flex justify-center text-content-muted hover:text-content-primary cursor-pointer"
					aria-label="Deassign"
					data-testid="morph-row-remove"
					@click.stop="deassign(r.a)"
				>
					<Icon name="close" class="w-2.5 h-2.5" />
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed, ref } from 'vue';
	import ModuleKnobSpin from '../canvas/ModuleKnobSpin.vue';
	import Icon from '../common/Icon.vue';
	import { MAX_MORPHED_PARAMS, useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useSettingsStore } from '@/store/settings';
	import { assignmentNames, findModuleByIndex, morphGroupName, morphKey } from '@/store/slotHelpers';
	import { MORPH_NAMES } from '@/types/patch';
	import type { MorphAssignment } from '@/types';
	import { MORPH_CHIP } from '@/constants/colors';
	import { revealModule } from '@/composables/useRevealModule';
	import { useStatusHint } from '@/composables/useStatusHint';
	import { useContextMenu } from '@/composables/useContextMenu';
	import { useParamEditDialog } from '@/composables/useParamEditDialog';
	import { buildMorphGroupMenuItems } from '@/composables/useMorphGroupMenu';

	// Area · Module · Param · Group · Range · ×
	const COLS = 'grid grid-cols-[4.25rem_minmax(0,1fr)_minmax(0,1fr)_5rem_3.5rem_1.25rem]';

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const settingsStore = useSettingsStore();
	const { showHint, clearHint } = useStatusHint();

	const { open: openContextMenu } = useContextMenu();
	const { openRangeEdit } = useParamEditDialog();
	const SPIN = { x: 0, y: 0 }; // the range spinner at the top of its own svg

	// Groups shown in the list (all by default)
	const filter = ref(new Set(MORPH_NAMES.map((_, i) => i)));
	function toggleFilter(i: number) {
		const next = new Set(filter.value);
		if (!next.delete(i)) next.add(i);
		filter.value = next;
	}
	const patch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));
	const count = computed(() => slotsStore.morphLimit(uiStore.slotInFocus, uiStore.variation).count);

	// VA before FX, modules in canvas order (column, then row), then param and group.
	// Clickable column headers: click sorts by that column, again reverses it. Ties keep the canvas order.
	type SortKey = 'area' | 'module' | 'param' | 'group';
	const SORT_COLS: { key: SortKey; label: string }[] = [
		{ key: 'area', label: 'Area' },
		{ key: 'module', label: 'Module' },
		{ key: 'param', label: 'Param' },
		{ key: 'group', label: 'Group' },
	];
	const sortKey = ref<SortKey | null>(null);
	const sortDir = ref<1 | -1>(1);
	function sortBy(key: SortKey) {
		sortDir.value = sortKey.value === key ? (-sortDir.value as 1 | -1) : 1;
		sortKey.value = key;
	}
	type Row = { a: MorphAssignment; pos: number[]; module: string; param: string };
	const compareBy: Record<SortKey, (x: Row, y: Row) => number> = {
		area: (x, y) => x.pos[0] - y.pos[0],
		module: (x, y) => x.module.localeCompare(y.module),
		param: (x, y) => x.param.localeCompare(y.param),
		group: (x, y) => x.a.groupIndex - y.a.groupIndex,
	};

	const rows = computed(() => {
		const p = patch.value;
		const pos = (a: MorphAssignment) => {
			const m = p ? findModuleByIndex(p.areas[a.location === 0 ? 0 : 1].modules, a.moduleIndex) : undefined;
			return [a.location === 0 ? 1 : 0, m?.horiz ?? 0, m?.vert ?? 0, a.paramIndex, a.groupIndex];
		};
		return slotsStore
			.getMorphAssignments(uiStore.slotInFocus, uiStore.variation)
			.filter((a) => filter.value.has(a.groupIndex))
			.map((a) => ({ a, pos: pos(a), ...assignmentNames(p, a) }))
			.sort((x, y) => {
				const c = sortKey.value ? sortDir.value * compareBy[sortKey.value](x, y) : 0;
				if (c) return c;
				const i = x.pos.findIndex((v, k) => v !== y.pos[k]);
				return i < 0 ? 0 : x.pos[i] - y.pos[i];
			});
	});

	async function select(a: MorphAssignment) {
		await revealModule(a.location === 0 ? 'fx' : 'voice', a.moduleIndex);
		uiStore.setSelectedParam(a.moduleIndex, a.paramIndex, true); // byCursor: so the canvas highlights the param
	}

	function setRange(a: MorphAssignment, range: number) {
		slotsStore.setMorphAssignmentRange(uiStore.slotInFocus, uiStore.variation, a.groupIndex, a.location, a.moduleIndex, a.paramIndex, range);
	}

	function onRowContextMenu(a: MorphAssignment, e: MouseEvent) {
		openContextMenu(e, [
			{ label: 'Set Range', action: () => openRangeEdit({ slot: uiStore.slotInFocus, variation: uiStore.variation, a, x: e.clientX, y: e.clientY }) },
		]);
	}

	function deassign(a: MorphAssignment) {
		slotsStore.deassignParamFromMorphGroup(uiStore.slotInFocus, uiStore.variation, a.groupIndex, a.location as 0 | 1, a.moduleIndex, a.paramIndex);
	}
</script>
