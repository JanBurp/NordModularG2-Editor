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

		<!-- Group filter -->
		<div class="flex flex-wrap gap-1 p-2 border-b border-line-default shrink-0">
			<Button variant="toggle" size="small" :active="filter === null" data-testid="morph-filter-all" @click="filter = null">All</Button>
			<Button
				v-for="(_, i) in MORPH_NAMES"
				:key="i"
				variant="toggle"
				size="small"
				:active="filter === i"
				:data-testid="`morph-filter-${i}`"
				@click="filter = filter === i ? null : i"
			>
				{{ morphGroupName(patch, i) }}
			</Button>
		</div>

		<!-- List -->
		<div class="flex-1 overflow-y-auto select-none">
			<div :class="COLS" class="sticky top-0 bg-surface-1 text-content-secondary border-b border-line-default py-1">
				<span class="px-2">Area</span>
				<span class="px-2">Module</span>
				<span class="px-2">Param</span>
				<span class="px-2">Group</span>
				<span class="px-2 text-right">Range</span>
				<span />
			</div>
			<div v-if="rows.length === 0" class="px-2 py-2 text-content-muted">No morph assignments{{ filter === null ? '' : ' in this group' }}.</div>
			<div
				v-for="r in rows"
				:key="morphKey(r.a)"
				:class="COLS"
				class="items-center border-b border-line-subtle cursor-pointer hover:bg-surface-1"
				data-testid="morph-row"
				@click="select(r.a)"
				@mouseenter="showHint('morphRow')"
				@mouseleave="clearHint"
			>
				<span class="px-2 py-0.5">{{ r.a.location === 0 ? 'FX' : 'VA' }}</span>
				<span class="px-2 py-0.5 truncate">{{ r.module }}</span>
				<span class="px-2 py-0.5 truncate">{{ r.param }}</span>
				<span class="px-2 py-0.5 min-w-0">
					<span
						class="block truncate rounded-xs px-1 text-white"
						:style="{ background: MORPH_COLOR_HEX[r.a.groupIndex === uiStore.selectedMorphGroup ? 'red' : 'blue'] }"
					>
						{{ morphGroupName(patch, r.a.groupIndex) }}
					</span>
				</span>
				<span class="px-2 py-0.5 text-right tabular-nums">{{ r.a.range > 0 ? `+${r.a.range}` : r.a.range }}</span>
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
	import Button from '../toolbar/Button.vue';
	import Icon from '../common/Icon.vue';
	import { MAX_MORPHED_PARAMS, useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useSettingsStore } from '@/store/settings';
	import { assignmentNames, findModuleByIndex, morphGroupName, morphKey } from '@/store/slotHelpers';
	import { MORPH_NAMES } from '@/types/patch';
	import type { MorphAssignment } from '@/types';
	import { MORPH_COLOR_HEX } from '@/constants/colors';
	import { revealModule } from '@/composables/useRevealModule';
	import { useStatusHint } from '@/composables/useStatusHint';

	// Area · Module · Param · Group · Range · ×
	const COLS = 'grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_5rem_2.75rem_1.25rem]';

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const settingsStore = useSettingsStore();
	const { showHint, clearHint } = useStatusHint();

	const filter = ref<number | null>(null);
	const patch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));
	const count = computed(() => slotsStore.morphLimit(uiStore.slotInFocus, uiStore.variation).count);

	// VA before FX, modules in canvas order (column, then row), then param and group.
	const rows = computed(() => {
		const p = patch.value;
		const pos = (a: MorphAssignment) => {
			const m = p ? findModuleByIndex(p.areas[a.location === 0 ? 0 : 1].modules, a.moduleIndex) : undefined;
			return [a.location === 0 ? 1 : 0, m?.horiz ?? 0, m?.vert ?? 0, a.paramIndex, a.groupIndex];
		};
		return slotsStore
			.getMorphAssignments(uiStore.slotInFocus, uiStore.variation)
			.filter((a) => filter.value === null || a.groupIndex === filter.value)
			.map((a) => ({ a, pos: pos(a), ...assignmentNames(p, a) }))
			.sort((x, y) => {
				const i = x.pos.findIndex((v, k) => v !== y.pos[k]);
				return i < 0 ? 0 : x.pos[i] - y.pos[i];
			});
	});

	async function select(a: MorphAssignment) {
		await revealModule(a.location === 0 ? 'fx' : 'voice', a.moduleIndex);
		uiStore.setSelectedParam(a.moduleIndex, a.paramIndex);
	}

	function deassign(a: MorphAssignment) {
		slotsStore.deassignParamFromMorphGroup(uiStore.slotInFocus, uiStore.variation, a.groupIndex, a.location as 0 | 1, a.moduleIndex, a.paramIndex);
	}
</script>
