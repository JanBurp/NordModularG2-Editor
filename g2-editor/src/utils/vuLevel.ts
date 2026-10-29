import type { ModuleDefinition, VisualElement } from '@/types';

// Level meter (VU) math shared by the canvas LevelMeter and the Parameter Page meters.

// Raw meter value (0..127, 255 = off) → lit fraction 0..1, on a log curve.
export function vuFraction(raw: number): number {
	if (!raw || raw === 255) return 0;
	return Math.min(Math.log10(raw) * 0.45, 1);
}

// The meter's colour zones, bottom/left to top/right: unlit (dim) and lit colours.
export const VU_ZONES = [
	{ from: 0, to: 8 / 16, dim: '#005500', lit: '#00cc00' },
	{ from: 8 / 16, to: 12 / 16, dim: '#555500', lit: '#cccc00' },
	{ from: 12 / 16, to: 1, dim: '#550000', lit: '#cc0000' },
];

// A module's level meters ordered by LED number: the LED number the hardware uses for a
// Parameter Page meter assignment is the meter's rank by x (see Module.vue's onVuContextMenu).
export function vuMetersByLedNo(moduleDef: ModuleDefinition | null | undefined): VisualElement[] {
	return (moduleDef?.ve ?? []).filter((v) => v.type === 'vu').sort((a, b) => (a.x as number) - (b.x as number));
}
