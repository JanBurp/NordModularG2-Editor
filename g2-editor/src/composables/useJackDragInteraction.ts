import { onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { applyCableVisibility } from '../renderer/cableRenderer';
import { toSvgCoords, getJackSvgPos, updateSnapHighlight, findNearestJack } from '../renderer/jackGeometry';
import { useCableVisibility } from './useCableVisibility';
import { useSettingsStore } from '../store/settings';
import { useUiStore } from '../store/ui';
import { matchesCableJack } from '../store/slotHelpers';
import { computeDrivenInputJacks } from '../parser/cableGraph';
import { armedSource, useJackPatching } from './useJackPatching';
import { useGhostCable } from './useGhostCable';
import type { JackDragInfo } from '../types';

type SnapJack = JackDragInfo & { x: number; y: number };

// Shared across instances so App.vue's Enter-key handler can commit whichever canvas's click-connect
// preview is currently live, without needing a direct reference to that Cables.vue instance.
export const clickModeSnapJack = ref<SnapJack | null>(null);

// Commits the currently snap-highlighted jack against the armed source. Shared by this file's own
// window-wide mousedown commit and by App.vue's Enter-key handling.
export async function commitClickModeSnap(): Promise<void> {
	const target = clickModeSnapJack.value;
	if (!target) return;
	const { armOrConnect } = useJackPatching();
	clickModeSnapJack.value = null;
	await armOrConnect(target);
}

export function useJackDragInteraction(
	svgRef: Ref<SVGSVGElement | null> | undefined,
	getModules: () => any[],
	getCables: () => any[],
	onJackDragStart: (info: JackDragInfo) => void,
	onJackDragEnd: (info: JackDragInfo) => void,
	areaIdx: 0 | 1,
) {
	const { cableVisibility } = useCableVisibility();
	const settings = useSettingsStore();
	const uiStore = useUiStore();
	const { ghostCable, clearGhostCable } = useGhostCable();

	let dragSrcPos: { x: number; y: number } | null = null;
	let dragSrcInfo: JackDragInfo | null = null;
	let hasDragged = false;
	let snapJack: SnapJack | null = null;
	let snapHighlight: SVGCircleElement | null = null;

	let cycleJack: JackDragInfo | null = null;
	let cycleIndex = -1;
	// Cached once at drag start (cables can't change mid-drag) instead of recomputed every mousemove.
	let drivenNestJacks: Set<string> | null = null;

	function revealConnectedCables(info: JackDragInfo) {
		if (!svgRef?.value) return;
		const svg = svgRef.value as SVGElement;
		svg.querySelectorAll<SVGPathElement>('.svgcableborder[data-cable-key]').forEach((el) => {
			const smod = parseInt(el.getAttribute('data-smod') || '-1');
			const scon = parseInt(el.getAttribute('data-scon') || '-1');
			const dmod = parseInt(el.getAttribute('data-dmod') || '-1');
			const dcon = parseInt(el.getAttribute('data-dcon') || '-1');
			const dir = parseInt(el.getAttribute('data-dir') || '1');
			const key = el.getAttribute('data-cable-key')!;
			const pseudoCable = { smod, scon, dmod, dcon, dir, colour: 0 };
			if (matchesCableJack(pseudoCable, info.moduleIndex, info.connectorIndex, info.type)) {
				svg.querySelectorAll(`[data-cable-key="${key}"]`).forEach((e) => e.classList.remove('cable-hidden'));
			}
		});
	}

	function findAllCablesForJack(info: JackDragInfo): any[] {
		const result: any[] = [];
		for (const cable of getCables()) {
			if (matchesCableJack(cable, info.moduleIndex, info.connectorIndex, info.type)) result.push(cable);
		}
		return result;
	}

	// Reports the nearest valid snap target within range, plus whether a same-type jack that FAILED
	// validity (self, or an already-driven nest) sits nearer than any valid one — drives the
	// "not-allowed" cursor.
	function findSnapJack(mousePos: { x: number; y: number }): { jack: SnapJack | null; invalidNearby: boolean } {
		if (!dragSrcInfo) return { jack: null, invalidNearby: false };
		const src = dragSrcInfo;
		const targetTypes: ('input' | 'output')[] = src.type === 'output' ? ['input'] : ['output', 'input'];
		return findNearestJack(
			getModules,
			mousePos,
			targetTypes,
			(candidate) => {
				const isSelf = candidate.moduleIndex === src.moduleIndex && candidate.connectorIndex === src.connectorIndex && candidate.type === src.type;
				const isDrivenConflict =
					candidate.type === 'input' && src.type === 'output' && drivenNestJacks?.has(`${candidate.moduleIndex}-${candidate.connectorIndex}`);
				return !isSelf && !isDrivenConflict;
			},
			(candidate, jackDef, x, y) => ({ ...candidate, colour: jackDef.colour, x, y }),
			settings.cableMagneticRadius,
		);
	}

	// Single ghost-cable preview shared by drag mode and click-connect mode alike (and by auto-suggest
	// elsewhere): runs from the source jack to the live mouse position, updated every move.
	function onMouseMovePreview(e: MouseEvent) {
		if (!dragSrcPos || !dragSrcInfo || !svgRef?.value) return;
		hasDragged = true;
		const mp = toSvgCoords(svgRef, e);
		if (!mp) return;
		const svg = svgRef.value as SVGElement;

		const snapResult = findSnapJack(mp);
		snapJack = snapResult.jack;
		snapHighlight = updateSnapHighlight(svg, snapHighlight, snapJack);
		svg.classList.toggle('cable-invalid-target', snapResult.invalidNearby);

		ghostCable.value = {
			area: areaIdx,
			from: { moduleIndex: dragSrcInfo.moduleIndex, connectorIndex: dragSrcInfo.connectorIndex, type: dragSrcInfo.type, colour: dragSrcInfo.colour },
			to: { x: mp.x, y: mp.y },
		};

		if (settings.cableConnectMode === 'click') {
			clickModeSnapJack.value = snapJack;
		}
	}

	// Click-connect mode: any mousedown anywhere commits the currently snap-highlighted jack — not
	// just a precise click on it (mirrors drag mode's magnetic-snap forgiveness). Capture phase so it
	// runs before a jack's own mousedown.stop handler would otherwise arm/re-process the click.
	function onCommitMousedown(e: MouseEvent) {
		if (e.button !== 0 || !clickModeSnapJack.value) return;
		e.preventDefault();
		e.stopPropagation();
		commitClickModeSnap();
	}

	function clearDragPreview() {
		snapHighlight?.remove();
		snapHighlight = null;
		snapJack = null;
		dragSrcPos = null;
		dragSrcInfo = null;
		drivenNestJacks = null;
		hasDragged = false;
		svgRef?.value?.classList.remove('cable-invalid-target');
		window.removeEventListener('mousemove', onMouseMovePreview);
		window.removeEventListener('mouseup', onWindowMouseup);
		window.removeEventListener('mousedown', onCommitMousedown, true);
		clearGhostCable();
		clickModeSnapJack.value = null;
		if (svgRef?.value) applyCableVisibility(svgRef.value, cableVisibility.value as unknown as Record<string, boolean>);
	}

	function onWindowMouseup() {
		const localSnapJack = snapJack;
		clearDragPreview();
		if (localSnapJack) onJackDragEnd(localSnapJack);
	}

	// Click-connect mode: arming a jack (see App.vue's armOrConnect wiring) starts the exact same
	// live-preview machinery a real drag uses (snap detection, highlight, ghost cable) — just without
	// a held mouse button, so there's no mouseup listener; a window-wide mousedown commits instead.
	watch(armedSource, (val) => {
		if (settings.cableConnectMode !== 'click') return;
		if (val && (val.area ?? 0) === areaIdx) {
			const pos = getJackSvgPos(getModules, val);
			if (pos) {
				dragSrcPos = pos;
				dragSrcInfo = val;
				hasDragged = false;
				drivenNestJacks = val.type === 'output' ? computeDrivenInputJacks(getCables()) : null;
				window.addEventListener('mousemove', onMouseMovePreview);
				window.addEventListener('mousedown', onCommitMousedown, true);
				revealConnectedCables(val);
			}
		} else {
			clearDragPreview();
		}
	});

	function handleJackDragStart(info: JackDragInfo) {
		if (settings.cableConnectMode === 'click') {
			onJackDragStart(info);
			return;
		}
		const pos = getJackSvgPos(getModules, info);
		if (pos) {
			dragSrcPos = pos;
			dragSrcInfo = info;
			hasDragged = false;
			// Only output-jack drags consult driven-nest jacks (see findSnapJack); compute once here.
			drivenNestJacks = info.type === 'output' ? computeDrivenInputJacks(getCables()) : null;
			window.addEventListener('mousemove', onMouseMovePreview);
			window.addEventListener('mouseup', onWindowMouseup);
			revealConnectedCables(info);
		}
		onJackDragStart(info);
	}

	function handleJackDragEnd(info: JackDragInfo) {
		// Click-connect mode never starts a drag preview (see handleJackDragStart above), so this
		// plain-mouseup gesture on a jack is superseded by armOrConnect() and must not also cycle
		// through the jack's connected cables.
		if (settings.cableConnectMode === 'click') return;
		if (!hasDragged) {
			const cables = findAllCablesForJack(info);
			clearDragPreview();

			if (cables.length === 0) {
				uiStore.selectedCables = [];
				cycleJack = null;
				cycleIndex = -1;
				return;
			}

			const sameJack = cycleJack?.moduleIndex === info.moduleIndex && cycleJack?.connectorIndex === info.connectorIndex && cycleJack?.type === info.type;

			if (!sameJack) {
				cycleJack = info;
				cycleIndex = 0;
			} else {
				cycleIndex++;
			}

			if (cycleIndex < cables.length) {
				uiStore.selectedCables = [cables[cycleIndex]];
			} else if (cycleIndex === cables.length) {
				uiStore.selectedCables = [...cables];
			} else {
				uiStore.selectedCables = [];
				cycleIndex = -1;
			}
		} else {
			clearDragPreview();
			onJackDragEnd(info);
		}
	}

	onUnmounted(() => {
		clearDragPreview();
	});

	return { handleJackDragStart, handleJackDragEnd };
}
