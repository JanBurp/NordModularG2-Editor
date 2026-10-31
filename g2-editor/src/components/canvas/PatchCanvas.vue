<template>
	<div
		ref="wrapperEl"
		class="overflow-auto bg-surface-2 relative h-full w-full"
		:data-testid="`canvas-${area}`"
		:data-canvas-area="area"
		@dragover.prevent="handleDragOver"
		@dragleave="clearDropGhost"
		@drop.prevent="handleModuleDropOnWrapper"
		@wheel="onWrapperWheel"
	>
		<svg
			ref="svgRef"
			class="block"
			font-size="9"
			:width="canvasWidth * zoom"
			:height="canvasHeight * zoom"
			:viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
			preserveAspectRatio="xMinYMin meet"
			style="min-width: 100%"
			xmlns="http://www.w3.org/2000/svg"
			@mousedown="onCanvasMousedown"
			@mousemove="handleSvgMouseMove"
			@contextmenu.prevent="onCanvasContextMenu"
			@click="
				clearArmed();
				clearGhostCable();
				emit('canvasClick');
				handleCanvasClick();
			"
		>
			<text :font-size="160" :x="labelCenter.x / zoom" :y="labelCenter.y / zoom" width="100%" height="100%" text-anchor="middle" fill="#666">
				{{ getAreaByShort(area) }}
			</text>

			<Module
				v-for="mod in props.modules as any[]"
				:key="mod.index"
				:instance="mod"
				:is-selected="props.selectedModuleIndices.includes(mod.index)"
				:is-unused="unusedModules.has(mod.index)"
				:connected-inputs="connectedJacksMap.get(mod.index)?.inputs"
				:connected-outputs="connectedJacksMap.get(mod.index)?.outputs"
				:area-label="props.area as 'fx' | 'va'"
				@param-change="onParamChange"
				@mode-change="onModeChange"
				@jack-drag-start="(info, e) => cablesRef?.handleJackDragStart(info, e)"
				@jack-drag-end="(info) => cablesRef?.handleJackDragEnd(info)"
				@module-drag-start="handleModuleDragStart"
				@module-label-edit="(info) => emit('moduleLabelEdit', info)"
				@module-delete="(idx) => emit('moduleDelete', idx)"
				@module-paste-params="(idx) => emit('modulePasteParams', idx)"
				@module-color-change="(idx, colorId) => emit('moduleColorChange', idx, colorId)"
				@module-replace="(idx, newTypeId) => emit('moduleReplace', idx, newTypeId)"
				@jack-delete-connected="(info) => emit('jackDeleteConnected', info)"
				@jack-break-connection="(info) => emit('jackBreakConnection', info)"
				@jack-set-cable-color="(info) => emit('jackSetCableColor', info)"
				@jack-hover-enter="onJackHoverEnter"
				@jack-hover-leave="onJackHoverLeave"
				@param-label-edit="(info) => emit('paramLabelEdit', info)"
			/>
			<DragGhost :ghosts="dragGhosts" />
			<DragGhost :ghosts="remoteGhosts" />
			<!-- Cables.vue draws into this layer: above the modules, below every badge/hint overlay. -->
			<g ref="cableLayerRef" />
			<CCBadgesOverlay :modules="props.modules as ModuleInstance[]" :area-label="props.area as 'fx' | 'va'" />
			<ParamValuesOverlay :modules="props.modules as ModuleInstance[]" :area-label="props.area as 'fx' | 'va'" />
			<MorphAssignBadgesOverlay :modules="props.modules as ModuleInstance[]" :area-label="props.area as 'fx' | 'va'" />
			<MorphRangeBadgesOverlay :modules="props.modules as ModuleInstance[]" :area-label="props.area as 'fx' | 'va'" />
			<KnobAssignBadgesOverlay :modules="props.modules as ModuleInstance[]" :area-label="props.area as 'fx' | 'va'" />
			<CtrlValuesOverlay :modules="props.modules as ModuleInstance[]" :area-label="props.area as 'fx' | 'va'" />
			<MorphDragHintOverlay :modules="props.modules as ModuleInstance[]" :area-label="props.area as 'fx' | 'va'" />
			<ValueHintOverlay :modules="props.modules as ModuleInstance[]" :area-label="props.area as 'fx' | 'va'" />
			<KnobSpinOverlay :modules="props.modules as ModuleInstance[]" :area-label="props.area as 'fx' | 'va'" @change="onParamChange" />
			<!-- Rendered last so it always paints above every module/overlay, regardless of draw order above. -->
			<GhostCable :modules="props.modules as any[]" :ghost="ghostCableForArea" @confirm="onGhostConfirm" />
		</svg>
		<Cables
			ref="cablesRef"
			:modules="props.modules as any[]"
			:cables="props.cables as Cable[]"
			:selected-cables="props.selectedCables"
			:hovered-jack="hoveredJack ?? menuJack"
			:area="props.area === 'va' ? 1 : 0"
			@jack-drag-start="emit('jackDragStart', $event)"
			@jack-drag-end="emit('jackDragEnd', $event)"
			@cable-group-drop="emit('cableGroupDrop', $event)"
		/>
		<div ref="selectionRectEl" class="selection-rect" />
	</div>
