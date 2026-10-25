<template>
	<g
		v-if="moduleDef"
		:transform="`translate(${x}, ${y})`"
		class="cursor-default"
		:class="{ selected: isSelected, unused: isUnused, 'search-dimmed': searchState === 'dimmed' }"
		:data-module-idx="moduleIdx"
		:data-module-short="moduleDef.short"
		@click.stop="onModuleClick"
		@mousedown.stop
		@contextmenu.stop.prevent="onContextMenu"
	>
		<ModuleBackground :height="height" :colour="instance.colour || 0"></ModuleBackground>

		<ModuleTitle
			:displayName="displayName"
			:is-name="instance.type == 126"
			:selected="isSelected ?? false"
			:search-match="searchMatchOf(`module:${searchArea}:${moduleIdx}`)"
			:has-replace-trigger="replaceCandidates.length > 0"
		></ModuleTitle>

		<!-- Drag handle: title row only, transparent, cursor grab -->
		<rect
			width="256"
			height="18"
			fill="transparent"
			style="cursor: grab"
			data-drag-handle="true"
			@mousedown.stop.prevent="onDragHandleMousedown"
			@dblclick.stop.prevent="onTitleDblClick"
			@mouseenter="onTitleHoverEnter"
			@mouseleave="onTitleHoverLeave"
		/>

		<!-- Replace-module trigger: shown only when other modules in this module's group exist. Hit area (17x17) is ~1.5x the visual chevron so it's easy to click. -->
		<template v-if="replaceCandidates.length > 0">
			<rect
				data-testid="module-replace-trigger"
				width="17"
				height="17"
				fill="transparent"
				style="cursor: pointer"
				@mousedown.stop
				@click.stop="onReplaceTriangleClick"
				@mouseenter="onReplaceTriangleHoverEnter"
				@mouseleave="onReplaceTriangleHoverLeave"
			/>
			<path d="M3.5,2 L13.5,2 L8.5,7 Z" :fill="getCategoryColor(moduleDef.page?.name ?? '')" pointer-events="none" />
		</template>

		<!-- Visual elements from ve array -->
		<template v-for="entry in visualElementsGroupedLeds" :key="entry.key">
			<ModuleVeText v-if="entry.ve.type === 'text'" :ve="entry.ve"></ModuleVeText>
			<ModuleVeLine v-else-if="entry.ve.type === 'line'" :ve="entry.ve"></ModuleVeLine>
			<ModuleVePaths v-else-if="entry.ve.type === 'path'" :ve="entry.ve"></ModuleVePaths>
			<DrumSynthPresetSelector
				v-else-if="entry.ve.type === 'graph' && instance.type === 58"
				:ve="entry.ve"
				:lv="localLv"
				@apply="onDrumSynthPresetApply"
			/>
			<VocoderPresetSelector
				v-else-if="entry.ve.type === 'graph' && instance.type === 108 && entry.ve.w === 154 && entry.ve.h === 12"
				:ve="entry.ve"
				@apply="onVocoderPresetApply"
			/>
			<ModuleGraph
				v-else-if="(entry.ve.type === 'graph' || entry.ve.type === 'graphenv') && entry.ve.w && entry.ve.h"
				:ve="entry.ve"
				:lv="localLv"
				:modes="instance.modes"
				:module-id="instance.type"
			/>
			<ModuleValueDisplay
				v-else-if="entry.ve.type === 'valueDisplay'"
				:ve="entry.ve"
				:params="moduleDef.params || []"
				:values="localLv"
				:modes="instance.modes"
				:modeDefs="moduleDef.modes || []"
				:override-text="instance.type === 68 && entry.ve.ref === 0 && localLv[2] === 1 ? 'MASTER' : undefined"
			/>
			<ModuleVeLed
				v-else-if="entry.ve.type === 'led' || entry.ve.type === 'ledArray'"
				:ve="entry.ve"
				:led-on="ledStateMap[entry.key]?.on ?? false"
				:active-step="ledStateMap[entry.key]?.step ?? 255"
			></ModuleVeLed>
			<ModuleBitmap v-else-if="entry.ve.type === 'bmp'" :ve="entry.ve"></ModuleBitmap>
			<g v-else-if="entry.ve.type === 'vu'" @contextmenu.stop.prevent="onVuContextMenu($event, entry.ve)">
				<LevelMeter :ve="entry.ve" :value="ledStateMap[entry.key]?.step ?? 0" />
			</g>
			<ModuleVeLed v-else-if="entry.ve.type === 'ledGroup'" :ve="entry.ve" :led-on="false" :active-step="ledStateMap[entry.key]?.step ?? 255" />
			<ModuleVeGroupLabel v-else-if="entry.ve.type === 'groupLabel'" :ve="entry.ve"></ModuleVeGroupLabel>
		</template>

		<!-- Modes -->
		<g class="modes">
			<ModuleMode
				v-for="(mode, index) in moduleDef.modes"
				:key="mode.name"
				:mode="mode"
				:value="getModeValue(index)"
				:param-index="index"
				:module-id="instance.type"
				:lv="localLv"
				@change="onModeChange"
			/>
		</g>

		<!-- Parameters -->
		<g class="params" @dragover="onParamDragOver" @drop="onParamDrop">
			<g
				v-for="(param, index) in moduleDef.params"
				:key="param.name"
				:data-param-index="index"
				:data-param-location="morphLocation"
				:data-module-index="moduleIdx"
				class="cursor-pointer"
				@mousedown.capture="onParamMorphMouseDown(index, $event)"
				@click="onParamShiftClick(param.n, index, $event)"
				@mouseenter="onParamHoverEnter(param.n, index, $event)"
				@mouseleave="onParamHoverLeave($event)"
			>
				<ModuleKnob
					v-if="isKnob(param.n)"
					:param="param"
					:value="getParamValue(index)"
					:param-index="index"
					:morph-color="morphColorFor(index)"
					:morph-range="morphRangeFor(index)"
					@change="onParamChange"
					@param-context-menu="onParamContextMenu"
				/>
				<ModuleSlider
					v-else-if="isSlider(param.n)"
					:param="param"
					:value="getParamValue(index)"
					:param-index="index"
					:highlight="index === keyTargetIndex"
					:morph-color="morphColorFor(index)"
					:morph-range="morphRangeFor(index)"
					@change="onParamChange"
					@param-context-menu="onParamContextMenu"
				/>
				<ModuleSwitch
					v-else-if="isSwitch(param.n)"
					:param="param"
					:value="getParamValue(index)"
					:label="getParamLabel(index)"
					:param-index="index"
					:highlight="index === keyTargetIndex"
					:search-matches="searchState && searchLabelMatches(index)"
					:morph-color="morphColorFor(index)"
					@change="onParamChange"
					@param-label-edit="(info) => emit('paramLabelEdit', { moduleIndex: moduleIdx, labelIndex: 0, ...info })"
					@param-context-menu="onParamContextMenu"
				/>
				<ModuleKnobSpin
					v-else-if="isSpinner(param.n)"
					:param="param"
					:value="getParamValue(index)"
					:param-index="index"
					:highlight="index === keyTargetIndex"
					:morph-color="morphColorFor(index)"
					@change="onParamChange"
					@param-context-menu="onParamContextMenu"
				/>
				<ModuleKnobSpinH
					v-else-if="isSpinnerH(param.n)"
					:param="param"
					:value="getParamValue(index)"
					:param-index="index"
					:highlight="index === keyTargetIndex"
					:morph-color="morphColorFor(index)"
					@change="onParamChange"
					@param-context-menu="onParamContextMenu"
				/>
				<SeqNoteStepStrip
					v-else-if="param.n === 'KnobSeqSlider'"
					:param-index="index"
					:value="getParamValue(index)"
					:x="param.x"
					:width="SEQNOTE_STEP_WIDTH"
					:strip-top="SEQNOTE_STRIP_TOP"
					:strip-height="SEQNOTE_STRIP_HEIGHT"
					:zoom="seqNotePianoRollView.zoom"
					:octave-offset="seqNotePianoRollView.octaveOffset"
					:highlight="index === keyTargetIndex"
					:morph-color="morphColorFor(index)"
					:morph-range="morphRangeFor(index)"
					@change="onParamChange"
					@param-context-menu="onParamContextMenu"
				/>
			</g>
		</g>

		<SeqNoteViewControls v-if="instance.type === 121" :view="seqNotePianoRollView" @change="onPianoRollViewChange" />

		<!-- Input jacks -->
		<ModuleJack
			v-for="(input, idx) in moduleDef.inputs"
			:key="`in-${input.name}`"
			:name="input.name"
			:colour="input.colour"
			:uprated="instance.uprate === 1"
			:x="input.x"
			:y="input.y"
			type="input"
			:moduleIndex="moduleIdx"
			:connectorIndex="idx"
			:connected="connectedInputs?.has(idx)"
			:armed="isArmedJack(idx, 'input')"
			@jackDragStart="onJackDragStart"
			@jackDragEnd="onJackDragEnd"
			@jackDeleteConnected="(info) => emit('jackDeleteConnected', info)"
			@jackBreakConnection="(info) => emit('jackBreakConnection', info)"
			@jackSetCableColor="(info) => emit('jackSetCableColor', info)"
			@jackHoverEnter="(info) => emit('jackHoverEnter', info)"
			@jackHoverLeave="(info) => emit('jackHoverLeave', info)"
		/>

		<!-- Output jacks -->
		<ModuleJack
			v-for="(output, idx) in moduleDef.outputs"
			:key="`out-${output.name}`"
			:name="output.name"
			:colour="output.colour"
			:uprated="instance.uprate === 1"
			:x="output.x"
			:y="output.y"
			type="output"
			:moduleIndex="moduleIdx"
			:connectorIndex="idx"
			:connected="connectedOutputs?.has(idx)"
			:armed="isArmedJack(idx, 'output')"
			@jackDragStart="onJackDragStart"
			@jackDragEnd="onJackDragEnd"
			@jackDeleteConnected="(info) => emit('jackDeleteConnected', info)"
			@jackBreakConnection="(info) => emit('jackBreakConnection', info)"
			@jackSetCableColor="(info) => emit('jackSetCableColor', info)"
			@jackHoverEnter="(info) => emit('jackHoverEnter', info)"
			@jackHoverLeave="(info) => emit('jackHoverLeave', info)"
		/>
		<!-- Patch Mutator: modules excluded from mutation get a red frame while the mutator is open (inset so neighbours don't hide it) -->
		<rect
			v-if="mutatorOpen && instance.mutaLock"
			x="1.5"
			y="1.5"
			width="253"
			:height="height - 3"
			fill="none"
			stroke="#e00"
			stroke-width="3"
			pointer-events="none"
		/>
	</g>
	<g v-else :transform="`translate(${x}, ${y})`">
		<rect width="256" height="32" fill="#666" stroke="#333" rx="2" />
		<text x="128" y="20" fill="#fff" font-size="10" text-anchor="middle"> Unknown Module ({{ instance.type }}) </text>
	</g>
</template>
<script setup lang="ts">
	import { computed, onUnmounted } from 'vue';
	import { useUiStore } from '../../store/ui';
	import { useStatusHint } from '../../composables/useStatusHint';
	import ModuleBackground from './ModuleBackground.vue';
	import ModuleKnob from './ModuleKnob.vue';
	import ModuleTitle from './ModuleTitle.vue';
	import ModuleSlider from './ModuleSlider.vue';
	import ModuleSwitch from './ModuleSwitch.vue';
	import ModuleMode from './ModuleMode.vue';
	import ModuleJack from './ModuleJack.vue';
	import ModuleGraph from './ModuleGraph.vue';
	import DrumSynthPresetSelector from './DrumSynthPresetSelector.vue';
	import VocoderPresetSelector from './VocoderPresetSelector.vue';
	import SeqNoteStepStrip from './SeqNoteStepStrip.vue';
	import SeqNoteViewControls from './SeqNoteViewControls.vue';
	import { useSeqNotePianoRoll } from '../../composables/useSeqNotePianoRoll';
	import { SEQNOTE_STRIP_TOP, SEQNOTE_STRIP_HEIGHT, SEQNOTE_STEP_WIDTH, type PianoRollView } from '../../renderer/pianoRoll';
	import { getAssignableParams, getModule, getReplaceCandidates } from '../../renderer/nmg2mods';
	import { getCategoryColor } from '../../constants/moduleCategoryColors';
	import { useModuleGraphics } from '../../composables/useModuleGraphics';
	import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '../../constants/ui';
	import { isKnob, isSlider, isSwitch, isSpinner, isSpinnerH } from '../../utils/moduleControls';
	import { useModuleParams } from '../../composables/useModuleParams';
	import ModuleVeText from './ModuleVeText.vue';
	import ModuleVeLine from './ModuleVeLine.vue';
	import ModuleVePaths from './ModuleVePaths.vue';
	import ModuleVeLed from './ModuleVeLed.vue';
	import ModuleVeGroupLabel from './ModuleVeGroupLabel.vue';
	import ModuleBitmap from './ModuleBitmap.vue';
	import LevelMeter from './LevelMeter.vue';
	import ModuleValueDisplay from './ModuleValueDisplay.vue';
	import ModuleKnobSpin from './ModuleKnobSpin.vue';
	import ModuleKnobSpinH from './ModuleKnobSpinH.vue';
	import type { ModuleInstance, ModuleDefinition, JackDragInfo, ContextMenuItem, VisualElement } from '../../types';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { useParamEditDialog } from '../../composables/useParamEditDialog';
	import { buildColorSwatches } from '../../utils/colorSwatches';
	import { useLedStore } from '../../store/led';
	import { useSlotsStore } from '../../store/slots';
	import { useSettingsStore } from '../../store/settings';
	import { useDeviceStore } from '../../store/device';
	import { buildCCMenuItems } from '../../composables/useMidiCC';
	import { parseDragPayload } from '../../utils/dragPayload';
	import { buildMorphMenuItems } from '../../composables/useMorphAssign';
	import {
		buildParamPageMenuItems,
		buildGlobalParamPageMenuItems,
		buildModuleAssignMenuItems,
		buildGlobalModuleAssignMenuItems,
	} from '../../composables/useParamPageAssign';
	import { startParamPageDrag } from '../../composables/useParamPageDrag';
	import { useMorphRangeDrag } from '../../composables/useMorphRangeDrag';
	import { isGrabModifierPressed } from '../../utils/platform';
	import { blurFocusedControl } from '../../utils/focus';
	import { useSearchReplace } from '../../composables/useSearchReplace';

	const props = defineProps<{
		instance?: ModuleInstance;
		isSelected?: boolean;
		isUnused?: boolean;
		connectedInputs?: Set<number>;
		connectedOutputs?: Set<number>;
		areaLabel?: 'fx' | 'va';
	}>();

	const emit = defineEmits<{
		paramChange: [moduleIndex: number, paramIndex: number, value: number, immediate?: boolean];
		modeChange: [moduleIndex: number, index: number, value: number];
		jackDragStart: [info: JackDragInfo, e: MouseEvent];
		jackDragEnd: [info: JackDragInfo];
		moduleDragStart: [info: { moduleIndex: number; clientX: number; clientY: number }];
		moduleLabelEdit: [info: { moduleIndex: number; currentLabel: string }];
		moduleDelete: [moduleIndex: number];
		modulePasteParams: [moduleIndex: number];
		moduleColorChange: [moduleIndex: number, colourId: number];
		moduleReplace: [moduleIndex: number, newTypeId: number];
		jackDeleteConnected: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
		jackBreakConnection: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
		jackSetCableColor: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colorId: number }];
		jackHoverEnter: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
		jackHoverLeave: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
		paramLabelEdit: [info: { moduleIndex: number; paramIndex: number; currentLabel: string; labelIndex: number }];
	}>();

	const { open: openContextMenu } = useContextMenu();
	const { openParamEdit } = useParamEditDialog();
	const { graphics } = useModuleGraphics();

	function onModuleClick(e: MouseEvent) {
		if (e.altKey) onContextMenu(e);
	}

	function onContextMenu(e: MouseEvent) {
		const slot = uiStore.slotInFocus;
		const location = props.areaLabel === 'va' ? 1 : 0;
		const paramIndices = moduleDef.value ? getAssignableParams(moduleDef.value) : [];
		openContextMenu(e, [
			{ label: 'Rename…', action: () => onTitleDblClick() },
			{ type: 'separator' },
			...buildModuleAssignMenuItems({ slot, location, moduleIndex: moduleIdx.value, paramIndices }),
			...buildGlobalModuleAssignMenuItems({ slot, location, moduleIndex: moduleIdx.value, paramIndices }),
			{ type: 'separator' },
			{ label: 'Replace Module', disabled: replaceCandidates.value.length === 0, children: buildReplaceMenuItems() },
			{ label: 'Delete', action: () => emit('moduleDelete', moduleIdx.value) },
			{ label: `${instance.value.mutaLock ? '✓ ' : ''}Exclude From Mutation`, action: toggleMutaLock },
			{ type: 'separator' },
			{
				label: 'Paste Params',
				// uiStore.hasClipboard covers a copy made in another device's window too (OS
				// clipboard, see usePatchClipboard.ts) — buildPasteParamsPairs already filters out
				// any module-type mismatch, so an enabled-but-inapplicable paste is a safe no-op.
				disabled: !uiStore.hasClipboard,
				action: () => emit('modulePasteParams', moduleIdx.value),
			},
			{ type: 'separator' },
			{
				label: 'Set Color',
				children: [{ type: 'swatches', swatches: buildColorSwatches((id) => emit('moduleColorChange', moduleIdx.value, id)) }],
			},
			{ type: 'separator' },
			{ label: 'Show Help', action: () => uiStore.showModuleHelp(instance.value.type) },
		]);
	}

	// Applies to the whole selection when this module is part of it (manual ch. 7).
	function toggleMutaLock() {
		const inSelection = props.isSelected && uiStore.selectedModulesArea === props.areaLabel;
		const ids = inSelection ? uiStore.selectedModules : [moduleIdx.value];
		slotsStore.setMutationLock(ids, !instance.value.mutaLock, props.areaLabel === 'va' ? 'voice' : 'fx');
	}

	// Right-click on a level meter: assign it to a Parameter Page knob (isLed=1). The LED number the
	// hardware expects is the meter's GroupId in the original panel data; in every module that has
	// meters, GroupId rises with the meter's x position (e.g. 4-In: x153..231 = 0..3).
	function onVuContextMenu(e: MouseEvent, ve: VisualElement) {
		const slot = uiStore.slotInFocus;
		const location = props.areaLabel === 'va' ? 1 : 0;
		const ledNo = (moduleDef.value?.ve ?? [])
			.filter((v) => v.type === 'vu')
			.sort((a, b) => (a.x as number) - (b.x as number))
			.indexOf(ve);
		const existing = slotsStore.slots[slot].paramPages.find(
			(k) => k.isLed === 1 && k.location === location && k.moduleIndex === moduleIdx.value && k.paramIndex === ledNo,
		);
		openContextMenu(e, buildParamPageMenuItems({ slot, location, moduleIndex: moduleIdx.value, paramIndex: ledNo, existing, isLed: 1 }));
	}

	function onJackDragStart(info: JackDragInfo, e: MouseEvent) {
		emit('jackDragStart', info, e);
	}

	function onJackDragEnd(info: JackDragInfo) {
		emit('jackDragEnd', info);
	}

	function onDragHandleMousedown(e: MouseEvent) {
		emit('moduleDragStart', {
			moduleIndex: moduleIdx.value,
			clientX: e.clientX,
			clientY: e.clientY,
		});
	}

	function onTitleDblClick() {
		emit('moduleLabelEdit', {
			moduleIndex: moduleIdx.value,
			currentLabel: displayName.value,
		});
	}

	function onTitleHoverEnter() {
		showHint('moduleTitle');
	}
	function onTitleHoverLeave() {
		clearHint();
	}

	const instance = computed(() => props.instance as ModuleInstance);
	const moduleIdx = computed(() => instance.value.index || 0);

	function isArmedJack(connectorIndex: number, type: 'input' | 'output'): boolean {
		const a = uiStore.armedJack;
		if (!a) return false;
		const areaIdx = props.areaLabel === 'va' ? 1 : 0;
		return a.moduleIndex === moduleIdx.value && a.connectorIndex === connectorIndex && a.type === type && (a.area ?? 0) === areaIdx;
	}

	const moduleDef = computed<ModuleDefinition | null>(() => {
		return getModule(instance.value.type) || null;
	});

	const replaceCandidates = computed<ModuleDefinition[]>(() => getReplaceCandidates(instance.value.type, props.areaLabel === 'va' ? 'voice' : 'fx'));

	function buildReplaceMenuItems(): ContextMenuItem[] {
		return replaceCandidates.value.map((def) => ({
			label: def.long,
			icon: graphics.value[def.id],
			action: () => emit('moduleReplace', moduleIdx.value, def.id),
		}));
	}

	function onReplaceTriangleClick(e: MouseEvent) {
		openContextMenu(e, buildReplaceMenuItems());
	}

	function onReplaceTriangleHoverEnter() {
		showHint('moduleReplace');
	}
	function onReplaceTriangleHoverLeave() {
		clearHint();
	}

	const visualElementsGroupedLeds = computed(() => {
		if (!moduleDef.value?.ve) return [];
		const entries: { ve: any; key: string }[] = [];
		let ledIdx = 0;
		let ledArrayIdx = 0;
		let vuIdx = 0;
		let ledGroupIdx = 0;
		let veIdx = 0;
		for (const ve of moduleDef.value.ve) {
			if (ve.type === 'led') {
				entries.push({ ve, key: `led-${ledIdx}` });
				ledIdx++;
			} else if (ve.type === 'ledArray') {
				entries.push({ ve, key: `ledArray-${ledArrayIdx}` });
				ledArrayIdx++;
			} else if (ve.type === 'vu') {
				entries.push({ ve, key: `vu-${vuIdx}` });
				vuIdx++;
			} else if (ve.type === 'ledGroup') {
				entries.push({ ve, key: `ledGroup-${ledGroupIdx}` });
				ledGroupIdx++;
			} else {
				entries.push({ ve, key: `ve-${veIdx}` });
				veIdx++;
			}
		}
		return entries;
	});

	const ledStore = useLedStore();
	const ledStateMap = computed(() => {
		const area = props.areaLabel || 'fx';
		const idx = moduleIdx.value;
		const map: Record<string, { on: boolean; step: number }> = {};
		for (const entry of visualElementsGroupedLeds.value) {
			if (entry.ve.type === 'led' || entry.ve.type === 'ledArray' || entry.ve.type === 'vu' || entry.ve.type === 'ledGroup') {
				map[entry.key] = {
					on: ledStore.getLedState(area, idx, entry.key),
					step: ledStore.getStripValue(area, idx, entry.key),
				};
			}
		}
		return map;
	});

	const x = computed(() => (instance.value.horiz || 0) * MODULE_WIDTH);
	const y = computed(() => (instance.value.vert || 0) * MODULE_ROW_HEIGHT);

	const search = useSearchReplace();
	const searchArea = computed(() => (props.areaLabel === 'va' ? 'voice' : 'fx'));
	const searchState = computed(() => search.moduleState(searchArea.value, moduleIdx.value));
	function searchMatchOf(key: string): 'current' | 'match' | null {
		if (!searchState.value) return null;
		return search.currentKey.value === key ? 'current' : search.matchKeys.value.has(key) ? 'match' : null;
	}
	// Per matching button of a labelled switch: its labelIndex and whether it's the current match.
	function searchLabelMatches(paramIndex: number): { labelIndex: number; current: boolean }[] {
		const labels = moduleDef.value?.params?.[paramIndex]?.label ?? [];
		return labels.flatMap((_, labelIndex) => {
			const m = searchMatchOf(`param:${searchArea.value}:${moduleIdx.value}:${paramIndex}:${labelIndex}`);
			return m ? [{ labelIndex, current: m === 'current' }] : [];
		});
	}

	const displayName = computed(() => {
		if (typeof instance.value.uname !== 'undefined') return instance.value.uname;
		return moduleDef.value?.short || 'Module';
	});

	const height = computed(() => {
		return (moduleDef.value?.height || 2) * MODULE_ROW_HEIGHT;
	});

	const { localLv, getParamValue, getParamLabel, onParamChange, getModeValue, onModeChange } = useModuleParams(
		instance,
		moduleDef,
		props.areaLabel ?? 'fx',
		(moduleIndex, paramIndex, value, immediate) => emit('paramChange', moduleIndex, paramIndex, value, immediate),
		(moduleIndex, index, value) => emit('modeChange', moduleIndex, index, value),
	);

	const { view: seqNotePianoRollView } = useSeqNotePianoRoll(instance);

	const uiStore = useUiStore();
	const { showHint, clearHint } = useStatusHint();
	const slotsStore = useSlotsStore();
	const settingsStore = useSettingsStore();
	const mutatorOpen = computed(() => settingsStore.showRightPane && settingsStore.rightPaneTab === 'mutator');
	const deviceStore = useDeviceStore();

	const keyTargetIndex = computed(() => {
		const t = uiStore.keyTargetParam;
		return t && t.area === (props.areaLabel ?? 'fx') && t.moduleId === moduleIdx.value ? t.paramIndex : -1;
	});

	// Morph Group assignment: coloring, ctrl-click assign/deassign, ctrl-drag range editing.
	const morphLocation = computed<0 | 1>(() => (props.areaLabel === 'va' ? 1 : 0));

	const moduleMorphAssignments = computed(() => {
		const slot = uiStore.slotInFocus;
		if (!slot) return [];
		return slotsStore.getMorphAssignments(slot, uiStore.variation).filter((a) => a.location === morphLocation.value && a.moduleIndex === moduleIdx.value);
	});

	function morphAssignmentsForParam(paramIndex: number) {
		return moduleMorphAssignments.value.filter((a) => a.paramIndex === paramIndex);
	}

	function morphColorFor(paramIndex: number): 'red' | 'blue' | null {
		const list = morphAssignmentsForParam(paramIndex);
		if (list.length === 0) return null;
		return list.some((a) => a.groupIndex === uiStore.selectedMorphGroup) ? 'red' : 'blue';
	}

	function morphRangeFor(paramIndex: number): number | undefined {
		return morphAssignmentsForParam(paramIndex).find((a) => a.groupIndex === uiStore.selectedMorphGroup)?.range;
	}

	// Renders its live range badge via MorphDragHintOverlay (canvas-level, painted after every
	// module) instead of locally, so the badge always stays above other modules on the canvas.
	const { startDrag } = useMorphRangeDrag();

	// Mousedown on a param also selects it (and its module) — mirrors the module title-bar
	// click path (useModuleSelecting.handleModuleClick) — so the clicked param becomes the
	// active one for keyboard shortcuts (arrow-key nav, L) right away.
	function onParamMorphMouseDown(paramIndex: number, e: MouseEvent) {
		shiftDownPos = e.shiftKey ? { x: e.clientX, y: e.clientY } : null;
		uiStore.selectModules([moduleIdx.value], props.areaLabel ?? 'fx');
		uiStore.setSelectedParam(moduleIdx.value, paramIndex);
		uiStore.selectedCables = [];

		if (e.altKey) {
			// Alt+drag this param onto a Parameter Pages toolbar knob to assign it. Uses a custom
			// pointer-tracked drag (useParamPageDrag.ts) instead of native HTML5 DnD — see that file's
			// header comment for why. stopPropagation() (inside startParamPageDrag) also blocks the
			// knob/slider/etc. widget's own mousedown-drag from engaging underneath this gesture.
			const label = moduleDef.value?.params?.[paramIndex]?.name ?? 'Param';
			startParamPageDrag(e, { location: morphLocation.value, moduleIndex: moduleIdx.value, paramIndex, label });
			return;
		}
		if (!isGrabModifierPressed(e)) return;
		const slot = uiStore.slotInFocus;
		if (!slot) return;
		const param = moduleDef.value?.params?.[paramIndex];
		// Buttons/switches/spinners always get the fixed max range (no drag needed for those).
		const isFixedRange = param ? isSwitch(param.n) || isSpinner(param.n) || isSpinnerH(param.n) : false;
		const groupIndex = uiStore.selectedMorphGroup;
		const location = morphLocation.value;
		const variation = uiStore.variation;
		startDrag(moduleIdx.value, paramIndex, props.areaLabel ?? 'fx', e, {
			isAssigned: () => morphAssignmentsForParam(paramIndex).some((a) => a.groupIndex === groupIndex),
			getRange: () => morphAssignmentsForParam(paramIndex).find((a) => a.groupIndex === groupIndex)?.range ?? 0,
			// Freshly assigned params start at the full parameter range (matches the real editor);
			// the user then Ctrl-drags to narrow it.
			onAssign: () => slotsStore.assignParamToMorphGroup(slot, variation, groupIndex, location, moduleIdx.value, paramIndex, 127),
			onDeassign: () => slotsStore.deassignParamFromMorphGroup(slot, variation, groupIndex, location, moduleIdx.value, paramIndex),
			onRangeChange: isFixedRange
				? undefined
				: (range) => slotsStore.setMorphAssignmentRange(slot, variation, groupIndex, location, moduleIdx.value, paramIndex, range),
		});
	}

	// Shift+click (without dragging — Shift+drag is fine adjust) on a knob/slider opens the Set Value
	// popup. Spinners are left out: their click already steps the value.
	let shiftDownPos: { x: number; y: number } | null = null;
	function onParamShiftClick(n: string, paramIndex: number, e: MouseEvent) {
		const down = shiftDownPos;
		shiftDownPos = null;
		if (!e.shiftKey || !down || !(isKnob(n) || isSlider(n))) return;
		if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 3) return;
		openParamEdit({ area: props.areaLabel ?? 'fx', moduleIndex: moduleIdx.value, paramIndex, x: e.clientX, y: e.clientY });
	}

	// DrumSynth preset selector emits target values for its 15 params directly (it owns the preset
	// table); applied as one batched store action so a single Ctrl+Z reverts the whole preset switch.
	function onDrumSynthPresetApply(values: number[]) {
		const area = props.areaLabel === 'va' ? 'voice' : 'fx';
		slotsStore.setParams(
			moduleIdx.value,
			Array.from({ length: 15 }, (_, i) => i),
			values,
			uiStore.variation,
			area,
		);
	}

	// Vocoder preset buttons emit the target values for all 16 Band params directly (it owns the
	// reroute math); applied as one batched store action, same pattern as DrumSynth.
	function onVocoderPresetApply(values: number[]) {
		const area = props.areaLabel === 'va' ? 'voice' : 'fx';
		slotsStore.setParams(
			moduleIdx.value,
			Array.from({ length: 16 }, (_, i) => i),
			values,
			uiStore.variation,
			area,
		);
	}

	function onPianoRollViewChange(view: PianoRollView) {
		const area = props.areaLabel === 'va' ? 'voice' : 'fx';
		slotsStore.setSeqNotePianoRollView(moduleIdx.value, area, view);
	}

	function onParamHoverEnter(n: string, paramIndex: number, e: MouseEvent) {
		// e.buttons: never retarget the arrow keys while a drag is in progress
		if (settingsStore.hoverKeyTarget && e.buttons === 0) {
			uiStore.setHoveredParam(moduleIdx.value, paramIndex, props.areaLabel ?? 'fx');
			blurFocusedControl();
		}
		if (isSwitch(n)) showHint('paramSwitch');
		else if (isSpinner(n) || isSpinnerH(n)) showHint('paramSpinner');
		else if (isSlider(n)) showHint('paramSlider');
		else showHint('paramKnob');
	}
	// A module deleted under the mouse never gets its mouseleave.
	onUnmounted(() => {
		const hov = uiStore.hoveredParam;
		if (hov?.moduleId === moduleIdx.value && hov.area === (props.areaLabel ?? 'fx')) uiStore.clearHoveredParam();
	});
	function onParamHoverLeave(e: MouseEvent) {
		// Moving onto the knob's arrows (KnobSpinOverlay) keeps the hover; the overlay clears it on its own leave.
		if (!(e.relatedTarget instanceof Element && e.relatedTarget.closest('.knob-spin-v'))) uiStore.clearHoveredParam();
		clearHint();
	}

	function onParamDragOver(e: DragEvent) {
		e.preventDefault();
	}

	// Drop target for a dragged MIDI CC row (assign a CC) and for a dragged Parameter Pages knob
	// (assign this param to that knob slot). Both arrive as native DnD from an HTML source; the
	// reverse direction — this param dragged onto a toolbar knob — is useParamPageDrag.ts instead.
	function onParamDrop(e: DragEvent) {
		const slot = uiStore.slotInFocus;
		if (!slot) return;
		const data = parseDragPayload(e);
		if (!data) return;
		let el = e.target as Element | null;
		while (el && !el.hasAttribute('data-param-index')) el = el.parentElement;
		if (!el) return;
		const paramIndex = parseInt(el.getAttribute('data-param-index') ?? '');
		if (isNaN(paramIndex)) return;
		const location: 0 | 1 = props.areaLabel === 'va' ? 1 : 0;

		if (data.type === 'cc') slotsStore.assignMidiCC(slot, location, moduleIdx.value, paramIndex, data.cc);
		else if (data.global) slotsStore.assignParamToGlobalPage(slot, data.slotIndex, location, moduleIdx.value, paramIndex);
		else slotsStore.assignParamToPage(slot, data.slotIndex, location, moduleIdx.value, paramIndex);
		e.stopPropagation(); // don't let PatchCanvas.vue's module-palette drop wrapper also react to this drop
	}

	function onParamContextMenu(paramIndex: number, event: MouseEvent, labelIndex = 0) {
		const param = moduleDef.value?.params?.[paramIndex];
		const slot = uiStore.slotInFocus;
		const location = props.areaLabel === 'va' ? 1 : 0;
		const items: any[] = [];

		if (param && isSwitch(param.n)) {
			if (param.label) {
				const label = getParamLabel(paramIndex);
				const currentLabel = label?.labels?.[labelIndex] || param.label[labelIndex] || '';
				items.push({
					label: 'Rename label',
					action: () => emit('paramLabelEdit', { moduleIndex: moduleIdx.value, paramIndex, currentLabel, labelIndex }),
				});
			}
		} else {
			items.push({
				label: 'Set Value',
				action: () => openParamEdit({ area: props.areaLabel ?? 'fx', moduleIndex: moduleIdx.value, paramIndex, x: event.clientX, y: event.clientY }),
			});
		}

		items.push({ type: 'separator' });

		// Morph Group assign/deassign (toggles assignment to the currently selected toolbar group)
		items.push(
			...buildMorphMenuItems({
				slot,
				variation: uiStore.variation,
				groupIndex: uiStore.selectedMorphGroup,
				location: location as 0 | 1,
				moduleIndex: moduleIdx.value,
				paramIndex,
				isAssigned: morphAssignmentsForParam(paramIndex).some((a) => a.groupIndex === uiStore.selectedMorphGroup),
				defaultRange: 127, // full parameter range, matching the real editor's initial morph range
			}),
		);
		items.push({ type: 'separator' });

		// MIDI CC items
		const lastCC = deviceStore.lastMidiCC;
		const existing = slot
			? slotsStore.slots[slot].controllers.find((c) => c.location === location && c.moduleIndex === moduleIdx.value && c.paramIndex === paramIndex)
			: undefined;
		items.push(
			...buildCCMenuItems({
				lastCC,
				existing,
				enabled: !!slot,
				onAssign: (cc) => slot && slotsStore.assignMidiCC(slot, location as 0 | 1, moduleIdx.value, paramIndex, cc),
				onDeassign: () => slot && existing && slotsStore.deassignMidiCC(slot, existing.cc),
			}),
		);
		items.push({ type: 'separator' });

		// Parameter Pages knob assign/deassign
		const existingPage = slot
			? slotsStore.slots[slot].paramPages.find((k) => k.location === location && k.moduleIndex === moduleIdx.value && k.paramIndex === paramIndex)
			: undefined;
		items.push(
			...buildParamPageMenuItems({
				slot,
				location: location as 0 | 1,
				moduleIndex: moduleIdx.value,
				paramIndex,
				existing: existingPage,
			}),
		);

		// Global Parameter Pages knob assign/deassign
		const existingGlobalPage = slot
			? slotsStore.globalParamPages.find(
					(k) => k.slot === slot && k.location === location && k.moduleIndex === moduleIdx.value && k.paramIndex === paramIndex,
				)
			: undefined;
		items.push(
			...buildGlobalParamPageMenuItems({
				slot,
				location: location as 0 | 1,
				moduleIndex: moduleIdx.value,
				paramIndex,
				existing: existingGlobalPage,
			}),
		);

		openContextMenu(event, items);
	}
</script>
