<template />

<script setup lang="ts">
	import { inject, watch, onMounted, onUnmounted, nextTick } from 'vue';
	import type { Ref } from 'vue';
	import { makePatchCables, removeAllCables, removeCableByKey, updateCablePaths, makeCableKey, applyCableVisibility } from '../../renderer/cableRenderer';
	import type { Cable, Module as CableModule } from '../../renderer/cableRenderer';
	import { getModule } from '../../renderer/nmg2mods';
	import { svgPath } from '../../renderer/svgUtils';
	import { JACK_COLORS } from '../../constants';
	import { useCableVisibility } from '../../composables/useCableVisibility';
	import { useUiStore } from '../../store/ui';

	const props = defineProps({
		modules: {
			type: Array,
			default: () => [],
		},
		cables: {
			type: Array,
			default: () => [],
		},
		selectedCable: {
			type: Object as () => Cable | null,
			default: null,
		},
	});

	type JackInfo = {
		moduleIndex: number;
		connectorIndex: number;
		type: 'input' | 'output';
		colour: string;
	};

	const emit = defineEmits<{
		cableClick: [cable: Cable];
		jackDragStart: [info: JackInfo];
		jackDragEnd: [info: JackInfo];
	}>();

	const svgRef = inject<Ref<SVGSVGElement | null>>('patchCanvasSvg');

	const { cableVisibility } = useCableVisibility();
	const uiStore = useUiStore();

	function renderCables() {
		if (!svgRef?.value) return;
		const svg = svgRef.value;
		removeAllCables(svg);

		if (props.cables.length > 0) {
			makePatchCables(props.modules, props.cables, svg, {
				selectedCable: props.selectedCable,
				onCableClick: (cable) => {
					emit('cableClick', cable);
				},
			});
		}
		applyCableVisibility(svg, cableVisibility.value);
	}

	onMounted(() => {
		nextTick(() => renderCables());
	});

	// Diff-based cables watch: only add new cables / remove deleted ones.
	watch(
		() => props.cables,
		() => {
			nextTick(() => {
				if (!svgRef?.value) return;
				const svg = svgRef.value as SVGElement;

				const renderedKeys = new Set<string>();
				svg.querySelectorAll<SVGPathElement>('.svgcableborder[data-cable-key]').forEach((el) => {
					renderedKeys.add(el.getAttribute('data-cable-key')!);
				});

				const wantedMap = new Map<string, any>(props.cables.map((c) => [makeCableKey(c), c]));

				for (const key of renderedKeys) {
					if (!wantedMap.has(key)) removeCableByKey(svg, key);
				}

				for (const [key, cable] of wantedMap) {
					if (!renderedKeys.has(key)) {
						makePatchCables(props.modules as CableModule[], [cable], svg, {
							selectedCable: props.selectedCable,
							onCableClick: (c) => emit('cableClick', c),
						});
					}
				}

				applyCableVisibility(svgRef.value!, cableVisibility.value);
			});
		},
	);

	// When module positions change, re-path only cables connected to moved modules.
	watch(
		() => props.modules,
		(newMods, oldMods) => {
			nextTick(() => {
				if (!svgRef?.value || !oldMods) return;
				const movedIds = new Set<number>();
				for (const m of newMods as any[]) {
					const prev = (oldMods as any[]).find((o: any) => o.index === m.index);
					if (!prev || prev.horiz !== m.horiz || prev.vert !== m.vert) movedIds.add(m.index);
				}
				if (movedIds.size > 0) updateCablePaths(props.modules as CableModule[], svgRef.value as SVGElement, movedIds);
			});
		},
	);

	// Watch for cable visibility changes — use CSS classes to hide/show cables.
	watch(
		cableVisibility,
		() => {
			nextTick(() => {
				if (svgRef?.value) applyCableVisibility(svgRef.value, cableVisibility.value);
			});
		},
		{ deep: true },
	);

	// Watch for shake trigger to re-render cables with new random curves.
	watch(
		() => uiStore.cableShakeCount,
		() => {
			nextTick(() => renderCables());
		},
	);

	// Watch for selectedCable changes: directly update border class, no full re-render.
	watch(
		() => props.selectedCable,
		(newCable, oldCable) => {
			if (!svgRef?.value) return;
			const svg = svgRef.value as SVGElement;
			if (oldCable) {
				const removeOldSelected = () => {
					const key = cableKey(oldCable as Cable);
					svg.querySelector(`.svgcableborder[data-cable-key="${key}"]`)?.classList.remove('selected');
				};
				if (newCable === null) {
					nextTick(removeOldSelected);
				} else {
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

	// --- Jack drag preview ---
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
		const svg = svgRef?.value as SVGSVGElement | null;
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
		if (!dragSrcPos || !svgRef?.value) return;
		const mp = toSvgCoords(e);
		if (!mp) return;
		const d = previewPath(dragSrcPos.x, dragSrcPos.y, mp.x, mp.y);
		const svg = svgRef.value as SVGElement;
		if (!previewCable) {
			previewCable = svgPath(d, {
				fill: 'none',
				stroke: (JACK_COLORS as any)[dragSrcColour] || '#ffffff',
				'stroke-width': '5',
				opacity: '0.8',
				class: 'cable-preview nomouse',
			});
		} else {
			previewCable.setAttribute('d', d);
		}
		svg.appendChild(previewCable);
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

	function handleJackDragStart(info: JackInfo) {
		const pos = getJackSvgPos(info);
		if (pos) {
			dragSrcPos = pos;
			dragSrcColour = info.colour;
			window.addEventListener('mousemove', onMouseMovePreview);
			window.addEventListener('mouseup', onDragCancelMouseup);
		}
		emit('jackDragStart', info);
	}

	function handleJackDragEnd(info: JackInfo) {
		clearDragPreview();
		emit('jackDragEnd', info);
	}

	onUnmounted(() => {
		clearDragPreview();
	});

	defineExpose({ handleJackDragStart, handleJackDragEnd });
</script>
