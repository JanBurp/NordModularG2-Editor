import { onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { getModule } from '../renderer/nmg2mods';
import { svgPath, svgCircle } from '../renderer/svgUtils';
import { applyCableVisibility } from '../renderer/cableRenderer';
import { useCableVisibility } from './useCableVisibility';
import { useUiStore } from '../store/ui';
import type { JackDragInfo } from '../types';

type SnapJack = JackDragInfo & { x: number; y: number };

const SNAP_RANGE = 64;

export function useJackDragInteraction(
	svgRef: Ref<SVGSVGElement | null> | undefined,
	getModules: () => any[],
	getCables: () => any[],
	onJackDragStart: (info: JackDragInfo) => void,
	onJackDragEnd: (info: JackDragInfo) => void,
) {
	const { cableVisibility } = useCableVisibility();
	const uiStore = useUiStore();

	let previewCable: SVGPathElement | null = null;
	let dragSrcPos: { x: number; y: number } | null = null;
	let dragSrcColour = '';
	let dragSrcInfo: JackDragInfo | null = null;
	let hasDragged = false;
	let snapJack: SnapJack | null = null;
	let snapHighlight: SVGCircleElement | null = null;

	let cycleJack: JackDragInfo | null = null;
	let cycleIndex = -1;

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
			const matches =
				(info.type === 'output' && dir === 1 && smod === info.moduleIndex && scon === info.connectorIndex) ||
				(info.type === 'input' && dmod === info.moduleIndex && dcon === info.connectorIndex) ||
				(info.type === 'input' && dir === 0 && smod === info.moduleIndex && scon === info.connectorIndex);
			if (matches) {
				svg.querySelectorAll(`[data-cable-key="${key}"]`).forEach((e) => e.classList.remove('cable-hidden'));
			}
		});
	}

	function findAllCablesForJack(info: JackDragInfo): any[] {
		const result: any[] = [];
		for (const cable of getCables()) {
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
		const src = dragSrcInfo;
		const targetTypes: ('input' | 'output')[] = src.type === 'output' ? ['input'] : ['output', 'input'];
		const cables = getCables();
		const dir0Cables = cables.filter((c: any) => (c.dir ?? 1) === 0);
		const drivenNestJacks = new Set<string>();
		for (const c of cables) {
			if ((c.dir ?? 1) !== 1) continue;
			const queue: { mod: number; con: number }[] = [{ mod: c.dmod ?? 0, con: c.dcon ?? 0 }];
			while (queue.length > 0) {
				const { mod, con } = queue.shift()!;
				const key = `${mod}-${con}`;
				if (drivenNestJacks.has(key)) continue;
				drivenNestJacks.add(key);
				for (const dc of dir0Cables) {
					const sm = dc.smod ?? 0,
						sc = dc.scon ?? 0,
						dm = dc.dmod ?? 0,
						dc2 = dc.dcon ?? 0;
					if (sm === mod && sc === con) queue.push({ mod: dm, con: dc2 });
					else if (dm === mod && dc2 === con) queue.push({ mod: sm, con: sc });
				}
			}
		}
		let bestDist = SNAP_RANGE;
		let best: SnapJack | null = null;
		for (const mod of getModules()) {
			const modDef = getModule(mod.type);
			if (!modDef) continue;
			const baseX = mod.horiz * 256;
			const baseY = mod.vert * 16;
			for (const targetType of targetTypes) {
				const jacks = targetType === 'input' ? (modDef.inputs ?? []) : (modDef.outputs ?? []);
				jacks.forEach((jack, idx) => {
					if (mod.index === src.moduleIndex && idx === src.connectorIndex && targetType === src.type) return;
					if (targetType === 'input' && src.type === 'output' && drivenNestJacks.has(`${mod.index}-${idx}`)) return;
					const jx = jack.x + baseX;
					const jy = jack.y + baseY;
					const dist = Math.hypot(jx - mousePos.x, jy - mousePos.y);
					if (dist < bestDist) {
						bestDist = dist;
						best = { moduleIndex: mod.index, connectorIndex: idx, type: targetType, colour: jack.colour, x: jx, y: jy };
					}
				});
			}
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

	function getJackSvgPos(info: JackDragInfo) {
		const mod = getModules().find((m) => m.index === info.moduleIndex);
		if (!mod) return null;
		const modDef = getModule(mod.type);
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
			previewCable = svgPath(d, {
				fill: 'none',
				stroke: '#000',
				'stroke-width': '3',
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
		snapHighlight?.remove();
		snapHighlight = null;
		snapJack = null;
		dragSrcPos = null;
		dragSrcInfo = null;
		hasDragged = false;
		window.removeEventListener('mousemove', onMouseMovePreview);
		window.removeEventListener('mouseup', onWindowMouseup);
		if (svgRef?.value) applyCableVisibility(svgRef.value, cableVisibility.value as unknown as Record<string, boolean>);
	}

	function onWindowMouseup() {
		const localSnapJack = snapJack;
		clearDragPreview();
		if (localSnapJack) onJackDragEnd(localSnapJack);
	}

	function handleJackDragStart(info: JackDragInfo) {
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
		onJackDragStart(info);
	}

	function handleJackDragEnd(info: JackDragInfo) {
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

	// suppress unused warning — dragSrcColour is set but the preview cable color
	// is hardcoded black; kept for future use when colored preview is added
	void dragSrcColour;

	return { handleJackDragStart, handleJackDragEnd };
}
