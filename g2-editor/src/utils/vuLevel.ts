import type { ModuleDefinition, VisualElement } from '@/types';

// Level meter (VU) math shared by the canvas LevelMeter, the Parameter Page meters and the Meter Graph.

// The meter, as the official editor draws it (CPnlPeakMeter::Draw in G2Editor.c): 12 segments, one
// per step, bottom/left to top/right: 7 green (steps 1-7), 4 yellow (8-11), 1 red (12).
// Raw byte: low nibble = step; bits 0x10/0x20 = hold, lights the top two yellows; bit 0x40 = clip,
// lights the red. 255 = no value received (our own marker), all off.
// Sizes as drawn there, inside a 16px meter's 1px border: green and yellow 1px each, red 3px (14px in all).
export const VU_SEGMENT_COUNT = 12;
const SEGMENT_SIZE = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3];
const TOTAL_SIZE = SEGMENT_SIZE.reduce((a, b) => a + b, 0);

// Colour zones in segment units: unlit (dim) and lit colours.
export const VU_ZONES = [
	{ from: 0, to: 7, dim: '#005500', lit: '#00cc00' },
	{ from: 7, to: 11, dim: '#555500', lit: '#cccc00' },
	{ from: 11, to: 12, dim: '#550000', lit: '#cc0000' },
];

// The 12 segments with their current colour, bottom/left first. from/to = fraction 0..1 of the meter.
export function vuSegments(raw: number): { from: number; to: number; color: string }[] {
	const step = raw === 255 ? 0 : raw & 0x0f;
	const hold = raw !== 255 && (raw & 0x30) !== 0;
	return Array.from({ length: VU_SEGMENT_COUNT }, (_, i) => {
		const zone = VU_ZONES.find((z) => i < z.to)!;
		const lit = i === 11 ? vuClipped(raw) : step > i || (hold && i >= 9);
		const from = SEGMENT_SIZE.slice(0, i).reduce((a, b) => a + b, 0);
		return { from: from / TOTAL_SIZE, to: (from + SEGMENT_SIZE[i]) / TOTAL_SIZE, color: lit ? zone.lit : zone.dim };
	});
}

// A module's level meters ordered by LED number: the LED number the hardware uses for a
// Parameter Page meter assignment is the meter's rank by x (see Module.vue's onVuContextMenu).
export function vuMetersByLedNo(moduleDef: ModuleDefinition | null | undefined): VisualElement[] {
	return (moduleDef?.ve ?? []).filter((v) => v.type === 'vu').sort((a, b) => (a.x as number) - (b.x as number));
}

// The led store key (`vu-N`, N = element order) of the meter with this LED number, or null if the
// module has no such meter.
export function vuStripKey(moduleDef: ModuleDefinition | null | undefined, ledNo: number): string | null {
	const target = vuMetersByLedNo(moduleDef)[ledNo];
	if (!target) return null;
	return `vu-${(moduleDef?.ve ?? []).filter((v) => v.type === 'vu').indexOf(target)}`;
}

// The meter law, measured on the G2 (G2-Edit Docs/findings.md 2026-09-12, sound-engine-reference §1):
// the meter reads the PEAK, one step per octave. Low nibble = step: 1..7 = peak ≥ 6.02·(step−8) dB
// re full scale (1 = −42 dB … 7 = −6 dB); above full scale it skips: 9 = 0 dB, 11 = +6, 12 = +12.
// Bit 0x40 = clip (held 1 s), 0x20 = 1 s hold after an 11; neither changes the step.
export const VU_DB_FLOOR = -48; // step 0 (below −42 dB) and off (255)

// Lower bound of the step's dB range
export function vuLevelDb(raw: number): number {
	const step = raw === 255 ? 0 : raw & 0x0f;
	if (step === 0) return VU_DB_FLOOR;
	if (step <= 8) return 6 * (step - 8);
	return step >= 12 ? 12 : 3 * (step - 9);
}

export function vuClipped(raw: number): boolean {
	return raw !== 255 && ((raw & 0x40) !== 0 || (raw & 0x0f) >= 12);
}
