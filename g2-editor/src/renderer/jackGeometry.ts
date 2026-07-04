import type { Ref } from 'vue';
import { getModule } from './nmg2mods';
import { MODULE_WIDTH, MODULE_ROW_HEIGHT } from '@/constants';
import { svgCircle, clientToSvgPoint } from './svgUtils';

// Shared by useJackDragInteraction.ts and useCableGrabInteraction.ts.

export const SNAP_RANGE = 96;

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
