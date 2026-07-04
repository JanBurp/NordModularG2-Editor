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
