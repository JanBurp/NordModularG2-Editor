<template>
	<div class="overflow-auto bg-neutral-700" @dragover.prevent="handleDragOver" @dragleave="clearDropGhost" @drop.prevent="handleModuleDropOnWrapper">
		<svg
			ref="svgRef"
			font-size="9"
			:width="canvasWidth"
			:height="canvasHeight"
			xmlns="http://www.w3.org/2000/svg"
			@mousedown="handleCanvasMousedown"
			@click="
				emit('canvasClick');
				handleCanvasClick();
			"
		>
			<Module
				v-for="mod in modulesWithVariation"
				:key="mod.index"
				:instance="mod"
				:is-selected="props.selectedModuleIndices.includes(mod.index)"
				:connected-inputs="connectedJacksMap.get(mod.index)?.inputs"
				:connected-outputs="connectedJacksMap.get(mod.index)?.outputs"
				@param-change="onParamChange"
				@mode-change="onModeChange"
				@jack-drag-start="(info) => cablesRef?.handleJackDragStart(info)"
				@jack-drag-end="(info) => cablesRef?.handleJackDragEnd(info)"
				@module-drag-start="handleModuleDragStart"
				@module-label-edit="(info) => emit('moduleLabelEdit', info)"
				@module-delete="(idx) => emit('moduleDelete', idx)"
				@module-color-change="(idx, colorId) => emit('moduleColorChange', idx, colorId)"
				@jack-delete-connected="(info) => emit('jackDeleteConnected', info)"
				@jack-set-cable-color="(info) => emit('jackSetCableColor', info)"
				@param-label-edit="(info) => emit('paramLabelEdit', info)"
			/>
			<rect
				v-if="isDraggingSelection && selectionRect"
				:x="selectionRect.x"
				:y="selectionRect.y"
				:width="Math.max(0, selectionRect.width)"
				:height="Math.max(0, selectionRect.height)"
				fill="none"
				stroke="rgba(30,30,30,0.8)"
				stroke-width="3"
				pointer-events="none"
			/>
			<DragGhost :ghosts="dragGhosts" />
		</svg>
		<Cables
			ref="cablesRef"
			:modules="props.modules as any[]"
			:cables="props.cables as any[]"
			:selected-cables="props.selectedCables"
			@jack-drag-start="emit('jackDragStart', $event)"
			@jack-drag-end="emit('jackDragEnd', $event)"
		/>
	</div>
