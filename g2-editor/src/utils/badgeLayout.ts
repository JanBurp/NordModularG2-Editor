import { HINT_FILL } from '../constants/ui';
export interface BadgeBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

const GAP = 2;

// Rough width before the actual text can be measured in the DOM (e.g. for initial layout/pre-layout).
export function estimateBadgeWidth(text: string): number {
	return Math.max(20, Math.max(...text.split('\n').map((l) => l.length)) * 7 + 10);
}

export const BADGE_LINE_HEIGHT = 11;

// 14 px for one line, plus one line height per extra '\n'-separated line.
export function badgeHeight(text: string): number {
	return 3 + text.split('\n').length * BADGE_LINE_HEIGHT;
}

// Builds the floating image shown under the cursor during a native HTML5 drag, styled like the
// canvas badges the drag refers to. The element must be in the document when setDragImage() reads
// it, so it's parked off-screen and removed on the next frame (the browser has snapshotted it by
// then). Shared by the MIDI CC row drag and the Parameter Pages knob drag.
export function setBadgeDragImage(e: DragEvent, text: string): void {
	const w = estimateBadgeWidth(text);
	const h = badgeHeight(text);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', String(w));
	svg.setAttribute('height', String(h));
	svg.style.cssText = 'position:fixed;top:-200px;left:-200px;pointer-events:none;';
	// Same double frame as MidiBadge: black outer and white inner 1 px line.
	for (const [inset, fill, stroke] of [
		[0.5, HINT_FILL, '#000'],
		[1.5, 'none', '#FFF'],
	] as const) {
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('x', String(inset));
		rect.setAttribute('y', String(inset));
		rect.setAttribute('width', String(w - 2 * inset));
		rect.setAttribute('height', String(h - 2 * inset));
		rect.setAttribute('fill', fill);
		rect.setAttribute('stroke', stroke);
		svg.appendChild(rect);
	}
	const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
	label.setAttribute('x', String(w / 2));
	label.setAttribute('y', '10');
	label.setAttribute('fill', '#000');
	label.setAttribute('font-size', '10');
	label.setAttribute('font-weight', 'bold');
	label.setAttribute('font-family', 'monospace');
	label.setAttribute('text-anchor', 'middle');
	label.textContent = text;
	svg.appendChild(label);
	document.body.appendChild(svg);
	e.dataTransfer?.setDragImage(svg, w / 2, h / 2);
	requestAnimationFrame(() => svg.remove());
}

function overlaps(a: BadgeBox, b: BadgeBox): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// CHintViewList::AdjustHintPosition: in insertion order, a badge overlapping an earlier badge of the
// same group (module) moves down by its own height + 2, checked once against each earlier badge.
export function layoutBadges<T extends BadgeBox & { group?: number }>(items: T[]): T[] {
	const placed: T[] = [];
	for (const item of items) {
		let y = item.y;
		for (const p of placed) if (p.group === item.group && overlaps({ ...item, y }, p)) y += item.height + GAP;
		placed.push({ ...item, y });
	}
	return placed;
}
