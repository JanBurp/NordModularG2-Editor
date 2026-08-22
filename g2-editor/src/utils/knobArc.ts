import { clamp } from '@/utils/math';

// Same value→angle mapping as useKnob.ts's `angle` computed (0° = top, range -135°..135°).
export function knobAngle(value: number): number {
	return (clamp(value, 0, 127) / 128) * 270 - 135;
}

function pointOnKnob(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
	const rad = (angleDeg * Math.PI) / 180;
	return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

// SVG pie-slice path (a <path d="..."/> value, filled) spanning from `fromValue` to `toValue` on a
// knob of radius `r` centered at (cx, cy) — a "piece of the cake" showing a Morph Group's range,
// like the original G2 editor's morph-range indicator.
export function describeMorphSector(cx: number, cy: number, r: number, fromValue: number, toValue: number): string {
	const a0 = knobAngle(fromValue);
	const a1 = knobAngle(toValue);
	const p0 = pointOnKnob(cx, cy, r, a0);
	const p1 = pointOnKnob(cx, cy, r, a1);
	const largeArc = Math.abs(a1 - a0) > 180 ? 1 : 0;
	const sweep = a1 >= a0 ? 1 : 0;
	return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${p1.x} ${p1.y} Z`;
}
