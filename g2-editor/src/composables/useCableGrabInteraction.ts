import { onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { getModule } from '../renderer/nmg2mods';
import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '@/constants';
import { svgPath, svgCircle } from '../renderer/svgUtils';
import { makeCableKey } from '../renderer/cableRenderer';
import type { Cable } from '../renderer/cableRenderer';
import { matchesCableJack } from '../store/slotHelpers';
import { computeDrivenInputJacks } from '../parser/cableGraph';
import { useUiStore } from '../store/ui';
import { SNAP_RANGE } from './useJackDragInteraction';

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
	let anchorPos: { x: number; y: number } | null = null;
	let group: Cable[] = [];
	let groupHasIncomingDriver = false;
	let hasDragged = false;
	let snapTarget: SnapEnd | null = null;
	let previewCable: SVGPathElement | null = null;
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

	function previewPath(sx: number, sy: number, dx: number, dy: number): string {
		const dist = Math.hypot(dx - sx, dy - sy);
		const sag = Math.min(dist * 0.25, 60);
		const bot = Math.max(sy, dy) + sag;
		return `M${sx} ${sy} C${sx + (dx - sx) * 0.25} ${bot},${sx + (dx - sx) * 0.75} ${bot},${dx} ${dy}`;
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

	function resetState() {
		grabbedJack = null;
		anchorPos = null;
		group = [];
		groupHasIncomingDriver = false;
		hasDragged = false;
		snapTarget = null;
	}

	function clearGrabPreview() {
		previewCable?.remove();
		previewCable = null;
		snapHighlight?.remove();
		snapHighlight = null;
		window.removeEventListener('mousemove', onMove);
		window.removeEventListener('mouseup', onUp);
	}

	function onMove(e: MouseEvent) {
		if (!anchorPos || !grabbedJack || !svgRef?.value) return;
		hasDragged = true;
		const mp = toSvgCoords(e);
		if (!mp) return;
		const svg = svgRef.value as SVGElement;

		snapTarget = findDropTarget(mp, grabbedJack, groupHasIncomingDriver);
		updateSnapHighlight(snapTarget);

		const d = previewPath(anchorPos.x, anchorPos.y, mp.x, mp.y);
		if (!previewCable) {
			previewCable = svgPath(d, { fill: 'none', stroke: '#000', 'stroke-width': '3', opacity: '0.8', class: 'cable-preview nomouse' });
		} else {
			previewCable.setAttribute('d', d);
		}
		svg.appendChild(previewCable);
	}

	function onUp() {
		const localGroup = group;
		const localFromJack = grabbedJack;
		const localSnapTarget = snapTarget;
		const wasDragged = hasDragged;
		clearGrabPreview();
		resetState();

		if (!wasDragged || !localFromJack) return; // released above the current jack: no-op
		if (localSnapTarget && sameJack(localSnapTarget, localFromJack)) return; // dropped back on the original jack: no-op

		onCableGroupDrop(
			localGroup,
			localFromJack,
			localSnapTarget ? { moduleIndex: localSnapTarget.moduleIndex, connectorIndex: localSnapTarget.connectorIndex, type: localSnapTarget.type } : null,
		);
	}

	function handleCableGrabStart(e: MouseEvent, cable: Cable) {
		if (!e.ctrlKey && !e.metaKey) return;
		e.stopPropagation();
		const mp = toSvgCoords(e);
		if (!mp) return;

		const jack = findNearestEndpoint(cable, mp);
		const pos = jackSvgPos(jack);
		if (!pos) return;

		grabbedJack = jack;
		anchorPos = pos;
		group = computeGroup(jack);
		groupHasIncomingDriver =
			jack.type === 'input' && group.some((c) => (c.dir ?? 1) === 1 && c.dmod === jack.moduleIndex && c.dcon === jack.connectorIndex);
		hasDragged = false;
		snapTarget = null;

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	onUnmounted(() => {
		clearGrabPreview();
		resetState();
	});

	return { handleCableGrabStart };
}
