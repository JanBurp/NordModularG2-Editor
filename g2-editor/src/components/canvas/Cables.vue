<template />

<script setup lang="ts">
	import { inject, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';
	import type { Ref } from 'vue';
	import {
		makePatchCables,
		removeAllCables,
		removeCableByKey,
		updateCablePaths,
		makeCableKey,
		applyCableVisibility,
		updateCableStyles,
		updateCableGravity,
	} from '../../renderer/cableRenderer';
	import type { Cable, Module as CableModule } from '../../renderer/cableRenderer';
	import { useCableVisibility } from '../../composables/useCableVisibility';
	import { useUiStore } from '../../store/ui';
	import { useSettingsStore } from '../../store/settings';
	import { useJackDragInteraction } from '../../composables/useJackDragInteraction';
	import { useCableGrabInteraction } from '../../composables/useCableGrabInteraction';
	import { matchesCableJack } from '../../store/slotHelpers';
	import type { JackDragInfo } from '../../types';

	type JackEnd = { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' };

	const props = defineProps({
		modules: {
			type: Array,
			default: () => [],
		},
		cables: {
			type: Array,
			default: () => [],
		},
		selectedCables: {
			type: Array as () => Cable[],
			default: () => [],
		},
		hoveredJack: {
			type: Object as () => JackEnd | null,
			default: null,
		},
	});

	const emit = defineEmits<{
		jackDragStart: [info: JackDragInfo];
		jackDragEnd: [info: JackDragInfo];
		cableGroupDrop: [info: { group: Cable[]; fromJack: JackEnd; toJack: JackEnd | null }];
	}>();

	const svgRef = inject<Ref<SVGSVGElement | null>>('patchCanvasSvg');

	const { cableVisibility } = useCableVisibility();
	const uiStore = useUiStore();
	const settings = useSettingsStore();

	// Cables touching the currently-hovered jack stay visible even if hidden by the color filter.
	const hoverRevealKeys = computed<Set<string>>(() => {
		const h = props.hoveredJack as JackEnd | null;
		if (!h) return new Set();
		return new Set((props.cables as Cable[]).filter((c) => matchesCableJack(c, h.moduleIndex, h.connectorIndex, h.type)).map(makeCableKey));
	});

	function renderCables() {
		if (!svgRef?.value) return;
		const svg = svgRef.value;
		removeAllCables(svg);

		if (props.cables.length > 0) {
			makePatchCables(props.modules as CableModule[], props.cables as Cable[], svg, {
				selectedCables: props.selectedCables as Cable[],
				gravity: settings.cableGravity,
				opacity: settings.cableOpacity,
				thickness: settings.cableThickness,
				onCableGrabStart: handleCableGrabStart,
			});
		}
		applyCableVisibility(svg, cableVisibility.value as unknown as Record<string, boolean>, hoverRevealKeys.value);
	}

	// Cable hit-areas only become interactive while Ctrl/Cmd is held (see .cable-grab-mode in svgStyles.css),
	// so plain clicks/drags on cables keep falling through to the canvas exactly as before.
	function updateGrabMode(e: Event) {
		const isCtrlHeld = 'ctrlKey' in e && ((e as KeyboardEvent).ctrlKey || (e as KeyboardEvent).metaKey);
		svgRef?.value?.classList.toggle('cable-grab-mode', isCtrlHeld);
	}

	onMounted(() => {
		nextTick(() => renderCables());
		window.addEventListener('keydown', updateGrabMode);
		window.addEventListener('keyup', updateGrabMode);
		window.addEventListener('blur', updateGrabMode);
	});

	onUnmounted(() => {
		window.removeEventListener('keydown', updateGrabMode);
		window.removeEventListener('keyup', updateGrabMode);
		window.removeEventListener('blur', updateGrabMode);
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

				const wantedMap = new Map<string, any>((props.cables as Cable[]).map((c) => [makeCableKey(c), c]));

				for (const key of renderedKeys) {
					if (!wantedMap.has(key)) removeCableByKey(svg, key);
				}

				const cableOptions = {
					selectedCables: props.selectedCables,
					gravity: settings.cableGravity,
					opacity: settings.cableOpacity,
					thickness: settings.cableThickness,
					onCableGrabStart: handleCableGrabStart,
				};
				for (const [key, cable] of wantedMap) {
					if (!renderedKeys.has(key)) {
						makePatchCables(props.modules as CableModule[], [cable], svg, cableOptions);
					} else {
						// Re-render if colour changed
						const border = svg.querySelector<SVGPathElement>(`.svgcableborder[data-cable-key="${key}"]`);
						if (border && border.getAttribute('data-cable-color') !== String(cable.colour)) {
							removeCableByKey(svg, key);
							makePatchCables(props.modules as CableModule[], [cable], svg, cableOptions);
						}
					}
				}

				applyCableVisibility(svgRef.value!, cableVisibility.value as unknown as Record<string, boolean>, hoverRevealKeys.value);
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
				const oldById = new Map((oldMods as any[]).map((o: any) => [o.index, o]));
				for (const m of newMods as any[]) {
					const prev = oldById.get(m.index);
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
			if (svgRef?.value) applyCableVisibility(svgRef.value, cableVisibility.value as unknown as Record<string, boolean>, hoverRevealKeys.value);
		},
		{ deep: true },
	);

	// Watch for hovered-jack changes — reveal/hide the hovered jack's cables independent of the color filter.
	watch(hoverRevealKeys, () => {
		if (svgRef?.value) applyCableVisibility(svgRef.value, cableVisibility.value as unknown as Record<string, boolean>, hoverRevealKeys.value);
	});

	// Watch for shake trigger to re-render cables with new random curves.
	watch(
		() => uiStore.cableShakeCount,
		() => {
			nextTick(() => renderCables());
		},
	);

	// Gravity: shift existing control points — no re-randomization.
	watch(
		() => settings.cableGravity,
		(newVal, oldVal) => {
			nextTick(() => {
				if (svgRef?.value) updateCableGravity(svgRef.value, oldVal, newVal);
			});
		},
	);

	// Opacity / thickness: update styles on existing elements — no re-randomization.
	watch(
		() => [settings.cableOpacity, settings.cableThickness] as const,
		() => {
			if (svgRef?.value) updateCableStyles(svgRef.value, settings.cableOpacity, settings.cableThickness);
		},
	);

	// Watch selectedCables array: diff old vs new by key, toggle 'selected' class.
	watch(
		() => props.selectedCables,
		(newCables, oldCables) => {
			if (!svgRef?.value) return;
			const svg = svgRef.value as SVGElement;
			const newKeys = new Set((newCables ?? []).map(makeCableKey));
			const oldKeys = new Set((oldCables ?? []).map(makeCableKey));
			for (const key of oldKeys) {
				if (!newKeys.has(key)) svg.querySelectorAll(`[data-cable-key="${key}"]`).forEach((el) => el.classList.remove('selected'));
			}
			for (const key of newKeys) {
				if (!oldKeys.has(key)) svg.querySelectorAll(`[data-cable-key="${key}"]`).forEach((el) => el.classList.add('selected'));
			}
		},
		// selectedCables is always replaced with a new array (never mutated in place),
		// so a reference watch suffices — deep traversal would only add spurious re-runs.
	);

	const { handleJackDragStart, handleJackDragEnd } = useJackDragInteraction(
		svgRef,
		() => props.modules as any[],
		() => props.cables as any[],
		(info) => emit('jackDragStart', info),
		(info) => emit('jackDragEnd', info),
	);

	const { handleCableGrabStart } = useCableGrabInteraction(
		svgRef,
		() => props.modules as any[],
		() => props.cables as Cable[],
		(group, fromJack, toJack) => emit('cableGroupDrop', { group, fromJack, toJack }),
	);

	defineExpose({ handleJackDragStart, handleJackDragEnd });
</script>
