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
		applyVisibilityToElement,
		emphasizeCableByKey,
	} from '../../renderer/cableRenderer';
	import type { Cable, Module as CableModule } from '../../renderer/cableRenderer';
	import { useCableVisibility } from '../../composables/useCableVisibility';
	import { useUiStore } from '../../store/ui';
	import { useSettingsStore } from '../../store/settings';
	import { useJackDragInteraction } from '../../composables/useJackDragInteraction';
	import { useCableGrabInteraction } from '../../composables/useCableGrabInteraction';
	import { findJackNestCables } from '../../parser/cableGraph';
	import type { JackEnd } from '../../store/slotHelpers';
	import { isGrabModifierPressed } from '../../utils/platform';
	import type { JackDragInfo } from '../../types';

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
		area: {
			type: Number as () => 0 | 1,
			default: 0,
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

	// Cables in the whole nest reachable from the currently-hovered jack stay visible even if hidden
	// by the color filter (not just the one cable touching the hovered jack).
	const hoverRevealKeys = computed<Set<string>>(() => {
		const h = props.hoveredJack as JackEnd | null;
		if (!h) return new Set();
		return new Set(findJackNestCables(props.cables as Cable[], h.moduleIndex, h.connectorIndex, h.type).map(makeCableKey));
	});

	function renderCables() {
		if (!svgRef?.value) return;
		const svg = svgRef.value;
		removeAllCables(svg);

		if (props.cables.length > 0) {
			makePatchCables(props.modules as CableModule[], props.cables as Cable[], svg, {
				selectedCables: props.selectedCables as Cable[],
				gravity: settings.cableGravity,
				seed: uiStore.cableSeed,
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
		const isGrabHeld = 'ctrlKey' in e && isGrabModifierPressed(e as KeyboardEvent);
		svgRef?.value?.classList.toggle('cable-grab-mode', isGrabHeld);
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
					seed: uiStore.cableSeed,
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

	// Watch for hovered-jack changes: diff old vs new keys, touching only the cables that changed
	// instead of rescanning every cable in the patch (mirrors the selectedCables watcher below).
	watch(hoverRevealKeys, (newKeys, oldKeys) => {
		if (!svgRef?.value) return;
		const svg = svgRef.value as SVGElement;
		for (const key of newKeys) {
			if (!oldKeys?.has(key)) emphasizeCableByKey(svg, key);
		}
		for (const key of oldKeys ?? []) {
			if (newKeys.has(key)) continue;
			svg.querySelectorAll<Element>(`[data-cable-key="${key}"]`).forEach((el) =>
				applyVisibilityToElement(el, cableVisibility.value as unknown as Record<string, boolean>),
			);
		}
	});

	// Watch for shake trigger to re-render cables with new random curves.
	watch(
		() => uiStore.cableShakeCount,
		() => {
			nextTick(() => renderCables());
		},
	);

	// Gravity changes handle lengths, so recompute all curves (same seed → same twist).
	watch(
		() => settings.cableGravity,
		() => {
			nextTick(() => renderCables());
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
		props.area,
	);

	const {
		handleCableGrabStart,
		handleJackGrabStart,
		handleJackMouseUp: handleCableGrabJackMouseUp,
	} = useCableGrabInteraction(
		svgRef,
		() => props.modules as any[],
		() => props.cables as Cable[],
		(group, fromJack, toJack) => emit('cableGroupDrop', { group, fromJack, toJack }),
	);

	// A jack's own mouseup handler stops native propagation, so a cable-grab in progress must be
	// offered the event via this same Vue-emit chain before falling through to the normal jack-drag flow.
	function handleJackDragEndOrGrabDrop(info: JackDragInfo) {
		if (handleCableGrabJackMouseUp(info)) return;
		handleJackDragEnd(info);
	}

	// Cmd/Ctrl-mousedown on a jack that already has a cable grabs it for re-routing (mirrors the
	// original editor's jack-based gesture) instead of starting a brand-new cable drag.
	function handleJackDragStartOrGrab(info: JackDragInfo, e: MouseEvent) {
		if (isGrabModifierPressed(e) && handleJackGrabStart(e, info)) return;
		handleJackDragStart(info);
	}

	defineExpose({ handleJackDragStart: handleJackDragStartOrGrab, handleJackDragEnd: handleJackDragEndOrGrabDrop });
</script>
