import { describe, expect, it } from 'vitest';
import { knobValueAtOffset, morphRangeFromClick, seqNoteAtY, sliderValueAtY } from '@/utils/morphClickRange';
import { knobAngle } from '@/utils/knobArc';
import { SEQNOTE_STRIP_HEIGHT, SEQNOTE_STRIP_TOP, visibleNoteWindow } from '@/renderer/pianoRoll';

describe('sliderValueAtY', () => {
	it('maps the handle-centred track position to 127..0 and clamps outside the track', () => {
		expect(sliderValueAtY(3)).toBe(127);
		expect(sliderValueAtY(45)).toBe(0);
		expect(sliderValueAtY(24)).toBe(64);
		expect(sliderValueAtY(-20)).toBe(127);
		expect(sliderValueAtY(70)).toBe(0);
	});
});

describe('seqNoteAtY', () => {
	const view = { zoom: 1 as const, octaveOffset: 5 };
	const { low, high } = visibleNoteWindow(view.zoom, view.octaveOffset);
	it('gives the top visible note at the strip top and the lowest at its bottom', () => {
		expect(seqNoteAtY(SEQNOTE_STRIP_TOP + 0.1, view)).toBe(high);
		expect(seqNoteAtY(SEQNOTE_STRIP_TOP + SEQNOTE_STRIP_HEIGHT - 0.1, view)).toBe(low);
	});
	it('clamps outside the strip', () => {
		expect(seqNoteAtY(0, view)).toBe(high);
		expect(seqNoteAtY(500, view)).toBe(low);
	});
});

describe('morphRangeFromClick', () => {
	it('is the signed distance from the current value to the clicked one', () => {
		expect(morphRangeFromClick(90, 64)).toBe(26);
		expect(morphRangeFromClick(10, 64)).toBe(-54);
	});
	it('falls back to the full range when the click is on the current value', () => {
		expect(morphRangeFromClick(64, 64)).toBe(127);
	});
});

describe('knobValueAtOffset', () => {
	it('is the inverse of the knob arc angle', () => {
		for (const value of [0, 1, 32, 64, 100, 127]) {
			const a = (knobAngle(value) * Math.PI) / 180;
			expect(Math.abs(knobValueAtOffset(Math.sin(a) * 10, -Math.cos(a) * 10) - value)).toBeLessThanOrEqual(1);
		}
	});
	it("gives the middle value at 12 o'clock and clamps the gap at the bottom to the ends", () => {
		expect(knobValueAtOffset(0, -10)).toBe(64);
		expect(knobValueAtOffset(-1, 10)).toBe(0);
		expect(knobValueAtOffset(1, 10)).toBe(127);
	});
});
