import { onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { getModule } from '../renderer/nmg2mods';
import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '@/constants';
import { svgCircle } from '../renderer/svgUtils';
import { makeCableKey, shiftCableEndpoint } from '../renderer/cableRenderer';
import type { Cable } from '../renderer/cableRenderer';
import { matchesCableJack, isCableSourceEnd } from '../store/slotHelpers';
import { computeDrivenInputJacks } from '../parser/cableGraph';
import { useUiStore } from '../store/ui';
import { SNAP_RANGE } from './useJackDragInteraction';
import { isGrabModifierPressed } from '../utils/platform';

export type JackEnd = { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' };
type SnapEnd = JackEnd & { x: number; y: number };

const sameJack = (a: JackEnd, b: JackEnd) => a.moduleIndex === b.moduleIndex && a.connectorIndex === b.connectorIndex && a.type === b.type;

export function useCableGrabInteraction(
	svgRef: Ref<SVGSVGElement | null> | undefined,
	getModules: () => any[],
	getCables: () => Cable[],
	onCableGroupDrop: (group: Cable[], fromJack: JackEnd, toJack: JackEnd | null) => void,
) {
	const uiStore = useUiStore();

	let grabbedJack: JackEnd | null = null;
	let group: Cable[] = [];
	let groupHasIncomingDriver = false;
	let hasDragged = false;
	let snapTarget: SnapEnd | null = null;
	let originalPaths = new Map<string, string>();
	let snapHighlight: SVGCircleElement | null = null;

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

	function jackSvgPos(end: JackEnd): { x: number; y: number } | null {
		const mod = getModules().find((m) => m.index === end.moduleIndex);
		if (!mod) return null;
		const modDef = getModule(mod.type);
		if (!modDef) return null;
		const jacks = end.type === 'input' ? modDef.inputs : modDef.outputs;
		const jack = jacks?.[end.connectorIndex];
		if (!jack) return null;
		return { x: jack.x + mod.horiz * MODULE_WIDTH, y: jack.y + mod.vert * MODULE_ROW_HEIGHT };
	}

	// Grabbing a cable identifies "the jack" you grabbed: whichever endpoint is closer to the click point.
	function findNearestEndpoint(cable: Cable, mouseSvgPos: { x: number; y: number }): JackEnd {
		const dir = cable.dir ?? 1;
		const sourceEnd: JackEnd = { moduleIndex: cable.smod, connectorIndex: cable.scon, type: dir === 1 ? 'output' : 'input' };
		const destEnd: JackEnd = { moduleIndex: cable.dmod, connectorIndex: cable.dcon, type: 'input' };
		const sourcePos = jackSvgPos(sourceEnd);
		const destPos = jackSvgPos(destEnd);
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
		if (groupHasIncomingDriver && jack.type === 'input' && computeDrivenInputJacks(getCables()).has(`${jack.moduleIndex}-${jack.connectorIndex}`)) {
			return false;
		}
		return true;
	}

	function findDropTarget(mouseSvgPos: { x: number; y: number }, jack: JackEnd, excludeDrivenInputs: boolean): SnapEnd | null {
		const drivenNestJacks = excludeDrivenInputs ? computeDrivenInputJacks(getCables()) : null;
		let bestDist = SNAP_RANGE;
		let best: SnapEnd | null = null;
		for (const mod of getModules()) {
			const modDef = getModule(mod.type);
			if (!modDef) continue;
			const baseX = mod.horiz * MODULE_WIDTH;
			const baseY = mod.vert * MODULE_ROW_HEIGHT;
			const jacks = jack.type === 'input' ? (modDef.inputs ?? []) : (modDef.outputs ?? []);
			jacks.forEach((j, idx) => {
				// The grabbed jack itself must stay a valid candidate: dropping back on it should be
				// detected (and treated as a no-op by the caller), not skipped and mistaken for empty space.
				const isGrabbedJack = mod.index === jack.moduleIndex && idx === jack.connectorIndex;
				if (!isGrabbedJack && drivenNestJacks?.has(`${mod.index}-${idx}`)) return;
				const jx = j.x + baseX;
				const jy = j.y + baseY;
				const dist = Math.hypot(jx - mouseSvgPos.x, jy - mouseSvgPos.y);
				if (dist < bestDist) {
					bestDist = dist;
					best = { moduleIndex: mod.index, connectorIndex: idx, type: jack.type, x: jx, y: jy };
				}
			});
		}
		return best;
	}

	function updateSnapHighlight(snap: SnapEnd | null) {
		if (!svgRef?.value) return;
		const svg = svgRef.value as SVGElement;
		if (!snap) {
			snapHighlight?.remove();
			snapHighlight = null;
			return;
		}
		if (!snapHighlight) {
			snapHighlight = svgCircle(snap.x, snap.y, 8, { fill: 'none', stroke: '#000', 'stroke-width': '3', class: 'nomouse', opacity: '0.8' });
			svg.appendChild(snapHighlight);
		} else {
			snapHighlight.setAttribute('cx', String(snap.x));
			snapHighlight.setAttribute('cy', String(snap.y));
		}
	}

	// Snapshot each grabbed cable's currently-rendered curve so it can be shifted live during the drag
	// (without re-invoking Patchcord, which re-randomizes the shape) and restored on a no-op/cancel.
	function captureOriginalPaths(svg: SVGElement, cables: Cable[]) {
		originalPaths = new Map();
		for (const cable of cables) {
			const key = makeCableKey(cable);
			const d = svg.querySelector<SVGPathElement>(`.svgcableborder[data-cable-key="${key}"]`)?.getAttribute('d');
			if (d) originalPaths.set(key, d);
		}
	}

	function revertPaths(svg: SVGElement) {
		for (const [key, d] of originalPaths) {
			svg.querySelectorAll<SVGPathElement>(`[data-cable-key="${key}"]`).forEach((el) => el.setAttribute('d', d));
		}
	}

	function resetState() {
		grabbedJack = null;
		group = [];
		groupHasIncomingDriver = false;
		hasDragged = false;
		snapTarget = null;
		originalPaths = new Map();
	}

	function clearGrabPreview() {
		snapHighlight?.remove();
		snapHighlight = null;
		window.removeEventListener('mousemove', onMove);
		window.removeEventListener('mouseup', onUp);
	}

	// Moves the real grabbed cable(s) live, in their own colors, instead of drawing a synthetic preview.
	function onMove(e: MouseEvent) {
		if (!grabbedJack || !svgRef?.value) return;
		hasDragged = true;
		const mp = toSvgCoords(e);
		if (!mp) return;
		const svg = svgRef.value as SVGElement;

		snapTarget = findDropTarget(mp, grabbedJack, groupHasIncomingDriver);
		updateSnapHighlight(snapTarget);

		for (const cable of group) {
			const key = makeCableKey(cable);
			const elements = svg.querySelectorAll<SVGPathElement>(`[data-cable-key="${key}"]`);
			const currentD = elements[0]?.getAttribute('d');
			if (!currentD) continue;
			const role: 'src' | 'dst' = isCableSourceEnd(cable, grabbedJack) ? 'src' : 'dst';
			const newD = shiftCableEndpoint(currentD, role, mp.x, mp.y);
			elements.forEach((el) => el.setAttribute('d', newD));
		}
	}

	// Shared conclusion for both drop paths: the distance-based window mouseup, and landing exactly on a jack.
	function finishGrab(target: JackEnd | null) {
		const localGroup = group;
		const localFromJack = grabbedJack;
		const wasDragged = hasDragged;
		const svg = svgRef?.value as SVGElement | null;
		clearGrabPreview();
		resetState();

		if (!wasDragged || !localFromJack) return; // released above the current jack: no-op, DOM untouched

		if (target && sameJack(target, localFromJack)) {
			if (svg) revertPaths(svg); // DOM was mutated live during the drag; nothing else will restore it
			return;
		}

		onCableGroupDrop(localGroup, localFromJack, target);
	}

	function onUp() {
		const target = snapTarget ? { moduleIndex: snapTarget.moduleIndex, connectorIndex: snapTarget.connectorIndex, type: snapTarget.type } : null;
		finishGrab(target);
	}

	// Called when a mouseup lands directly on a jack (routed via the Vue emit chain, since that jack's
	// own mouseup handler stops native propagation and would otherwise swallow the window 'mouseup' above).
	// Returns true if a grab was in progress and this event was consumed.
	function handleJackMouseUp(jack: JackEnd): boolean {
		if (!grabbedJack) return false;
		finishGrab(isValidDropCandidate(jack) ? jack : null);
		return true;
	}

	function handleCableGrabStart(e: MouseEvent, cable: Cable) {
		if (!isGrabModifierPressed(e)) return;
		e.stopPropagation();
		const mp = toSvgCoords(e);
		if (!mp) return;

		const jack = findNearestEndpoint(cable, mp);
		const pos = jackSvgPos(jack);
		if (!pos) return;

		grabbedJack = jack;
		group = computeGroup(jack);
		groupHasIncomingDriver =
			jack.type === 'input' && group.some((c) => (c.dir ?? 1) === 1 && c.dmod === jack.moduleIndex && c.dcon === jack.connectorIndex);
		hasDragged = false;
		snapTarget = null;
		if (svgRef?.value) captureOriginalPaths(svgRef.value as SVGElement, group);

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	onUnmounted(() => {
		clearGrabPreview();
		resetState();
	});

	return { handleCableGrabStart, handleJackMouseUp };
}
