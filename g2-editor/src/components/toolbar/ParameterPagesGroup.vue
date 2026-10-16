<template>
	<ToolBarLabel v-if="!compact">Param<br />Pages:</ToolBarLabel>
	<div class="flex items-center gap-4" :class="{ 'ml-2 gap-2!': compact }">
		<div
			v-for="cell in cells"
			:key="cell.slotIndex"
			class="flex flex-col items-center w-16 gap-1 select-none cursor-pointer"
			:class="{ 'w-14!': compact }"
			:data-cell-slot="cell.slotIndex"
			:data-cell-global="uiStore.globalPagesActive ? '' : undefined"
			:draggable="altHeld"
			@dragstart="onKnobDragStart(cell, $event)"
			@contextmenu.prevent="onCellContextMenu(cell, $event)"
			@dragover.prevent
			@drop.prevent="onKnobDrop(cell, $event)"
		>
			<span class="text-xs w-full truncate text-center font-bold">{{ cell.moduleHeader }}</span>

			<!-- The display box is always a drag source (click-and-hold, like the original editor's
			     Parameter Overview); its dragstart bubbles to the cell's @dragstart handler. -->
			<div
				class="param-display w-full"
				:class="{ 'param-display-empty': !cell.assignment }"
				draggable="true"
				@mouseenter="showHint('paramPageDisplay')"
				@mouseleave="clearHint"
			>
				<div class="text-xs truncate">{{ cell.paramLabel }}</div>
				<div class="text-xs truncate">{{ cell.valueLabel }}</div>
			</div>

			<!-- The whole cell column is both the Alt+drag source (:draggable/@dragstart above) and the drop
			     target (data-cell-slot, @drop above); style.css's .alt-assign rules give it the grab cursor.
			     The Knob inside goes pointer-events-none under Alt, so the gesture never races useKnob.ts's
			     value-drag. Empty slots drag too: dropping one on a canvas param assigns that param here. -->
			<div
				@mousedown.capture="onKnobMorphMouseDown(cell, $event)"
				@mouseenter="showHint('paramPageKnob')"
				@mouseleave="clearHint"
				class="-mb-1"
				:class="{ 'opacity-40': !cell.assignment }"
			>
				<!-- Unassigned slots render the same Knob, just at value 0, dimmed and inert (the display
				     box above stays at full strength so the empty slots remain visible). The wrapper keeps its own pointer events, so the assign
				     drag/drop still works on empty cells. -->
				<Knob
					:value="cell.value"
					:class="{ 'pointer-events-none': altHeld || !cell.assignment || cell.assignment.isLed }"
					:colorVariant="cell.morphColor"
					:morphRange="cell.morphRange"
					:max="cell.high"
					:default-value="cell.defaultValue"
					@change="(v) => onKnobChange(cell.assignment!, v)"
				/>
			</div>

			<!-- hasButton is false for unassigned cells too, so it alone gates the button's liveness
			     and dimming. -->
			<template v-if="!compact">
				<span class="text-xs w-full truncate text-center" :class="{ 'opacity-40': !cell.hasButton }">{{ cell.buttonLabel }}</span>
				<div
					class="btn btn-xs w-full truncate text-center"
					:class="{ 'opacity-40': !cell.hasButton, 'pointer-events-none': altHeld || !cell.hasButton }"
					@mousedown="onButtonMouseDown(cell)"
					@click="onButtonClick(cell)"
				>
					{{ cell.buttonValueLabel }}
				</div>
			</template>
		</div>
	</div>

	<div class="self-stretch flex flex-col justify-between py-0.5">
		<Button variant="toggle" :active="uiStore.globalPagesActive" @click="onToggleGlobalPages()" data-testid="global-pages-toggle"> Global </Button>

		<BtnGroup
			:model-value="(uiStore.globalPagesActive ? uiStore.selectedGlobalParamBank : uiStore.selectedParamBank) + 1"
			:options="bankOptions"
			variant="variation"
			testIdPrefix="param-bank"
			@update:model-value="(v) => onBankSelect((v as number) - 1)"
		/>
	</div>
	<div class="flex gap-2">
		<BtnGroup
			:model-value="uiStore.globalPagesActive ? uiStore.displayedGlobalParamPage : uiStore.displayedParamPage"
			:options="pageOptions"
			variant="variation"
			:size="compact ? 'xs' : 'normal'"
			vertical
			testIdPrefix="param-page"
			@update:model-value="(v) => onPageSelect(v as number)"
			class="w-8"
		/>
		<div v-if="!compact" class="flex flex-col text-content-muted">
			<div v-for="name in PAGE_NAMES" :key="name">{{ name }}</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import BtnGroup from './BtnGroup.vue';
	import Button from './Button.vue';
	import Knob from '../common/Knob.vue';

	const { compact = false } = defineProps<{ compact?: boolean }>();
	import { useSlotsStore } from '../../store/slots';
	import { useUiStore } from '../../store/ui';
	import { useAltHeld } from '../../composables/useParamPageAssign';
	import { useParamPageCells, type Cell, type PageAssignment } from '../../composables/useParamPageCells';
	import { useMorphRangeDrag } from '../../composables/useMorphRangeDrag';
	import { useStatusHint } from '../../composables/useStatusHint';
	import { isGrabModifierPressed } from '../../utils/platform';
	import { PAGE_LETTERS, PAGE_NAMES } from '../../renderer/paramPages';
	import { isSwitch, isSpinner, isSpinnerH } from '../../utils/moduleControls';
	import { clamp } from '../../utils/math';

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const { altHeld } = useAltHeld();
	const { startDrag: startMorphRangeDrag } = useMorphRangeDrag();
	const { showHint, clearHint } = useStatusHint();
	const {
		assignmentSlot,
		resolveModule,
		buildPageCells,
		toggleGlobalPages: onToggleGlobalPages,
		onCellContextMenu,
		onKnobDragStart,
		onKnobDrop,
	} = useParamPageCells();

	const pageOptions = PAGE_LETTERS.map((label, value) => ({ label, value }));
	const bankOptions = [1, 2, 3];

	const cells = computed<Cell[]>(() =>
		uiStore.globalPagesActive
			? buildPageCells(uiStore.selectedGlobalParamBank, uiStore.displayedGlobalParamPage)
			: buildPageCells(uiStore.selectedParamBank, uiStore.displayedParamPage),
	);

	// The G2's own A-E / 1-3 buttons are the same selection: push it to the hardware so the front
	// panel follows the toolbar. Optimistic — the ui-store value is set first, exactly like
	// handleVariationClick in useSlotManagement.ts. selectParamPage is a no-op when offline, and the
	// device's echo (param_page_change, handled in useSlotEvents.ts) writes the identical value back,
	// so there's nothing to suppress. Both selectors send the whole page byte, hence one shared push.
	function pushParamPage() {
		if (uiStore.globalPagesActive) {
			slotsStore.selectGlobalParamPage(uiStore.selectedGlobalParamBank, uiStore.displayedGlobalParamPage);
		} else {
			slotsStore.selectParamPage(uiStore.selectedParamBank, uiStore.displayedParamPage);
		}
	}

	function onBankSelect(bank: number) {
		if (uiStore.globalPagesActive) uiStore.setSelectedGlobalParamBank(bank);
		else uiStore.setSelectedParamBank(bank);
		pushParamPage();
	}

	function onPageSelect(page: number) {
		if (uiStore.globalPagesActive) uiStore.setDisplayedGlobalParamPage(page);
		else uiStore.setDisplayedParamPage(page);
		pushParamPage();
	}

	function onKnobChange(a: PageAssignment, value: number) {
		const areaKey = a.location === 1 ? 'voice' : 'fx';
		slotsStore.setParam(a.moduleIndex, a.paramIndex, value, uiStore.variation, areaKey, false, assignmentSlot(a));
	}

	// Cmd(mac)/Ctrl-drag a knob to set its morph range for the currently-selected toolbar group,
	// mirroring Module.vue's onParamMorphMouseDown exactly (same useMorphRangeDrag.ts gesture: a plain
	// Cmd/Ctrl+click toggles assign/deassign, dragging past the threshold sets the range instead).
	// Captured on the wrapper (not the Knob itself) so it fires before useKnob.ts's own value-drag —
	// startMorphRangeDrag no-ops (and doesn't stopPropagation) unless the grab modifier is actually held.
	function onKnobMorphMouseDown(cell: Cell, e: MouseEvent) {
		if (!cell.assignment || !isGrabModifierPressed(e)) return;
		const a = cell.assignment;
		const slot = assignmentSlot(a);
		const groupIndex = uiStore.selectedMorphGroup;
		const variation = uiStore.variation;
		// Buttons/switches/spinners always get the fixed max range (no drag needed for those) — same
		// rule Module.vue applies, based on the knob's own param (not buttonParamIndex).
		const param = resolveModule(a)?.moduleDef?.params?.[a.paramIndex];
		const isFixedRange = param ? isSwitch(param.n) || isSpinner(param.n) || isSpinnerH(param.n) : false;
		startMorphRangeDrag(a.moduleIndex, a.paramIndex, a.location === 1 ? 'va' : 'fx', e, {
			isAssigned: () => cell.morphColor === 'red',
			getRange: () => cell.morphRange ?? 0,
			// Freshly assigned params start at the full parameter range (matches the real editor); the
			// user then Cmd/Ctrl-drags to narrow it.
			onAssign: () => slotsStore.assignParamToMorphGroup(slot, variation, groupIndex, a.location, a.moduleIndex, a.paramIndex, 127),
			onDeassign: () => slotsStore.deassignParamFromMorphGroup(slot, variation, groupIndex, a.location, a.moduleIndex, a.paramIndex),
			onRangeChange: isFixedRange
				? undefined
				: (range) => slotsStore.setMorphAssignmentRange(slot, variation, groupIndex, a.location, a.moduleIndex, a.paramIndex, range),
		});
	}

	// buttonParamIndex may differ from a.paramIndex (see buttonParamIndexFor in useParamPageCells.ts) — write
	// to whichever param the button actually targets, not necessarily the knob's own.
	function onButtonChange(a: PageAssignment, buttonParamIndex: number, value: number) {
		const areaKey = a.location === 1 ? 'voice' : 'fx';
		slotsStore.setParam(a.moduleIndex, buttonParamIndex, value, uiStore.variation, areaKey, false, assignmentSlot(a));
	}

	// Mirrors useSwitch.ts's isTrigger handling exactly (same composable ModuleSwitch.vue uses on
	// canvas): a momentary trigger param (parammap.ts's `trigger: true`, e.g. TrigBtn) is pressed
	// (1) on mousedown and released (0) on mouseup — sending a single "cycled" value on click, as
	// non-trigger params do below, doesn't match how the device actually treats it and the optimistic
	// echo-confirmation never matches what the device reports back.
	// Release is listened for on window so letting go outside the button (or the app window) still sends 0.
	function onButtonMouseDown(cell: Cell) {
		const a = cell.assignment;
		if (!a || !cell.buttonIsTrigger) return;
		onButtonChange(a, cell.buttonParamIndex, 1);
		window.addEventListener('mouseup', () => onButtonChange(a, cell.buttonParamIndex, 0), { once: true });
	}

	// Non-trigger params (e.g. OffOnBlank) cycle through their [low, high] range on click, mirroring
	// useSwitch.ts's onCycleValue.
	function onButtonClick(cell: Cell) {
		if (!cell.assignment || cell.buttonIsTrigger) return;
		const { buttonLow: low, buttonHigh: high } = cell;
		const range = high - low + 1;
		const current = clamp(cell.buttonValue, low, high);
		onButtonChange(cell.assignment, cell.buttonParamIndex, low + ((current - low + 1) % range));
	}
</script>
