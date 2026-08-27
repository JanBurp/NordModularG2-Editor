export interface BadgeBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

const GAP = 2;

// Rough width before the actual text can be measured in the DOM (e.g. for initial layout/pre-layout).
export function estimateBadgeWidth(text: string): number {
	return Math.max(20, text.length * 7 + 10);
}

// Builds the floating image shown under the cursor during a native HTML5 drag, styled like the
// canvas badges the drag refers to. The element must be in the document when setDragImage() reads
// it, so it's parked off-screen and removed on the next frame (the browser has snapshotted it by
// then). Shared by the MIDI CC row drag and the Parameter Pages knob drag.
export function setBadgeDragImage(e: DragEvent, text: string, fill = '#FFE55C'): void {
	const w = estimateBadgeWidth(text);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', String(w));
	svg.setAttribute('height', '15');
	svg.style.cssText = 'position:fixed;top:-200px;left:-200px;pointer-events:none;';
	const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
	rect.setAttribute('width', String(w));
	rect.setAttribute('height', '15');
	rect.setAttribute('fill', fill);
	rect.setAttribute('stroke', '#000');
	rect.setAttribute('stroke-width', '0.8');
	rect.setAttribute('rx', '2');
	rect.setAttribute('opacity', '0.8');
	const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
	label.setAttribute('x', String(w / 2));
	label.setAttribute('y', '11');
	label.setAttribute('fill', '#000');
	label.setAttribute('font-size', '11');
	label.setAttribute('font-weight', 'bold');
	label.setAttribute('font-family', 'monospace');
	label.setAttribute('text-anchor', 'middle');
	label.textContent = text;
	svg.appendChild(rect);
	svg.appendChild(label);
	document.body.appendChild(svg);
	e.dataTransfer?.setDragImage(svg, w / 2, 7);
	requestAnimationFrame(() => svg.remove());
}

function overlaps(a: BadgeBox, b: BadgeBox): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// Best-effort collision avoidance: nudges overlapping badges straight down.
// Doesn't guarantee zero overlap in dense areas.
export function layoutBadges<T extends BadgeBox>(items: T[]): T[] {
	const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
	const placed: BadgeBox[] = [];
	return sorted.map((item) => {
		let y = item.y;
		let moved = true;
		while (moved) {
			moved = false;
			for (const box of placed) {
				if (overlaps({ ...item, y }, box)) {
					y = box.y + box.height + GAP;
					moved = true;
				}
			}
		}
		placed.push({ x: item.x, y, width: item.width, height: item.height });
		return { ...item, y };
	});
}
