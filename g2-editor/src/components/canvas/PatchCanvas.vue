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
				@param-change="onParamChange"
				@mode-change="onModeChange"
				@jack-drag-start="(info) => cablesRef?.handleJackDragStart(info)"
				@jack-drag-end="(info) => cablesRef?.handleJackDragEnd(info)"
				@module-drag-start="handleModuleDragStart"
				@module-label-edit="(info) => emit('moduleLabelEdit', info)"
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
				stroke-dasharray="4 4"
				pointer-events="none"
			/>
		</svg>
		<Cables
			ref="cablesRef"
			:modules="props.modules as any[]"
			:cables="props.cables as any[]"
			:selected-cable="props.selectedCable"
			@cable-click="emit('cableClick', $event)"
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
	import { useModuleSelecting } from '../../composables/useModuleSelecting';

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
		selectedCable: {
			type: Object as () => Cable | null,
			default: null,
		},
		selectedModuleIndices: {
			type: Array as () => number[],
			default: () => [],
		},
	});

	const emit = defineEmits<{
		paramChange: [moduleIndex: number, paramIndex: number, value: number];
		modeChange: [moduleIndex: number, index: number, value: number];
		cableClick: [cable: Cable];
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
		moduleMove: [info: { moduleIndex: number; col: number; row: number }];
		moduleDrop: [info: { typeId: number; col: number; row: number }];
		canvasClick: [];
		moduleLabelEdit: [info: { moduleIndex: number; currentLabel: string }];
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
	let dragGhost: SVGRectElement | null = null;
	let dragCurrentCol = 0;
	let dragCurrentRow = 0;

	function handleModuleDragStart(info: ModuleDragInfo) {
		dragModuleIndex = info.moduleIndex;
		dragStartClientX = info.clientX;
		dragStartClientY = info.clientY;
		window.addEventListener('mousemove', onModuleDragMove);
		window.addEventListener('mouseup', onModuleDragEnd);
	}

	function onModuleDragMove(e: MouseEvent) {
		if (dragModuleIndex === null) return;
		const dist = Math.hypot(e.clientX - dragStartClientX, e.clientY - dragStartClientY);
		if (dist < 5) return;

		if (!dragGhost) {
			const mod = (props.modules as any[]).find((m) => m.index === dragModuleIndex);
			if (!mod) return;
			const modDef = getModule(mod.type) as any;
			const modHeight = (modDef?.height || 2) * 16;
			dragGhost = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			dragGhost.setAttribute('width', '256');
			dragGhost.setAttribute('height', String(modHeight));
			dragGhost.setAttribute('fill', 'rgba(255,165,0,0.25)');
			dragGhost.setAttribute('stroke', 'orange');
			dragGhost.setAttribute('stroke-width', '2');
			dragGhost.setAttribute('rx', '2');
			dragGhost.setAttribute('pointer-events', 'none');
			(svgRef.value as SVGElement).appendChild(dragGhost);
		}

		const mp = toSvgCoords(e);
		if (!mp) return;
		dragCurrentCol = Math.max(0, Math.floor(mp.x / 256));
		dragCurrentRow = Math.max(0, Math.floor(mp.y / 16));
		dragGhost.setAttribute('transform', `translate(${dragCurrentCol * 256}, ${dragCurrentRow * 16})`);
	}

	function onModuleDragEnd(e: MouseEvent) {
		window.removeEventListener('mousemove', onModuleDragMove);
		window.removeEventListener('mouseup', onModuleDragEnd);
		const moduleIndex = dragModuleIndex;
		dragModuleIndex = null;
		if (dragGhost) {
			dragGhost.remove();
			dragGhost = null;
			if (moduleIndex !== null) {
				emit('moduleMove', {
					moduleIndex,
					col: dragCurrentCol,
					row: dragCurrentRow,
				});
			}
		} else {
			if (moduleIndex !== null) {
				handleModuleClick(moduleIndex, e.shiftKey);
			}
		}
	}

	function clearModuleDrag() {
		dragGhost?.remove();
		dragGhost = null;
		dragModuleIndex = null;
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
		const typeId = window.__g2DragTypeId;
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
		delete window.__g2DragTypeId;
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