</template>
<script setup lang="ts">
	import { ref, onUnmounted, computed, provide } from 'vue';
	import type { Cable } from '../../renderer/cableRenderer';
	import { getModule } from '../../renderer/nmg2mods';
	import '../../renderer/svgStyles.css';
	import Module from './Module.vue';
	import Cables from './Cables.vue';
	import DragGhost from './DragGhost.vue';
	import { useModuleSelecting } from '../../composables/useModuleSelecting';
	import { useUiStore } from '@/store/ui';

	const ui = useUiStore();

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
		paramChange: [moduleIndex: number, paramIndex: number, value: number];
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
		moduleMove: [info: { indices: number[]; dCol: number; dRow: number; anchorIndex: number }];
		moduleDrop: [info: { typeId: number; col: number; row: number }];
		canvasClick: [];
		moduleLabelEdit: [info: { moduleIndex: number; currentLabel: string }];
		moduleDelete: [moduleIndex: number];
		moduleColorChange: [moduleIndex: number, colorId: number];
		jackDeleteConnected: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }];
		jackSetCableColor: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colorId: number }];
		paramLabelEdit: [info: { moduleIndex: number; paramIndex: number; currentLabel: string }];
	}>();

	const svgRef = ref<SVGSVGElement | null>(null);
	provide('patchCanvasSvg', svgRef);
	const cablesRef = ref<InstanceType<typeof Cables> | null>(null);

	const { selectionRect, isDraggingSelection, handleCanvasMousedown, handleModuleClick, handleCanvasClick } = useModuleSelecting(
		svgRef,
		computed(() => props.modules as any[]),
	);

	const canvasWidth = computed(() => {
		if (props.modules.length === 0) return 1280;
		let maxX = 0;
		props.modules.forEach((m) => {
			const mx = (m.horiz + 1) * 256;
			if (mx > maxX) maxX = mx;
		});
		return Math.max(maxX + 100, 1280);
	});

	const canvasHeight = computed(() => {
		if (props.modules.length === 0) return 600;
		let maxY = 0;
		props.modules.forEach((m) => {
			const modDef = getModule(m.type);
			const modHeight = modDef?.height || 2;
			const my = (m.vert + modHeight) * 16;
			if (my > maxY) maxY = my;
		});
		return Math.max(maxY + 100, 600);
	});

	type DragState = {
		indices: number[];
		startPosByIndex: Map<number, { horiz: number; vert: number }>;
		anchorIndex: number;
		dxPx: number;
		dyPx: number;
	};
	const dragState = ref<DragState | null>(null);

	const connectedJacksMap = computed(() => {
		const map = new Map<number, { inputs: Set<number>; outputs: Set<number> }>();
		for (const cable of props.cables as any[]) {
			const smod = cable.smod ?? cable.sourceModule;
			const scon = cable.scon ?? cable.sourceJack;
			const dmod = cable.dmod ?? cable.destModule;
			const dcon = cable.dcon ?? cable.destJack;
			const dir = cable.dir ?? 1;
			if (!map.has(dmod)) map.set(dmod, { inputs: new Set(), outputs: new Set() });
			map.get(dmod)!.inputs.add(dcon);
			if (!map.has(smod)) map.set(smod, { inputs: new Set(), outputs: new Set() });
			if (dir === 1) map.get(smod)!.outputs.add(scon);
			else map.get(smod)!.inputs.add(scon);
		}
		return map;
	});

	const modulesWithVariation = computed(() => {
		return props.modules.map((m) => {
			if (!m.lv || !m.pcnt) return m;
			const startIdx = props.variation * m.pcnt;
			const endIdx = startIdx + m.pcnt;
			return {
				...m,
				lv: m.lv.slice(startIdx, endIdx),
			};
		});
	});

	const dragGhosts = computed(() => {
		const drag = dragState.value;
		if (!drag) return [];
		return drag.indices
			.map((idx) => {
				const start = drag.startPosByIndex.get(idx);
				const mod = (props.modules as any[]).find((m) => m.index === idx);
				if (!start || !mod) return null;
				const height = ((getModule(mod.type) as any)?.height ?? 2) * 16;
				return {
					idx,
					x: start.horiz * 256 + drag.dxPx,
					y: start.vert * 16 + drag.dyPx,
					height,
				};
			})
			.filter((g): g is { idx: number; x: number; y: number; height: number } => g !== null);
	});

	function onParamChange(moduleIndex, paramIndex, value) {
		emit('paramChange', moduleIndex, paramIndex, value);
	}

	function onModeChange(moduleIndex, index, value) {
		emit('modeChange', moduleIndex, index, value);
	}

	onUnmounted(() => {
		clearModuleDrag();
		clearDropGhost();
	});

	// --- Module drag (move) ---
	type ModuleDragInfo = {
		moduleIndex: number;
		clientX: number;
		clientY: number;
	};
	let dragModuleIndex: number | null = null;
	let dragStartClientX = 0;
	let dragStartClientY = 0;
	let dragMoved = false;

	function handleModuleDragStart(info: ModuleDragInfo) {
		dragModuleIndex = info.moduleIndex;
		dragStartClientX = info.clientX;
		dragStartClientY = info.clientY;
		dragMoved = false;
		window.addEventListener('mousemove', onModuleDragMove);
		window.addEventListener('mouseup', onModuleDragEnd);
	}

	function onModuleDragMove(e: MouseEvent) {
		if (dragModuleIndex === null) return;
		const dxPx = e.clientX - dragStartClientX;
		const dyPx = e.clientY - dragStartClientY;
		if (!dragMoved) {
			if (Math.hypot(dxPx, dyPx) < 5) return;
			const sel = ui.selectedModules;
			const indices = sel.includes(dragModuleIndex) ? [...sel] : [dragModuleIndex];
			const startPosByIndex = new Map<number, { horiz: number; vert: number }>();
			for (const id of indices) {
				const m = (props.modules as any[]).find((x) => x.index === id);
				if (m) startPosByIndex.set(id, { horiz: m.horiz, vert: m.vert });
			}
			if (startPosByIndex.size === 0) return;
			dragState.value = { indices, startPosByIndex, anchorIndex: dragModuleIndex, dxPx: 0, dyPx: 0 };
			dragMoved = true;
		}
		dragState.value = { ...dragState.value!, dxPx, dyPx };
	}

	function onModuleDragEnd(e: MouseEvent) {
		window.removeEventListener('mousemove', onModuleDragMove);
		window.removeEventListener('mouseup', onModuleDragEnd);
		const moduleIndex = dragModuleIndex;
		dragModuleIndex = null;
		const drag = dragState.value;
		dragState.value = null;
		if (drag && moduleIndex !== null) {
			const anchorStart = drag.startPosByIndex.get(drag.anchorIndex)!;
			const anchorTargetCol = Math.max(0, Math.round(anchorStart.horiz + drag.dxPx / 256));
			const anchorTargetRow = Math.max(0, Math.round(anchorStart.vert + drag.dyPx / 16));
			const dCol = anchorTargetCol - anchorStart.horiz;
			const dRow = anchorTargetRow - anchorStart.vert;
			if (dCol !== 0 || dRow !== 0) {
				emit('moduleMove', { indices: drag.indices, dCol, dRow, anchorIndex: drag.anchorIndex });
			}
		} else if (moduleIndex !== null) {
			handleModuleClick(moduleIndex, e.shiftKey);
		}
		dragMoved = false;
	}

	function clearModuleDrag() {
		dragState.value = null;
		dragModuleIndex = null;
		dragMoved = false;
		window.removeEventListener('mousemove', onModuleDragMove);
		window.removeEventListener('mouseup', onModuleDragEnd);
	}

	// --- Module drop (add from ModulesPane) ---
	let dropGhost: SVGRectElement | null = null;

	function handleDragOver(e: DragEvent) {
		if (!svgRef.value) return;
		const mp = toSvgCoords(e as unknown as MouseEvent);
		if (!mp) return;
		const col = Math.max(0, Math.floor(mp.x / 256));
		const row = Math.max(0, Math.floor(mp.y / 16));
		const typeId = ui.draggedModuleId;
		const modDef = typeId ? getModule(typeId) : null;
		const modHeight = (modDef?.height || 2) * 16;
		if (!dropGhost) {
			dropGhost = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			dropGhost.setAttribute('fill', 'rgba(100,200,100,0.25)');
			dropGhost.setAttribute('stroke', '#4ade80');
			dropGhost.setAttribute('stroke-width', '2');
			dropGhost.setAttribute('rx', '2');
			dropGhost.setAttribute('pointer-events', 'none');
			(svgRef.value as SVGElement).appendChild(dropGhost);
		}
		dropGhost.setAttribute('width', '256');
		dropGhost.setAttribute('height', String(modHeight));
		dropGhost.setAttribute('transform', `translate(${col * 256}, ${row * 16})`);
	}

	function clearDropGhost() {
		dropGhost?.remove();
		dropGhost = null;
	}

	function handleModuleDropOnWrapper(e: DragEvent) {
		clearDropGhost();
		const typeId = parseInt(e.dataTransfer?.getData('text/plain') || '0');
		if (!typeId || !svgRef.value) return;
		const mp = toSvgCoords(e as unknown as MouseEvent);
		if (!mp) return;
		const col = Math.max(0, Math.floor(mp.x / 256));
		const row = Math.max(0, Math.floor(mp.y / 16));
		emit('moduleDrop', { typeId, col, row });
	}

	function toSvgCoords(e: MouseEvent) {
		const svg = svgRef.value as SVGSVGElement | null;
		if (!svg?.getScreenCTM) return null;
		const ctm = svg.getScreenCTM();
		if (!ctm) return null;
		const pt = svg.createSVGPoint();
		pt.x = e.clientX;
		pt.y = e.clientY;
		return pt.matrixTransform(ctm.inverse());
	}
</script>
