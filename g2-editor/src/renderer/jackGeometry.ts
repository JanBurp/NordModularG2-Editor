import type { Ref } from 'vue';
import { getModule } from './nmg2mods';
import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '@/constants';
import { svgCircle, clientToSvgPoint } from './svgUtils';

// Shared by useJackDragInteraction.ts and useCableGrabInteraction.ts.

// Converts a mouse event into SVG user-space coordinates.
export function toSvgCoords(svgRef: Ref<SVGSVGElement | null> | undefined, e: MouseEvent) {
	return clientToSvgPoint(svgRef?.value ?? null, e.clientX, e.clientY);
}

// Looks up a jack's SVG position from module/patch geometry.
export function getJackSvgPos(getModules: () => any[], info: { moduleIndex: number; connectorIndex: number; type: 'input' | 'output' }) {
	const mod = getModules().find((m) => m.index === info.moduleIndex);
	if (!mod) return null;
	const modDef = getModule(mod.type);
	if (!modDef) return null;
	const jacks = info.type === 'input' ? modDef.inputs : modDef.outputs;
	const jack = jacks?.[info.connectorIndex];
	if (!jack) return null;
	return { x: jack.x + mod.horiz * MODULE_WIDTH, y: jack.y + mod.vert * MODULE_ROW_HEIGHT };
}

type JackType = 'input' | 'output';
type JackCandidate = { moduleIndex: number; connectorIndex: number; type: JackType };

// Scans every jack of the given type(s) across all modules and reports the nearest one within
// snapRange that passes `isValid`, plus whether a same-scan candidate that FAILED validity sits
// nearer than any valid one — drives the "not-allowed" cursor. Shared by useJackDragInteraction.ts
// and useCableGrabInteraction.ts, whose snap-target searches differ only in which jack type(s) to
// scan, what counts as a valid candidate, and what extra fields to attach to the result.
export function findNearestJack<T extends { x: number; y: number }>(
	getModules: () => any[],
	mousePos: { x: number; y: number },
	types: JackType[],
	isValid: (candidate: JackCandidate) => boolean,
	build: (candidate: JackCandidate, jackDef: any, x: number, y: number) => T,
	snapRange: number,
): { jack: T | null; invalidNearby: boolean } {
	let bestDist = snapRange;
	let best: T | null = null;
	let bestInvalidDist = snapRange;
	let invalidNearby = false;
	for (const mod of getModules()) {
		const modDef = getModule(mod.type);
		if (!modDef) continue;
		const baseX = mod.horiz * MODULE_WIDTH;
		const baseY = mod.vert * MODULE_ROW_HEIGHT;
		for (const type of types) {
			const jacks = type === 'input' ? (modDef.inputs ?? []) : (modDef.outputs ?? []);
			jacks.forEach((jackDef: any, idx: number) => {
				const jx = jackDef.x + baseX;
				const jy = jackDef.y + baseY;
				const dist = Math.hypot(jx - mousePos.x, jy - mousePos.y);
				if (dist >= snapRange) return;
				const candidate: JackCandidate = { moduleIndex: mod.index, connectorIndex: idx, type };
				if (!isValid(candidate)) {
					if (dist < bestInvalidDist) {
						bestInvalidDist = dist;
						invalidNearby = true;
					}
					return;
				}
				if (dist < bestDist) {
					bestDist = dist;
					best = build(candidate, jackDef, jx, jy);
				}
			});
		}
	}
	return { jack: best, invalidNearby: invalidNearby && bestInvalidDist < bestDist };
}

// Creates/moves/removes the snap-target highlight circle.
export function updateSnapHighlight(svg: SVGElement, current: SVGCircleElement | null, snap: { x: number; y: number } | null): SVGCircleElement | null {
	if (!snap) {
		current?.remove();
		return null;
	}
	if (!current) {
		const el = svgCircle(snap.x, snap.y, 8, { fill: 'none', stroke: '#000', 'stroke-width': '3', class: 'nomouse', opacity: '0.8' });
		svg.appendChild(el);
		return el;
	}
	current.setAttribute('cx', String(snap.x));
	current.setAttribute('cy', String(snap.y));
	return current;
}
