import { MODULE_COLORS, MODULE_COLORS_ORDER } from '../constants/moduleColors';
import { CABLE_COLORS, CABLE_COLOR_INDEX_MAP } from '../constants/cableColors';

import type { ContextMenuSwatch, ContextMenuItem } from '../types';

export function buildColorSwatches(action: (colorId: number) => void): ContextMenuSwatch[] {
	const rest = (Object.entries(MODULE_COLORS_ORDER) as [string, number][])
		.sort(([a], [b]) => Number(a) - Number(b))
		.filter(([, colorId]) => colorId > 0)
		.map(([, colorId]) => ({ color: MODULE_COLORS[colorId], action: () => action(colorId) }));
	return [{ color: MODULE_COLORS[0], action: () => action(0), fullWidth: true }, ...rest];
}

export function buildCableColorItems(action: (colorId: number) => void): ContextMenuItem[] {
	return Object.entries(CABLE_COLOR_INDEX_MAP).map(([colorId, name]) => {
		const def = CABLE_COLORS.find((c) => c.name === name)!;
		return { label: def.label, bgColor: def.hex, action: () => action(Number(colorId)) };
	});
}
