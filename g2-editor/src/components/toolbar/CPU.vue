<template>
	<div
		class="relative bg-surface-2 rounded px-2 flex cursor-pointer"
		:class="mini ? 'h-6 gap-3 items-center' : 'h-full py-1 flex-col justify-around'"
		data-testid="load-meter"
		@click="detailsOpen = !detailsOpen"
		@mouseenter="showHint('loadMeter')"
		@mouseleave="
			clearHint();
			detailsOpen = false;
		"
	>
		<div class="flex gap-1 items-center">
			<span class="w-4 text-xs text-content-secondary">VA</span>
			<CPUpart :value="va.cycles" :large="!mini" />
			<CPUpart :value="va.memory" :large="!mini" />
			<span v-if="!compact && !mini" class="text-[10px] text-content-muted ml-1 whitespace-nowrap" data-testid="area-counts-va"
				>{{ va.modules }}m/{{ va.cables }}c</span
			>
		</div>
		<div class="flex gap-1 items-center">
			<span class="w-4 text-xs text-content-secondary">FX</span>
			<CPUpart :value="fx.cycles" :large="!mini" />
			<CPUpart :value="fx.memory" :large="!mini" />
			<span v-if="!compact && !mini" class="text-[10px] text-content-muted ml-1 whitespace-nowrap" data-testid="area-counts-fx"
				>{{ fx.modules }}m/{{ fx.cables }}c</span
			>
		</div>
		<!-- Per-resource breakdown, as in the early official Patch Settings dialog ("Resources used, PVA / CVA in %") -->
		<table
			v-if="detailsOpen"
			class="z-50 absolute top-full left-0 bg-surface-2 border border-line-default rounded text-[11px] font-mono cursor-default"
			data-testid="load-details"
			@click.stop
		>
			<thead>
				<tr class="text-content-secondary">
					<th class="px-2 py-0.5 text-left font-normal">%</th>
					<th class="px-2 py-0.5 text-right font-normal">VA</th>
					<th class="px-2 py-0.5 text-right font-normal">FX</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="row in rows" :key="row.label">
					<td class="px-2 text-left text-content-secondary whitespace-nowrap">{{ row.label }}</td>
					<td v-for="(value, i) in row.values" :key="i" class="px-2 text-right" :class="valueClass(value, row.critical[i])">
						{{ value.toFixed(1) }}
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<script setup lang="ts">
	import { computed, ref } from 'vue';
	import CPUpart from './CPUpart.vue';
	import { useSlotsStore, type MemoryUsage } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { areaConfig } from '../../store/slotHelpers';
	import { useStatusHint } from '@/composables/useStatusHint';

	withDefaults(defineProps<{ compact?: boolean; mini?: boolean }>(), { compact: false, mini: false });

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const { showHint, clearHint } = useStatusHint();
	const detailsOpen = ref(false);

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.slotInFocus));

	function areaCount(area: 'voice' | 'fx', type: 'modules' | 'cables'): number {
		const i = areaConfig(area).areaIdx;
		return type === 'modules' ? (currentPatch.value?.areas?.[i]?.modules?.length ?? 0) : (currentPatch.value?.areas?.[i]?.cableList?.length ?? 0);
	}

	const va = computed(() => ({
		...slotsStore.activeSlotResources.va,
		modules: areaCount('voice', 'modules'),
		cables: areaCount('voice', 'cables'),
	}));
	const fx = computed(() => ({
		...slotsStore.activeSlotResources.fx,
		modules: areaCount('fx', 'modules'),
		cables: areaCount('fx', 'cables'),
	}));

	// Row names from the early official Patch Settings dialog; Q mem and R mem were not in it.
	const MEMORY_ROWS: [keyof MemoryUsage, string][] = [
		['pmem', 'Prog mem'],
		['xmem', 'X mem'],
		['ymem', 'Y mem'],
		['zpmem', 'Zero page'],
		['ram', 'Dyn mem'],
		['qmem', 'Q mem'],
		['rmem', 'R mem'],
	];

	// critical marks what each meter shows, per area: cycles, and the memory type at the maximum
	const rows = computed(() => [
		{ label: 'Cycles', values: [va.value.cycles, fx.value.cycles], critical: [va.value.cycles > 0, fx.value.cycles > 0] },
		...MEMORY_ROWS.map(([key, label]) => ({
			label,
			values: [va.value.mem[key], fx.value.mem[key]],
			critical: [va.value.memory > 0 && va.value.mem[key] === va.value.memory, fx.value.memory > 0 && fx.value.mem[key] === fx.value.memory],
		})),
	]);

	function valueClass(value: number, critical: boolean): string {
		if (value > 100) return 'text-red-500';
		return critical ? 'text-content-secondary' : 'text-content-muted';
	}
</script>
