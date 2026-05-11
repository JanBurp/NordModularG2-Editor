<template />

<script setup lang="ts">
	import { inject, watch, onMounted, onUnmounted, nextTick } from 'vue';
	import type { Ref } from 'vue';
	import { makePatchCables, removeAllCables, removeCableByKey, updateCablePaths, makeCableKey, applyCableVisibility } from '../../renderer/cableRenderer';
	import type { Cable, Module as CableModule } from '../../renderer/cableRenderer';
	import { getModule } from '../../renderer/nmg2mods';
	import { svgPath, svgLine, svgCircle } from '../../renderer/svgUtils';
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
	const SNAP_RANGE = 64;

	type SnapJack = JackInfo & { x: number; y: number };

	let previewCable: SVGPathElement | null = null;
	let dragSrcPos: { x: number; y: number } | null = null;
	let dragSrcColour = '';
	let dragSrcInfo: JackInfo | null = null;
	let hasDragged = false;
	let snapJack: SnapJack | null = null;
	let snapHighlight: SVGCircleElement | null = null;

	// --- Jack click cable cycle ---
	let cycleJack: JackInfo | null = null;
	let cycleIndex = -1;
	let cycleAllCableKeys: string[] = [];

	function clearCycleAllSelected() {
		if (!svgRef?.value || cycleAllCableKeys.length === 0) return;
		const svg = svgRef.value as SVGElement;
		for (const key of cycleAllCableKeys) {
			svg.querySelectorAll(`[data-cable-key="${key}"]`).forEach((el) => el.classList.remove('selected'));
		}
		cycleAllCableKeys = [];
	}

	function revealConnectedCables(info: JackInfo) {
		if (!svgRef?.value) return;
		const svg = svgRef.value as SVGElement;
		svg.querySelectorAll<SVGPathElement>('.svgcableborder[data-cable-key]').forEach((el) => {
			const smod = parseInt(el.getAttribute('data-smod') || '-1');
			const scon = parseInt(el.getAttribute('data-scon') || '-1');
			const dmod = parseInt(el.getAttribute('data-dmod') || '-1');
			const dcon = parseInt(el.getAttribute('data-dcon') || '-1');
			const dir = parseInt(el.getAttribute('data-dir') || '1');
			const key = el.getAttribute('data-cable-key')!;
			const matches =
				(info.type === 'output' && dir === 1 && smod === info.moduleIndex && scon === info.connectorIndex) ||
				(info.type === 'input' && dmod === info.moduleIndex && dcon === info.connectorIndex) ||
				(info.type === 'input' && dir === 0 && smod === info.moduleIndex && scon === info.connectorIndex);
			if (matches) {
				svg.querySelectorAll(`[data-cable-key="${key}"]`).forEach((e) => e.classList.remove('cable-hidden'));
			}
		});
	}

	function findAllCablesForJack(info: JackInfo): Cable[] {
		const result: Cable[] = [];
		for (const cable of props.cables as Cable[]) {
			const smod = cable.smod ?? cable.sourceModule;
			const scon = cable.scon ?? cable.sourceJack;
			const dmod = cable.dmod ?? cable.destModule;
			const dcon = cable.dcon ?? cable.destJack;
			const dir = cable.dir ?? 1;
			if (info.type === 'output' && dir === 1 && smod === info.moduleIndex && scon === info.connectorIndex) result.push(cable);
			if (info.type === 'input' && dmod === info.moduleIndex && dcon === info.connectorIndex) result.push(cable);
			if (info.type === 'input' && dir === 0 && smod === info.moduleIndex && scon === info.connectorIndex) result.push(cable);
		}
		return result;
	}

	function findSnapJack(mousePos: { x: number; y: number }): SnapJack | null {
		if (!dragSrcInfo) return null;
		const targetType: 'input' | 'output' = dragSrcInfo.type === 'input' ? 'output' : 'input';
		let bestDist = SNAP_RANGE;
		let best: SnapJack | null = null;
		for (const mod of props.modules as any[]) {
			const modDef = getModule(mod.type) as any;
			if (!modDef) continue;
			const baseX = mod.horiz * 256;
			const baseY = mod.vert * 16;
			const jacks: any[] = targetType === 'input' ? modDef.inputs || [] : modDef.outputs || [];
			jacks.forEach((jack: any, idx: number) => {
				const jx = jack.x + baseX;
				const jy = jack.y + baseY;
				const dist = Math.hypot(jx - mousePos.x, jy - mousePos.y);
				if (dist < bestDist) {
					bestDist = dist;
					best = { moduleIndex: mod.index, connectorIndex: idx, type: targetType, colour: jack.colour, x: jx, y: jy };
				}
			});
		}
		return best;
	}

	function updateSnapHighlight(snap: SnapJack | null) {
		if (!svgRef?.value) return;
		const svg = svgRef.value as SVGElement;
		if (!snap) {
			snapHighlight?.remove();
			snapHighlight = null;
			return;
		}
		if (!snapHighlight) {
			snapHighlight = svgCircle(snap.x, snap.y, 8, {
				fill: 'none',
				stroke: '#000',
				'stroke-width': '3',
				class: 'nomouse',
				opacity: '0.8',
			});
			svg.appendChild(snapHighlight);
		} else {
			snapHighlight.setAttribute('cx', String(snap.x));
			snapHighlight.setAttribute('cy', String(snap.y));
			snapHighlight.setAttribute('stroke', '#000');
		}
	}

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
		hasDragged = true;
		const mp = toSvgCoords(e);
		if (!mp) return;
		const svg = svgRef.value as SVGElement;

		snapJack = findSnapJack(mp);
		updateSnapHighlight(snapJack);

		const d = previewPath(dragSrcPos.x, dragSrcPos.y, mp.x, mp.y);
		if (!previewCable) {
			// previewCable = svgLine(dragSrcPos.x, dragSrcPos.y, mp.x, mp.y, {
			// 	fill: 'none',
			// 	stroke: '#000', //(JACK_COLORS as any)[dragSrcColour] || '#ffffff',
			// 	'stroke-width': '3',
			// 	opacity: '0.8',
			// 	class: 'cable-preview nomouse',
			// });
			previewCable = svgPath(d, {
				fill: 'none',
				stroke: '#000', //(JACK_COLORS as any)[dragSrcColour] || '#ffffff',
				'stroke-width': '3',
				opacity: '0.8',
				class: 'cable-preview nomouse',
			});
		} else {
			previewCable.setAttribute('d', d);
			// previewCable.setAttribute('x1', dragSrcPos.x);
			// previewCable.setAttribute('y1', dragSrcPos.y);
			// previewCable.setAttribute('x2', mp.x);
			// previewCable.setAttribute('y2', mp.y);
		}
		svg.appendChild(previewCable);
	}

	function clearDragPreview() {
		previewCable?.remove();
		previewCable = null;
		snapHighlight?.remove();
		snapHighlight = null;
		snapJack = null;
		dragSrcPos = null;
		dragSrcInfo = null;
		hasDragged = false;
		window.removeEventListener('mousemove', onMouseMovePreview);
		window.removeEventListener('mouseup', onWindowMouseup);
		if (svgRef?.value) applyCableVisibility(svgRef.value, cableVisibility.value);
	}

	function onWindowMouseup() {
		// Jack's own mouseup fires first → handleJackDragEnd → clearDragPreview removes this listener.
		// This only fires when mouse is released over empty canvas (not on any jack).
		const localSnapJack = snapJack;
		clearDragPreview();
		if (localSnapJack) emit('jackDragEnd', localSnapJack);
	}

	function handleJackDragStart(info: JackInfo) {
		const pos = getJackSvgPos(info);
		if (pos) {
			dragSrcPos = pos;
			dragSrcColour = info.colour;
			dragSrcInfo = info;
			hasDragged = false;
			window.addEventListener('mousemove', onMouseMovePreview);
			window.addEventListener('mouseup', onWindowMouseup);
			revealConnectedCables(info);
		}
		emit('jackDragStart', info);
	}

	function handleJackDragEnd(info: JackInfo) {
		if (!hasDragged) {
			const cables = findAllCablesForJack(info);
			clearDragPreview();

			if (cables.length === 0) {
				clearCycleAllSelected();
				cycleJack = null;
				cycleIndex = -1;
				return;
			}

			const sameJack =
				cycleJack?.moduleIndex === info.moduleIndex &&
				cycleJack?.connectorIndex === info.connectorIndex &&
				cycleJack?.type === info.type;

			clearCycleAllSelected();

			if (!sameJack) {
				cycleJack = info;
				cycleIndex = 0;
			} else {
				cycleIndex++;
			}

			if (cycleIndex < cables.length) {
				emit('cableClick', cables[cycleIndex]);
			} else if (cycleIndex === cables.length) {
				// All cables for this jack selected simultaneously
				uiStore.selectedCable = null;
				if (svgRef?.value) {
					const svg = svgRef.value as SVGElement;
					for (const cable of cables) {
						const key = makeCableKey(cable);
						svg.querySelectorAll(`[data-cable-key="${key}"]`).forEach((el) => el.classList.add('selected'));
						cycleAllCableKeys.push(key);
					}
				}
			} else {
				// Deselect all
				uiStore.selectedCable = null;
				cycleIndex = -1;
			}
		} else {
			clearDragPreview();
			emit('jackDragEnd', info);
		}
	}

	onUnmounted(() => {
		clearDragPreview();
	});

	defineExpose({ handleJackDragStart, handleJackDragEnd });
</script>
