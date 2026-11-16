import { describe, expect, it } from 'vitest';
import { clickMorphRange, knobValueAtOffset, morphRangeFromClick, seqNoteAtY, sliderValueAtY, sliderYForValue } from '@/utils/morphClickRange';
import type { ModuleParam } from '@/types';
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
	it('is the inverse of the handle position ModuleSlider draws', () => {
		for (let v = 0; v <= 127; v++) expect(sliderValueAtY(sliderYForValue(v) + 3)).toBe(v);
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
	it('takes the strip box SeqNoteStepStrip passes', () => {
		expect(seqNoteAtY(10.1, view, 10, 20)).toBe(high);
		expect(seqNoteAtY(29.9, view, 10, 20)).toBe(low);
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

describe('clickMorphRange', () => {
	const view = { zoom: 1 as const, octaveOffset: 5 };
	// Real params (nmg2mods.ts): OscA FreqCoarse (KnobBig, 0..127), Compressor RefLevel (0..42), MixFader Lev1, a switch
	const knob: ModuleParam = { name: 'FreqCoarse', type: 'FreqCoarse', n: 'KnobBig', x: 98.5, y: 18.5 };
	const knobCentre = { x: knob.x + 13, y: knob.y + 13 }; // RADII.KnobBig + 2
	const slider: ModuleParam = { name: 'Lev1', type: 'MixLevel', n: 'KnobSlider', x: 12.5, y: 53.5 };
	const step: ModuleParam = { name: 'Seq1Step1', type: 'FreqCoarse', n: 'KnobSeqSlider', x: 28.5, y: 39 };

	it("knob: the value at the click's arc angle, the full range at the centre", () => {
		// 3 o'clock is +90°: value round(225 / 270 * 128) = 107
		expect(clickMorphRange(knob, knobCentre.x + 8, knobCentre.y, 64, view)).toBe(107 - 64);
		// 9 o'clock is -90°: value round(45 / 270 * 128) = 21
		expect(clickMorphRange(knob, knobCentre.x - 8, knobCentre.y, 64, view)).toBe(21 - 64);
		expect(clickMorphRange(knob, knobCentre.x + 1, knobCentre.y - 1, 64, view)).toBe(127);
	});
	it('knob: the full range for a param whose range is not 0..127', () => {
		const refLevel: ModuleParam = { ...knob, type: 'CompressorRefLevel' };
		expect(clickMorphRange(refLevel, knobCentre.x + 8, knobCentre.y, 30, view)).toBe(127);
	});
	it('slider: the value at the click height, relative to the slider', () => {
		expect(clickMorphRange(slider, slider.x + 5, slider.y + 3, 100, view)).toBe(27);
		expect(clickMorphRange(slider, slider.x + 5, slider.y + 45, 100, view)).toBe(-100);
	});
	it('SeqNote step: the note of the clicked row', () => {
		const { high } = visibleNoteWindow(view.zoom, view.octaveOffset);
		expect(clickMorphRange(step, step.x + 6, SEQNOTE_STRIP_TOP + 0.1, 60, view)).toBe(high - 60);
	});
	it('clicking the current value gives the full range', () => {
		expect(clickMorphRange(slider, slider.x + 5, slider.y + 3, 127, view)).toBe(127);
	});
	it('other controls get the full range', () => {
		const sw: ModuleParam = { name: 'Kbt', type: 'Kbt_1', n: 'SwM7364bc84', x: 70.5, y: 29.5 };
		const spin: ModuleParam = { name: 'BP', type: 'FreqCoarse', n: 'KnobSpin', x: 130.5, y: 20.5 };
		expect(clickMorphRange(sw, sw.x, sw.y, 0, view)).toBe(127);
		expect(clickMorphRange(spin, spin.x, spin.y, 64, view)).toBe(127);
	});
});
