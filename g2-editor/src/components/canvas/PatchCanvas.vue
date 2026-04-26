<script setup lang="ts">
	import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
	import { makePatchCables, removeAllCables } from '../../renderer/cableRenderer';
	import type { Cable } from '../../renderer/cableRenderer';
	import { getModule } from '../../renderer/nmg2mods';
	import { svgPath } from '../../renderer/svgUtils';
	import '../../renderer/svgStyles.css';
	import Module from './Module.vue';
	import { CABLE_COLOR_INDEX_MAP, JACK_COLORS } from '../../constants';

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
		cableVisibility: {
			type: Object,
			default: () => ({
				red: true,
				blue: true,
				yellow: true,
				orange: true,
				green: true,
				purple: true,
				white: true,
			}),
		},
		shakeTrigger: {
			type: Number,
			default: 0,
		},
		selectedCable: {
			type: Object as () => Cable | null,
			default: null,
		},
	});

	const emit = defineEmits<{
		paramChange: [moduleIndex: number, paramIndex: number, value: number];
		cableClick: [cable: Cable];
		jackDragStart: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colour: string }];
		jackDragEnd: [info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colour: string }];
	}>();

	const canvasRef = ref(null);
	const svgRef = ref(null);
	const isInitialized = ref(false);

	const canvasWidth = computed(() => {
		if (props.modules.length === 0) return 1280;
		let maxX = 0;
		props.modules.forEach((m) => {
			const modDef = getModule(m.type);
			const modHeight = modDef?.height || 2;
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

	// Filter cables based on visibility settings
	const visibleCables = computed(() => {
		return props.cables.filter((cable) => {
			const colorIndex = cable.colour;
			const colorName = CABLE_COLOR_INDEX_MAP[colorIndex];
			return props.cableVisibility[colorName] !== false;
		});
	});

	function renderCables() {
		if (!svgRef.value) return;
		const svg = svgRef.value;
		removeAllCables(svg);

		if (visibleCables.value.length > 0) {
			makePatchCables(props.modules, visibleCables.value, svg, {
				selectedCable: props.selectedCable,
				onCableClick: (cable) => {
					emit('cableClick', cable);
				},
			});
		}
	}

	function updateCableVisibilityClasses() {
		if (!svgRef.value) return;
		const svg = svgRef.value;
		const cableElements = svg.querySelectorAll('[data-cable-color]');
		cableElements.forEach((el) => {
			const colorIndex = parseInt(el.getAttribute('data-cable-color') || '0', 10);
			const colorName = CABLE_COLOR_INDEX_MAP[colorIndex];
			if (colorName && colorName in props.cableVisibility) {
				const isHidden = props.cableVisibility[colorName] === false;
				el.classList.toggle('cable-hidden', isHidden);
			}
		});
	}

	function onParamChange(moduleIndex, paramIndex, value) {
		emit('paramChange', moduleIndex, paramIndex, value);
	}

	onMounted(async () => {
		await nextTick();
		isInitialized.value = true;
		renderCables();
	});

	watch(
		() => props.cables,
		() => {
			nextTick(() => {
				renderCables();
			});
		},
		{ deep: true },
	);

	// Watch for cable visibility changes - use CSS classes to hide/show cables
	watch(
		() => props.cableVisibility,
		() => {
			nextTick(() => {
				updateCableVisibilityClasses();
			});
		},
		{ deep: true },
	);

	// Watch for shake trigger to re-render cables
	watch(
		() => props.shakeTrigger,
		() => {
			nextTick(() => {
				renderCables();
			});
		},
	);

	// Watch for selectedCable changes: directly update border class, no full re-render
	watch(
		() => props.selectedCable,
		(newCable, oldCable) => {
			if (!svgRef.value) return;
			const svg = svgRef.value as SVGElement;
			if (oldCable) {
				const removeOldSelected = () => {
					const key = cableKey(oldCable as Cable);
					svg.querySelector(`.svgcableborder[data-cable-key="${key}"]`)?.classList.remove('selected');
				};
				if (newCable === null) {
					// Deselect/delete: defer so renderCables() runs first and removes the element
					nextTick(removeOldSelected);
				} else {
					// Switching cables: remove immediately for instant visual feedback
					removeOldSelected();
				}
			}
			if (newCable) {
				const key = cableKey(newCable as Cable);
				svg.querySelector(`.svgcableborder[data-cable-key="${key}"]`)?.classList.add('selected');
			}
		},
	);

	function cableKey(cable: Cable): string {
		return `${(cable as any).smod ?? (cable as any).sourceModule}-${(cable as any).scon ?? (cable as any).sourceJack}-${(cable as any).dmod ?? (cable as any).destModule}-${(cable as any).dcon ?? (cable as any).destJack}`;
	}

	// --- Drag preview ---
	type JackInfo = { moduleIndex: number; connectorIndex: number; type: 'input' | 'output'; colour: string };
	let previewCable: SVGPathElement | null = null;
	let dragSrcPos: { x: number; y: number } | null = null;
	let dragSrcColour = '';

	function getJackSvgPos(info: JackInfo) {
		const mod = (props.modules as any[]).find((m) => m.index === info.moduleIndex);
		if (!mod) return null;
		const modDef = getModule(mod.type) as any;
		if (!modDef) return null;
		const jacks = info.type === 'input' ? modDef.inputs : modDef.outputs;
		const jack = jacks?.[info.connectorIndex];
		if (!jack) return null;
		return { x: jack.x + mod.horiz * 256, y: jack.y + mod.vert * 16 };
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

	function previewPath(sx: number, sy: number, dx: number, dy: number): string {
		const dist = Math.hypot(dx - sx, dy - sy);
		const sag = Math.min(dist * 0.25, 60);
		const bot = Math.max(sy, dy) + sag;
		return `M${sx} ${sy} C${sx + (dx - sx) * 0.25} ${bot},${sx + (dx - sx) * 0.75} ${bot},${dx} ${dy}`;
	}

	function onMouseMovePreview(e: MouseEvent) {
		if (!dragSrcPos || !svgRef.value) return;
		const mp = toSvgCoords(e);
		if (!mp) return;
		const d = previewPath(dragSrcPos.x, dragSrcPos.y, mp.x, mp.y);
		const svg = svgRef.value as SVGElement;
		if (!previewCable) {
			previewCable = svgPath(d, {
				fill: 'none',
				stroke: (JACK_COLORS as any)[dragSrcColour] || '#ffffff',
				'stroke-width': '5',
				// 'stroke-dasharray': '6,4',
				opacity: '0.8',
				class: 'cable-preview nomouse',
			});
		} else {
			previewCable.setAttribute('d', d);
		}
		svg.appendChild(previewCable); // keep on top
	}

	function clearDragPreview() {
		previewCable?.remove();
		previewCable = null;
		dragSrcPos = null;
		window.removeEventListener('mousemove', onMouseMovePreview);
		window.removeEventListener('mouseup', onDragCancelMouseup);
	}

	function onDragCancelMouseup() {
		clearDragPreview();
	}

	function handleLocalJackDragStart(info: JackInfo) {
		const pos = getJackSvgPos(info);
		if (pos) {
			dragSrcPos = pos;
			dragSrcColour = info.colour;
			window.addEventListener('mousemove', onMouseMovePreview);
			window.addEventListener('mouseup', onDragCancelMouseup);
		}
		emit('jackDragStart', info);
	}

	function handleLocalJackDragEnd(info: JackInfo) {
		clearDragPreview();
		emit('jackDragEnd', info);
	}

	onUnmounted(() => {
		clearDragPreview();
	});
</script>

<template>
	<div class="patch-canvas-wrapper" ref="canvasRef">
		<svg ref="svgRef" class="patch-canvas" font-size="9" :width="canvasWidth" :height="canvasHeight" xmlns="http://www.w3.org/2000/svg">
			<Module
				v-for="mod in modulesWithVariation"
				:key="mod.index"
				:type="mod.type"
				:instance="mod"
				@param-change="onParamChange"
				@jack-drag-start="handleLocalJackDragStart"
				@jack-drag-end="handleLocalJackDragEnd"
			/>
		</svg>
	</div>
</template>

<style scoped>
	.patch-canvas-wrapper {
		position: relative;
		overflow: auto;
		background: #666;
		min-height: 400px;
		height: 100%;
		flex: 1;
	}

	.patch-canvas {
		overflow: visible;
		display: block;
	}
</style>
