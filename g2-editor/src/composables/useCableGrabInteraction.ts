import { onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { makeCableKey, shiftCableEndpoint } from '../renderer/cableRenderer';
import type { Cable } from '../renderer/cableRenderer';
import { matchesCableJack, isCableSourceEnd, sameJack } from '../store/slotHelpers';
import type { JackEnd } from '../store/slotHelpers';
import { computeDrivenInputJacks } from '../parser/cableGraph';
import { useSettingsStore } from '../store/settings';
import { useUiStore } from '../store/ui';
import { toSvgCoords, getJackSvgPos, updateSnapHighlight, findNearestJack } from '../renderer/jackGeometry';
import { isGrabModifierPressed } from '../utils/platform';

export type { JackEnd };
type SnapEnd = JackEnd & { x: number; y: number };

type DragCable = { elements: SVGPathElement[]; originalD: string };

export function useCableGrabInteraction(
	svgRef: Ref<SVGSVGElement | null> | undefined,
	getModules: () => any[],
	getCables: () => Cable[],
	onCableGroupDrop: (group: Cable[], fromJack: JackEnd, toJack: JackEnd | null) => void,
) {
	const settings = useSettingsStore();
	const uiStore = useUiStore();

	let grabbedJack: JackEnd | null = null;
	let group: Cable[] = [];
	let drivenNestJacks: Set<string> | null = null;
	let hasDragged = false;
	let snapTarget: SnapEnd | null = null;
	let dragCables = new Map<string, DragCable>();
	let snapHighlight: SVGCircleElement | null = null;

	// Grabbing a cable identifies "the jack" you grabbed: whichever endpoint is closer to the click point.
	function findNearestEndpoint(cable: Cable, mouseSvgPos: { x: number; y: number }): JackEnd {
		const dir = cable.dir ?? 1;
		const sourceEnd: JackEnd = { moduleIndex: cable.smod, connectorIndex: cable.scon, type: dir === 1 ? 'output' : 'input' };
		const destEnd: JackEnd = { moduleIndex: cable.dmod, connectorIndex: cable.dcon, type: 'input' };
		const sourcePos = getJackSvgPos(getModules, sourceEnd);
		const destPos = getJackSvgPos(getModules, destEnd);
		if (!sourcePos) return destEnd;
		if (!destPos) return sourceEnd;
		const sourceDist = Math.hypot(sourcePos.x - mouseSvgPos.x, sourcePos.y - mouseSvgPos.y);
		const destDist = Math.hypot(destPos.x - mouseSvgPos.x, destPos.y - mouseSvgPos.y);
		return destDist < sourceDist ? destEnd : sourceEnd;
	}

	// All cables on the grabbed jack move together, narrowed to the selected subset if some of them are already selected.
	function computeGroup(jack: JackEnd): Cable[] {
		const jackCables = getCables().filter((c) => matchesCableJack(c, jack.moduleIndex, jack.connectorIndex, jack.type));
		const selectedKeys = new Set(uiStore.selectedCables.map(makeCableKey));
		const selectedSubset = jackCables.filter((c) => selectedKeys.has(makeCableKey(c)));
		return selectedSubset.length > 0 ? selectedSubset : jackCables;
	}

	// Is `jack` a valid place to relocate the grabbed group to? The grabbed jack itself is always
	// "valid" (the caller treats that as the no-op case) even though it wouldn't pass the checks below.
	function isValidDropCandidate(jack: JackEnd): boolean {
		if (!grabbedJack) return false;
		if (sameJack(jack, grabbedJack)) return true;
		if (jack.type !== grabbedJack.type) return false;
		if (drivenNestJacks?.has(`${jack.moduleIndex}-${jack.connectorIndex}`)) return false;
		return true;
	}

	// Reports the nearest valid drop target within range, plus whether a same-type jack that FAILED
	// validity (wrong nest state) sits nearer than any valid one — drives the "not-allowed" cursor.
	function findDropTarget(mouseSvgPos: { x: number; y: number }, jack: JackEnd): { jack: SnapEnd | null; invalidNearby: boolean } {
		return findNearestJack(
			getModules,
			mouseSvgPos,
			[jack.type],
			isValidDropCandidate,
			(candidate, _jackDef, x, y) => ({ ...candidate, x, y }),
			settings.cableMagneticRadius,
		);
	}

	// Snapshot each grabbed cable's rendered elements and current curve once, so the drag can shift them
	// live (without re-invoking Patchcord, which re-randomizes the shape) without re-querying the DOM or
	// re-reading their 'd' attribute on every mousemove, and can restore them exactly on a no-op/cancel.
	function captureDragCables(svg: SVGElement, cables: Cable[]) {
		dragCables = new Map();
		for (const cable of cables) {
			const key = makeCableKey(cable);
			const elements = Array.from(svg.querySelectorAll<SVGPathElement>(`[data-cable-key="${key}"]`));
			const originalD = elements[0]?.getAttribute('d');
			if (originalD) dragCables.set(key, { elements, originalD });
		}
	}

	function revertDragCables() {
		for (const { elements, originalD } of dragCables.values()) {
			elements.forEach((el) => el.setAttribute('d', originalD));
		}
	}

	// Always invoked together (grab end, unmount) — one teardown for interaction state and DOM/listener cleanup.
	function teardown() {
		grabbedJack = null;
		group = [];
		drivenNestJacks = null;
		hasDragged = false;
		snapTarget = null;
		dragCables = new Map();

		snapHighlight?.remove();
		snapHighlight = null;
		svgRef?.value?.classList.remove('cable-dragging', 'cable-invalid-target');
		window.removeEventListener('mousemove', onMove);
		window.removeEventListener('mouseup', onUp);
	}

	// Moves the real grabbed cable(s) live, in their own colors, instead of drawing a synthetic preview.
	function onMove(e: MouseEvent) {
		if (!grabbedJack) return;
		hasDragged = true;
		const mp = toSvgCoords(svgRef, e);
		if (!mp || !svgRef?.value) return;

		const dropTarget = findDropTarget(mp, grabbedJack);
		snapTarget = dropTarget.jack;
		snapHighlight = updateSnapHighlight(svgRef.value as SVGElement, snapHighlight, snapTarget);
		svgRef.value.classList.toggle('cable-invalid-target', dropTarget.invalidNearby);

		for (const cable of group) {
			const entry = dragCables.get(makeCableKey(cable));
			if (!entry) continue;
			const role: 'src' | 'dst' = isCableSourceEnd(cable, grabbedJack) ? 'src' : 'dst';
			const newD = shiftCableEndpoint(entry.originalD, role, mp.x, mp.y);
			entry.elements.forEach((el) => el.setAttribute('d', newD));
		}
	}

	// Shared conclusion for both drop paths: the distance-based window mouseup, and landing exactly on a jack.
	function finishGrab(target: JackEnd | null) {
		const localGroup = group;
		const localFromJack = grabbedJack;
		const wasDragged = hasDragged;
		const isNoOpDrop = target && localFromJack && sameJack(target, localFromJack);
		if (isNoOpDrop) revertDragCables(); // DOM was mutated live during the drag; nothing else will restore it
		teardown();

		if (!wasDragged || !localFromJack || isNoOpDrop) return;

		onCableGroupDrop(localGroup, localFromJack, target);
	}

	function onUp() {
		const target = snapTarget ? { moduleIndex: snapTarget.moduleIndex, connectorIndex: snapTarget.connectorIndex, type: snapTarget.type } : null;
		finishGrab(target);
	}

	// Releasing on a jack that can't take the drop reverts the cable rather than deleting it — deletion
	// is reserved for a genuine drop in empty canvas space (handled by onUp's null-target path above).
	function cancelGrab() {
		revertDragCables();
		teardown();
	}

	// Called when a mouseup lands directly on a jack (routed via the Vue emit chain, since that jack's
	// own mouseup handler stops native propagation and would otherwise swallow the window 'mouseup' above).
	// Returns true if a grab was in progress and this event was consumed.
	function handleJackMouseUp(jack: JackEnd): boolean {
		if (!grabbedJack) return false;
		if (isValidDropCandidate(jack)) finishGrab(jack);
		else cancelGrab();
		return true;
	}

	// Shared setup for both grab entry points: click-on-cable-body and Cmd/Ctrl-click-on-jack.
	function beginGrab(jack: JackEnd, jackGroup: Cable[]) {
		if (!svgRef?.value) return;
		grabbedJack = jack;
		group = jackGroup;
		drivenNestJacks = jack.type === 'input' ? computeDrivenInputJacks(getCables()) : null;
		hasDragged = false;
		snapTarget = null;
		captureDragCables(svgRef.value as SVGElement, group);
		svgRef.value.classList.add('cable-dragging');

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	function handleCableGrabStart(e: MouseEvent, cable: Cable) {
		if (!isGrabModifierPressed(e)) return;
		e.stopPropagation();
		const mp = toSvgCoords(svgRef, e);
		if (!mp || !svgRef?.value) return;

		const jack = findNearestEndpoint(cable, mp);
		if (!getJackSvgPos(getModules, jack)) return;

		beginGrab(jack, computeGroup(jack));
	}

	// Cmd/Ctrl-mousedown directly on a jack that already has cable(s) — mirrors the original editor's
	// jack-based re-route gesture. Returns false (not consumed) when the jack has no cable, so the
	// caller falls through to starting a brand-new cable drag instead.
	function handleJackGrabStart(e: MouseEvent, jack: JackEnd): boolean {
		const jackGroup = computeGroup(jack);
		if (jackGroup.length === 0) return false;
		e.stopPropagation();
		beginGrab(jack, jackGroup);
		return true;
	}

	onUnmounted(teardown);

	return { handleCableGrabStart, handleJackGrabStart, handleJackMouseUp };
}
