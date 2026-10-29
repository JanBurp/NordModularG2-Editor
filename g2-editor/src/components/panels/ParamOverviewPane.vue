<template>
	<div class="flex flex-col h-full overflow-hidden text-xs text-content-primary bg-surface-0">
		<!-- Button row (same buttons as the original editor's Parameter Overview window) -->
		<div class="flex flex-wrap gap-1 p-2 border-b border-line-default shrink-0">
			<Button variant="default" size="small" :disabled="midiTargets.every((t) => ccFor(t) !== undefined)" @click="assignMidi">Assign MIDI</Button>
			<Button variant="default" size="small" :disabled="midiTargets.every((t) => ccFor(t) === undefined)" @click="clearMidi">Clear MIDI</Button>
			<div class="flex-1" />
			<Button variant="toggle" size="small" :active="viewMidi" @click="viewMidi = !viewMidi">View MIDI</Button>
			<Button variant="toggle" size="small" :active="viewButtons" @click="viewButtons = !viewButtons">View Buttons</Button>
			<Button variant="toggle" size="small" :active="uiStore.globalPagesActive" @click="toggleGlobalPages()">Global Pages</Button>
		</div>

		<!-- Pages A-E, each with banks 1-3 of 8 knobs -->
		<div class="flex-1 overflow-y-auto select-none p-2 flex flex-col gap-2">
			<div v-for="(letter, page) in PAGE_LETTERS" :key="letter">
				<div class="mb-0.5">
					<span class="text-content-muted mr-1">{{ letter }}</span>
					<span class="text-content-secondary">{{ PAGE_NAMES[page] }}</span>
				</div>
				<div class="border border-line-default rounded-xs px-1.5 py-1 flex flex-col gap-1">
					<div v-for="bank in BANK_COUNT" :key="bank" class="flex items-end gap-1.5">
						<span class="w-2 text-content-muted pb-0.5">{{ bank }}</span>
						<div class="flex-1 grid grid-cols-4 gap-2">
							<div v-for="pair in 4" :key="pair" class="grid grid-cols-2 gap-1">
								<div
									v-for="cell in pages[page][bank - 1].slice((pair - 1) * 2, pair * 2)"
									:key="cell.slotIndex"
									class="min-w-0 cursor-grab"
									:data-cell-slot="cell.slotIndex"
									:data-cell-global="uiStore.globalPagesActive ? '' : undefined"
									draggable="true"
									@dragstart="onKnobDragStart(cell, $event)"
									@dragover.prevent
									@drop.prevent="onKnobDrop(cell, $event)"
									@contextmenu.prevent="onCellContextMenu(cell, $event)"
									@mouseenter="showHint('paramPageDisplay')"
									@mouseleave="clearHint"
								>
									<div class="truncate font-bold text-center">{{ cell.moduleHeader }}</div>
									<VuMeterBar v-if="cell.assignment?.isLed && !viewMidi && !viewButtons" :value="cell.value" :label="cell.paramLabel" />
									<div v-else class="param-display px-0! text-[11px]" :class="{ 'param-display-empty': !cell.assignment }">
										{{ displayText(cell) }}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed } from 'vue';
	import Button from '../toolbar/Button.vue';
	import VuMeterBar from '../common/VuMeterBar.vue';
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { useParamPageCells, BLANK, type Cell } from '../../composables/useParamPageCells';
	import { useStatusHint } from '../../composables/useStatusHint';
	import { PAGE_LETTERS, PAGE_NAMES, BANK_COUNT, knobMapParams } from '../../renderer/paramPages';
	import type { SlotLabel } from '../../types';

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const { showHint, clearHint } = useStatusHint();
	const {
		assignmentSlot,
		resolveModule,
		buttonParamIndexFor,
		currentAssignments,
		buildPageCells,
		toggleGlobalPages,
		onCellContextMenu,
		onKnobDragStart,
		onKnobDrop,
	} = useParamPageCells();

	const viewMidi = ref(false);
	const viewButtons = ref(false);

	// pages[page][bank] = the 8 cells of that page/bank row
	const pages = computed(() => PAGE_LETTERS.map((_, page) => Array.from({ length: BANK_COUNT }, (_, bank) => buildPageCells(bank, page))));

	type ParamTarget = { slot: SlotLabel; location: 0 | 1 | 2; moduleIndex: number; paramIndex: number };

	function ccFor(t: ParamTarget): number | undefined {
		return slotsStore.slots[t.slot].controllers.find((c) => c.location === t.location && c.moduleIndex === t.moduleIndex && c.paramIndex === t.paramIndex)
			?.cc;
	}

	function displayText(cell: Cell): string {
		const a = cell.assignment;
		if (!a) return BLANK;
		if (viewButtons.value && !cell.hasButton) return BLANK;
		if (viewMidi.value) {
			if (a.isLed) return BLANK;
			const paramIndex = viewButtons.value ? cell.buttonParamIndex : a.paramIndex;
			const cc = ccFor({ slot: assignmentSlot(a), location: a.location, moduleIndex: a.moduleIndex, paramIndex });
			return cc === undefined ? '---' : `CC# ${cc}`;
		}
		return viewButtons.value ? cell.buttonLabel : cell.paramLabel;
	}

	const midiTargets = computed(() =>
		knobMapParams(currentAssignments(), assignmentSlot, (a) => buttonParamIndexFor(a, resolveModule(a))).filter((t) => t.slot),
	);

	function bySlot(targets: ParamTarget[]): Map<SlotLabel, ParamTarget[]> {
		const map = new Map<SlotLabel, ParamTarget[]>();
		for (const t of targets) map.set(t.slot, [...(map.get(t.slot) ?? []), t]);
		return map;
	}

	// Assigns the lowest free CC to every knob-mapped param that has none yet, in knob order.
	async function assignMidi() {
		for (const [slot, targets] of bySlot(midiTargets.value.filter((t) => ccFor(t) === undefined))) {
			await slotsStore.autoAssignMidiCC(slot, targets);
		}
	}

	// Reversal of Assign MIDI: removes only the CCs on knob-mapped params, not every CC in the patch.
	async function clearMidi() {
		for (const [slot, targets] of bySlot(midiTargets.value)) {
			const ccs = targets.map(ccFor).filter((cc) => cc !== undefined);
			if (ccs.length > 0) await slotsStore.deassignMidiCCs(slot, ccs);
		}
	}
</script>
