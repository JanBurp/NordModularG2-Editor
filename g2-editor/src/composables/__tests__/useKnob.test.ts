import { describe, expect, it } from 'vitest';
import { FINE_DISTANCE, fineFactor, knobDragStep } from '../useKnob';

const centre = { x: 100, y: 100 };
const R = 10;

describe('fineFactor', () => {
	it('is 1 up to the knob edge', () => {
		expect(fineFactor(0, R)).toBe(1);
		expect(fineFactor(R, R)).toBe(1);
	});

	it('quarters at FINE_DISTANCE beyond the edge, 1/16 at 3x', () => {
		expect(fineFactor(R + FINE_DISTANCE, R)).toBeCloseTo(0.25);
		expect(fineFactor(R + 3 * FINE_DISTANCE, R)).toBeCloseTo(1 / 16);
	});
});

describe('knobDragStep', () => {
	it('vertical: up is positive, finer further sideways', () => {
		expect(knobDragStep('vertical', { x: 100, y: 100 }, { x: 100, y: 90 }, centre, R)).toBe(10);
		const far = 100 + R + FINE_DISTANCE;
		expect(knobDragStep('vertical', { x: far, y: 100 }, { x: far, y: 90 }, centre, R)).toBeCloseTo(2.5);
		// sideways movement alone changes nothing
		expect(knobDragStep('vertical', { x: 100, y: 100 }, { x: 300, y: 100 }, centre, R)).toBeCloseTo(0);
	});

	it('horizontal: right is positive, finer further up/down', () => {
		expect(knobDragStep('horizontal', { x: 100, y: 100 }, { x: 110, y: 100 }, centre, R)).toBe(10);
		const far = 100 - R - FINE_DISTANCE;
		expect(knobDragStep('horizontal', { x: 100, y: far }, { x: 110, y: far }, centre, R)).toBeCloseTo(2.5);
	});

	it('circular: a clockwise quarter turn is 90/270 of the range', () => {
		expect(knobDragStep('circular', { x: 100, y: 50 }, { x: 150, y: 100 }, centre, R)).toBeCloseTo((90 / 270) * 127);
	});

	it('circular: crossing 6 o’clock does not wrap around', () => {
		// from just left of bottom to just right of bottom = small counter-clockwise move
		const step = knobDragStep('circular', { x: 99, y: 150 }, { x: 101, y: 150 }, centre, R);
		expect(step).toBeLessThan(0);
		expect(step).toBeGreaterThan(-2);
	});
});
