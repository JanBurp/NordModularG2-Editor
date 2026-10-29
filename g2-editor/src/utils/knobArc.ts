import { clamp } from '@/utils/math';

// Knob value→angle (0° = top, range -135°..135°). `max` is the param's own range (parammap `high`):
// like the original editor (CPnlKnobSliderABC::UpdateGraphics, value*127/max), every rotary knob
// sweeps its full arc whatever its range — e.g. Compressor RefLevel 0..42.
export function knobAngle(value: number, max = 127): number {
	return ((clamp(value, 0, max) * 127) / max / 128) * 270 - 135;
}

function pointOnKnob(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
	const rad = (angleDeg * Math.PI) / 180;
	return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

// SVG pie-slice path (a <path d="..."/> value, filled) spanning from `fromValue` to `toValue` on a
// knob of radius `r` centered at (cx, cy) — a "piece of the cake" showing a Morph Group's range,
// like the original G2 editor's morph-range indicator.
export function describeMorphSector(cx: number, cy: number, r: number, fromValue: number, toValue: number, max = 127): string {
	const a0 = knobAngle(fromValue, max);
	const a1 = knobAngle(toValue, max);
	const p0 = pointOnKnob(cx, cy, r, a0);
	const p1 = pointOnKnob(cx, cy, r, a1);
	const largeArc = Math.abs(a1 - a0) > 180 ? 1 : 0;
	const sweep = a1 >= a0 ? 1 : 0;
	return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${p1.x} ${p1.y} Z`;
}

// SVG arc path (stroked, not filled) of radius `r` around (cx, cy) between two knob angles
// (0° = top, clockwise), e.g. a VU meter band along the knob's sweep.
export function describeArc(cx: number, cy: number, r: number, fromAngle: number, toAngle: number): string {
	const p0 = pointOnKnob(cx, cy, r, fromAngle);
	const p1 = pointOnKnob(cx, cy, r, toAngle);
	const largeArc = toAngle - fromAngle > 180 ? 1 : 0;
	return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;
}
