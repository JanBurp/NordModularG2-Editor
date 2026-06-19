<template>
	<div
		class="overflow-auto bg-neutral-700 relative h-full w-full"
		:data-testid="`canvas-${area}`"
		@dragover.prevent="handleDragOver"
		@dragleave="clearDropGhost"
		@drop.prevent="handleModuleDropOnWrapper"
	>
		<svg
			ref="svgRef"
			font-size="9"
			:width="canvasWidth"
			:height="canvasHeight"
			xmlns="http://www.w3.org/2000/svg"
			@mousedown="handleCanvasMousedown"
			@mousemove="handleSvgMouseMove"
			@click="
				emit('canvasClick');
				handleCanvasClick();
			"
		>
			<text :font-size="160" x="50%" y="50%" width="100%" height="100%" text-anchor="">{{ getAreaByShort(area) }}</text>

			<Module
				v-for="mod in props.modules as any[]"
				:key="mod.index + '-' + mod.uname"
				:instance="mod"
				:is-selected="props.selectedModuleIndices.includes(mod.index)"
				:connected-inputs="connectedJacksMap.get(mod.index)?.inputs"
				:connected-outputs="connectedJacksMap.get(mod.index)?.outputs"
				:area-label="props.area as 'fx' | 'va'"
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
			<DragGhost :ghosts="dragGhosts" />
			<CCBadgesOverlay :modules="props.modules as ModuleInstance[]" :area-label="props.area as 'fx' | 'va'" />
		</svg>
		<Cables
			ref="cablesRef"
			:modules="props.modules as any[]"
			:cables="props.cables as Cable[]"
			:selected-cables="props.selectedCables"
			@jack-drag-start="emit('jackDragStart', $event)"
			@jack-drag-end="emit('jackDragEnd', $event)"
		/>
		<div ref="selectionRectEl" class="selection-rect" />
	</div>
</template>
<script setup lang="ts">
	import { ref, onUnmounted, computed, provide } from 'vue';
	import type { Cable } from '../../renderer/cableRenderer';
	import type { ModuleInstance } from '../../types';
	import { getModule } from '../../renderer/nmg2mods';
	import '../../renderer/svgStyles.css';
	import Module from './Module.vue';
	import Cables from './Cables.vue';
	import DragGhost from './DragGhost.vue';
	import CCBadgesOverlay from './CCBadgesOverlay.vue';
	import { useModuleSelecting } from '../../composables/useModuleSelecting';
	import { useModuleDrag } from '../../composables/useModuleDrag';
	import { useModuleDrop } from '../../composables/useModuleDrop';
	import { useUiStore } from '../../store/ui';
	import { getAreaByShort, MODULE_WIDTH, MODULE_ROW_HEIGHT } from '../../constants/ui';

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
	const selectionRectEl = ref<HTMLDivElement | null>(null);

	const { handleCanvasMousedown, handleModuleClick, handleCanvasClick } = useModuleSelecting(
		svgRef,
		computed(() => props.modules as any[]),
		selectionRectEl,
		props.area,
	);

	const canvasWidth = computed(() => {
		if (props.modules.length === 0) return 1280;
		let maxX = 0;
		(props.modules as any[]).forEach((m: any) => {
			const mx = (m.horiz + 1) * MODULE_WIDTH;
			if (mx > maxX) maxX = mx;
		});
		return Math.max(maxX + 100, 1280);
	});

	const canvasHeight = computed(() => {
		if (props.modules.length === 0) return 600;
		let maxY = 0;
		(props.modules as any[]).forEach((m: any) => {
			const modDef = getModule(m.type);
			const modHeight = modDef?.height || 2;
			const my = (m.vert + modHeight) * MODULE_ROW_HEIGHT;
			if (my > maxY) maxY = my;
		});
		return Math.max(maxY + 100, 600);
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

	function onParamChange(moduleIndex: number, paramIndex: number, value: number, immediate?: boolean) {
		emit('paramChange', moduleIndex, paramIndex, value, immediate);
	}

	function onModeChange(moduleIndex: number, index: number, value: number) {
		emit('modeChange', moduleIndex, index, value);
	}

	const { dragGhosts, handleModuleDragStart, clearModuleDrag } = useModuleDrag(
		() => props.modules as any[],
		(info) => emit('moduleMove', info),
		(index, shiftKey) => handleModuleClick(index, shiftKey),
	);

	const { handleDragOver, clearDropGhost, handleModuleDropOnWrapper } = useModuleDrop(svgRef, (info) => emit('moduleDrop', info));

	const uiStore = useUiStore();

	function handleSvgMouseMove(e: MouseEvent) {
		const svg = svgRef.value;
		if (!svg?.getScreenCTM) return;
		const ctm = svg.getScreenCTM();
		if (!ctm) return;
		const pt = svg.createSVGPoint();
		pt.x = e.clientX;
		pt.y = e.clientY;
		const svgPt = pt.matrixTransform(ctm.inverse());
		uiStore.lastMousePos = {
			col: Math.max(0, Math.floor(svgPt.x / MODULE_WIDTH)),
			row: Math.max(0, Math.floor(svgPt.y / MODULE_ROW_HEIGHT)),
			area: props.area as 'va' | 'fx',
		};
	}

	onUnmounted(() => {
		clearModuleDrag();
		clearDropGhost();
	});
</script>
