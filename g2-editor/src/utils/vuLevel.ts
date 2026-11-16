import type { ModuleDefinition, VisualElement } from '@/types';

// Level meter (VU) math shared by the canvas LevelMeter and the Parameter Page meters.

// Raw meter value (0..127, 255 = off) → lit fraction 0..1, on a log curve.
export function vuFraction(raw: number): number {
	if (!raw || raw === 255) return 0;
	return Math.min(Math.log10(raw) * 0.45, 1);
}

// A module's level meters ordered by LED number: the LED number the hardware uses for a
// Parameter Page meter assignment is the meter's rank by x (see Module.vue's onVuContextMenu).
export function vuMetersByLedNo(moduleDef: ModuleDefinition | null | undefined): VisualElement[] {
	return (moduleDef?.ve ?? []).filter((v) => v.type === 'vu').sort((a, b) => (a.x as number) - (b.x as number));
}
