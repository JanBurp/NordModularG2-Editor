export function resolveColumnCollisions(
	stationaryModules: { index: number; vert: number; height: number }[],
	occupantRects: { row: number; height: number }[],
): { index: number; newRow: number }[] {
	if (occupantRects.length === 0) return [];
	const occupants = [...occupantRects].sort((a, b) => a.row - b.row);
	const sorted = [...stationaryModules].sort((a, b) => a.vert - b.vert);
	const newRows = new Map(sorted.map((m) => [m.index, m.vert]));
	let floor = 0;
	for (const mod of sorted) {
		let candidate = Math.max(newRows.get(mod.index)!, floor);
		for (const o of occupants) {
			if (candidate < o.row + o.height && candidate + mod.height > o.row) {
				candidate = o.row + o.height;
			}
		}
		newRows.set(mod.index, candidate);
		floor = candidate + mod.height;
	}
	return sorted
		.filter((m) => newRows.get(m.index) !== m.vert)
		.map((m) => ({
			index: m.index,
			newRow: newRows.get(m.index)!,
		}));
}