</template>
<script setup lang="ts">
	import { ref, onMounted, onUnmounted, computed, provide, watch } from 'vue';
	import type { Cable } from '../../renderer/cableRenderer';
	import { sameJack, matchesCableJack, isUnusedModule, assignedModules } from '../../store/slotHelpers';
	import { useStatusHint } from '../../composables/useStatusHint';
	import { useValueHint } from '../../composables/useValueHint';
	import type { JackEnd } from '../../store/slotHelpers';
	import type { ModuleInstance } from '../../types';
	import type { ContextMenuItem } from '../../types';
	import { getModule, getAllCategories, getModulesByCategory } from '../../renderer/nmg2mods';
	import '../../renderer/svgStyles.css';
	import Module from './Module.vue';
	import Cables from './Cables.vue';
	import DragGhost from './DragGhost.vue';
	import GhostCable from './GhostCable.vue';
	import CCBadgesOverlay from './CCBadgesOverlay.vue';
	import ParamValuesOverlay from './ParamValuesOverlay.vue';
	import KnobSpinOverlay from './KnobSpinOverlay.vue';
	import MorphAssignBadgesOverlay from './MorphAssignBadgesOverlay.vue';
	import MorphRangeBadgesOverlay from './MorphRangeBadgesOverlay.vue';
	import MorphDragHintOverlay from './MorphDragHintOverlay.vue';
	import KnobAssignBadgesOverlay from './KnobAssignBadgesOverlay.vue';
	import CtrlValuesOverlay from './CtrlValuesOverlay.vue';
	import ValueHintOverlay from './ValueHintOverlay.vue';
	import { useModuleSelecting } from '../../composables/useModuleSelecting';
	import { useModuleDrag } from '../../composables/useModuleDrag';
	import { useModuleDrop } from '../../composables/useModuleDrop';
	import { remoteDragGhosts } from '../../composables/useRemoteModuleDrop';
	import { buildClipboardEntry } from '../../composables/usePatchClipboard';
	import { useUiStore } from '../../store/ui';
	import { useSlotsStore } from '../../store/slots';
	import { useSettingsStore } from '../../store/settings';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { useAddModule } from '../../composables/useAddModule';
	import { useJackPatching } from '../../composables/useJackPatching';
	import { useGhostCable } from '../../composables/useGhostCable';
	import { useModuleGraphics } from '../../composables/useModuleGraphics';
	import { getAreaByShort, MODULE_WIDTH, MODULE_ROW_HEIGHT } from '../../constants/ui';
	import { svgClientToGrid } from '../../renderer/svgUtils';
	import { createDoubleClickDetector } from '../../utils/doubleClick';

	const props = defineProps({
		modules: {
			type: Array,
			default: () => [],
		},
		cables: {
			type: Array,
			default: () => [],
		},
		variation: {
			type: Number,
			default: 0,
		},
		area: {
			type: String,
			default: 'voice',
		},
		selectedCables: {
			type: Array as () => Cable[],
			default: () => [],
		},
		selectedModuleIndices: {
			type: Array as () => number[],
			default: () => [],
		},
	});

	const emit = defineEmits<{
		paramChange: [moduleIndex: number, paramIndex: number, value: number, immediate?: boolean];
		modeChange: [moduleIndex: number, index: number, value: number];
		jackDragStart: [
			info: {
				moduleIndex: number;
				connectorIndex: number;
				type: 'input' | 'output';
				colour: string;
			},
		];
		jackDragEnd: [
			info: {
				moduleIndex: number;
				connectorIndex: number;
				type: 'input' | 'output';
				colour: string;
			},
		];
		moduleMove: [info: { indices: number[]; dCol: number; dRow: number; anchorIndex: number; isCopy: boolean }];
		moduleDrop: [info: { typeId: number; col: number; row: number }];
		canvasClick: [];
		moduleLabelEdit: [info: { moduleIndex: number; currentLabel: string }];
		moduleDelete: [moduleIndex: number];
		modulePasteParams: [moduleIndex: number];
		moduleColorChange: [moduleIndex: number, colorId: number];
		moduleReplace: [moduleIndex: number, newTypeId: number];
		jackDeleteConnected: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
		jackBreakConnection: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
		jackSetCableColor: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colorId: number }];
		cableGroupDrop: [info: { group: Cable[]; fromJack: JackEnd; toJack: JackEnd | null }];
		paramLabelEdit: [info: { moduleIndex: number; paramIndex: number; currentLabel: string }];
	}>();

	const svgRef = ref<SVGSVGElement | null>(null);
	provide('patchCanvasSvg', svgRef);
	const cableLayerRef = ref<SVGGElement | null>(null);
	provide('patchCanvasCableLayer', cableLayerRef);
	const cablesRef = ref<InstanceType<typeof Cables> | null>(null);
	const selectionRectEl = ref<HTMLDivElement | null>(null);

	const settingsStore = useSettingsStore();
	const slotsStore = useSlotsStore();
	const zoom = computed(() => settingsStore.canvasZoom);

	// Chromium heuristic: trackpad wheel events report wheelDeltaY === -3 * deltaY; mouse-wheel notches don't.
	function isTrackpadWheel(e: WheelEvent) {
		const wheelDeltaY = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
		return wheelDeltaY !== undefined && wheelDeltaY === -3 * e.deltaY;
	}
	// Knob/slider wheel handlers run first (bubbling); this only blocks canvas scrolling by a mouse wheel.
	function onWrapperWheel(e: WheelEvent) {
		if (settingsStore.wheelPreventScroll && !isTrackpadWheel(e)) e.preventDefault();
	}

	const wrapperEl = ref<HTMLDivElement | null>(null);
	const containerWidth = ref(0);
	const containerHeight = ref(0);
	// Uses the outer size (incl. scrollbars) so the area label doesn't shift when a scrollbar appears.
	const labelCenter = ref({ x: 0, y: 0 });
	let resizeObserver: ResizeObserver | null = null;
	onMounted(() => {
		if (wrapperEl.value) {
			resizeObserver = new ResizeObserver((entries) => {
				containerWidth.value = entries[0].contentRect.width;
				containerHeight.value = entries[0].contentRect.height;
				const el = entries[0].target as HTMLElement;
				labelCenter.value = { x: el.offsetWidth / 2, y: el.offsetHeight / 2 };
			});
			resizeObserver.observe(wrapperEl.value);
		}
	});
	onUnmounted(() => {
		resizeObserver?.disconnect();
	});

	const hoveredJack = ref<JackEnd | null>(null);
	function onJackHoverEnter(info: JackEnd) {
		hoveredJack.value = info;
		uiStore.hoveredJack = { ...info, area: props.area as 'va' | 'fx' };
		const connected = (props.cables as Cable[]).some((c) => matchesCableJack(c, info.moduleIndex, info.connectorIndex, info.type));
		if (connected) showHint(settingsStore.cableConnectMode === 'click' ? 'jackConnectedClick' : 'jackConnectedDrag');
		else if (settingsStore.cableConnectMode === 'click') showHint('jackArm');
	}
	// A jack's context menu overlay takes the pointer, so the jack loses hover: keep its cables
	// highlighted until the menu closes.
	const menuJack = ref<JackEnd | null>(null);
	function onJackHoverLeave(info: JackEnd) {
		if (ctxState.visible) menuJack.value = info;
		if (hoveredJack.value && sameJack(hoveredJack.value, info)) hoveredJack.value = null;
		if (uiStore.hoveredJack && sameJack(uiStore.hoveredJack, info)) uiStore.hoveredJack = null;
		clearHint();
	}

	const { handleCanvasMousedown, handleModuleClick, handleCanvasClick } = useModuleSelecting(
		svgRef,
		computed(() => props.modules as any[]),
		selectionRectEl,
		props.area,
		() => zoom.value,
	);

	const canvasWidth = computed(() => {
		let maxX = 0;
		(props.modules as any[]).forEach((m: any) => {
			const mx = (m.horiz + 1) * MODULE_WIDTH;
			if (mx > maxX) maxX = mx;
		});
		return Math.max(maxX + 100, containerWidth.value / zoom.value);
	});

	const canvasHeight = computed(() => {
		let maxY = 0;
		(props.modules as any[]).forEach((m: any) => {
			const modDef = getModule(m.type);
			const modHeight = modDef?.height || 2;
			const my = (m.vert + modHeight) * MODULE_ROW_HEIGHT;
			if (my > maxY) maxY = my;
		});
		return Math.max(maxY + 2 * MODULE_ROW_HEIGHT, containerHeight.value / zoom.value);
	});

	const connectedJacksMap = computed(() => {
		const map = new Map<number, { inputs: Set<number>; outputs: Set<number> }>();
		for (const cable of props.cables as Cable[]) {
			const dir = cable.dir ?? 1;
			if (!map.has(cable.dmod)) map.set(cable.dmod, { inputs: new Set(), outputs: new Set() });
			map.get(cable.dmod)!.inputs.add(cable.dcon);
			if (!map.has(cable.smod)) map.set(cable.smod, { inputs: new Set(), outputs: new Set() });
			if (dir === 1) map.get(cable.smod)!.outputs.add(cable.scon);
			else map.get(cable.smod)!.inputs.add(cable.scon);
		}
		return map;
	});

	// Same rule as Patch → Delete Unused Modules, so the dimmed modules are exactly what it would remove.
	const unusedModules = computed(() => {
		if (!settingsStore.dimUnusedModules) return new Set<number>();
		const assigned = assignedModules(slotsStore.slots[uiStore.slotInFocus], props.area === 'va' ? 1 : 0);
		return new Set((props.modules as ModuleInstance[]).filter((m) => isUnusedModule(m, props.cables as Cable[], assigned)).map((m) => m.index));
	});

	function onParamChange(moduleIndex: number, paramIndex: number, value: number, immediate?: boolean) {
		valueHint.changed({ moduleIndex, paramIndex, area: props.area as 'fx' | 'va' });
		emit('paramChange', moduleIndex, paramIndex, value, immediate);
	}

	function onModeChange(moduleIndex: number, index: number, value: number) {
		emit('modeChange', moduleIndex, index, value);
	}

	const uiStore = useUiStore();
	const valueHint = useValueHint();
	const { showHint, clearHint } = useStatusHint();
	const { state: ctxState, open: openContextMenu } = useContextMenu();
	watch(
		() => ctxState.visible,
		(visible) => {
			if (!visible) menuJack.value = null;
		},
	);
	const { addModuleAt } = useAddModule();
	const { graphics } = useModuleGraphics();
	const { clearArmed } = useJackPatching();
	const { clearGhostCable, confirmGhostCable } = useGhostCable();

	const ghostCableForArea = computed(() => {
		const areaIdx = props.area === 'va' ? 1 : 0;
		return uiStore.ghostCable && uiStore.ghostCable.area === areaIdx ? uiStore.ghostCable : null;
	});

	// Also clears an armed click-connect source, if any — harmless no-op for an auto-suggest ghost.
	async function onGhostConfirm() {
		await confirmGhostCable();
		clearArmed();
	}

	const { dragGhosts, handleModuleDragStart, clearModuleDrag } = useModuleDrag(
		() => props.modules as any[],
		(info) => emit('moduleMove', info),
		(index, shiftKey) => handleModuleClick(index, shiftKey),
		() => zoom.value,
		(indices) => buildClipboardEntry(indices, props.area === 'va' ? 'voice' : 'fx'),
	);
	const remoteGhosts = computed(() => remoteDragGhosts(uiStore.remoteDrag, props.area as 'va' | 'fx'));

	const { handleDragOver, clearDropGhost, handleModuleDropOnWrapper } = useModuleDrop(svgRef, (info) => emit('moduleDrop', info));

	function onCanvasContextMenu(e: MouseEvent) {
		const grid = svgClientToGrid(svgRef.value, e.clientX, e.clientY);
		if (!grid) return;
		const { col, row } = grid;
		const area = props.area as 'va' | 'fx';

		const cats = settingsStore.hidden_modules ? getAllCategories() : getAllCategories().filter((c) => c !== 'Hidden');
		const items: ContextMenuItem[] = cats.map((cat) => ({
			label: cat,
			children: getModulesByCategory(cat).map((m) => ({
				label: m.long || m.short,
				icon: graphics.value[m.id],
				action: () => addModuleAt(m.id, col, row, area),
			})),
		}));

		openContextMenu(e, items);
	}

	// Own double-click detection on mousedown: native dblclick is unreliable in Electron, and the click event target is
	// unreliable because handleCanvasMousedown disables svg pointer-events until mouseup.
	// Only the bare canvas (svg or its big area-letter background) counts as "empty"; modules/overlays are other targets.
	const isDoubleClick = createDoubleClickDetector();
	function onCanvasMousedown(e: MouseEvent) {
		handleCanvasMousedown(e);
		if (e.button !== 0) return;
		const t = e.target as Element;
		if (t !== svgRef.value && !(t.parentNode === svgRef.value && t.tagName === 'text')) return;
		if (isDoubleClick()) {
			e.preventDefault(); // otherwise the mousedown's default focus change steals focus from the search input
			uiStore.showQuickAdd = true;
		}
	}

	function handleSvgMouseMove(e: MouseEvent) {
		const grid = svgClientToGrid(svgRef.value, e.clientX, e.clientY);
		if (!grid) return;
		uiStore.lastMousePos = { ...grid, area: props.area as 'va' | 'fx' };
	}

	onUnmounted(() => {
		clearModuleDrag();
		clearDropGhost();
	});
</script>
