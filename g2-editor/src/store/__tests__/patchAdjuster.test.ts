import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { adjustValue, inverseAdjust, knobOffset, usePatchAdjusterStore } from '@/store/patchAdjuster';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { useHistoryStore } from '@/store/history';

const ENV_ADSR = 20; // params: Shape, Attack(1), Decay(2), Sustain(3), Release(4), ...
const ENV_ADR = 84; // param 3 = Dcy/Rel, param 7 = DcyRel switch

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue(undefined), runBatch: vi.fn().mockResolvedValue([]) } };
});

function variation(voice: Record<number, number[]>) {
	return { fx: {}, voice, patch: {} } as any;
}

// Slot A, voice area: module 1 = EnvADSR, module 2 = EnvADR. Variation 1 has different values.
function setup() {
	const slots = useSlotsStore();
	slots.slots.A.patch = {
		description: { variation: 0 },
		areas: [
			{ modules: [], cableList: [] },
			{
				modules: [
					{ index: 1, type: ENV_ADSR },
					{ index: 2, type: ENV_ADR },
				],
				cableList: [],
			},
		],
	} as any;
	slots.slots.A.variations = [
		variation({ 1: [0, 40, 60, 100, 20, 0, 0, 0], 2: [0, 30, 0, 50, 0, 0, 0, 0] }),
		variation({ 1: [0, 10, 10, 10, 10, 0, 0, 0], 2: [0, 10, 0, 10, 0, 0, 0, 0] }),
	];
	const adjuster = usePatchAdjusterStore();
	adjuster.commit();
	return { slots, adjuster, voice: (v = 0) => slots.slots.A.variations![v].voice };
}

describe('Patch Adjuster math', () => {
	it('maps the 0..127 knob onto -1..+1 around 64', () => {
		expect(knobOffset(0)).toBe(-1);
		expect(knobOffset(64)).toBe(0);
		expect(knobOffset(127)).toBe(1);
	});

	it('scales toward max above centre and toward 0 below, clamped to the param max', () => {
		expect(adjustValue(40, 0, 127)).toBe(40);
		expect(adjustValue(40, 1, 127)).toBe(127);
		expect(adjustValue(40, -1, 127)).toBe(0);
		expect(adjustValue(40, 0.5, 127)).toBe(83); // 40 + 87 * 0.5 = 83.5, truncated
		expect(adjustValue(40, -0.5, 127)).toBe(20);
		expect(adjustValue(50, 1, 99)).toBe(99);
	});

	it('inverseAdjust undoes adjustValue', () => {
		expect(inverseAdjust(adjustValue(41, 0.5, 127), 0.5, 127, 0)).toBe(41); // 41 + 86 * 0.5 = 84, exact
		expect(inverseAdjust(adjustValue(40, -0.5, 127), -0.5, 127, 0)).toBe(40);
		expect(inverseAdjust(30, 1, 127, 77)).toBe(77); // unrecoverable at the extreme: keep baseline
	});
});

describe('usePatchAdjusterStore', () => {
	it('moves only the claimed params of the turned knob, in the focused variation', () => {
		const { adjuster, voice } = setup();
		adjuster.setKnob('attack', 0);
		expect(voice()[1]).toEqual([0, 0, 60, 100, 20, 0, 0, 0]);
		expect(voice()[2][1]).toBe(0); // EnvADR Attack
		expect(voice(1)[1][1]).toBe(10); // other variation untouched
	});

	it('never compounds, and centre restores the baseline exactly', () => {
		const { adjuster, voice } = setup();
		adjuster.setKnob('decay', 100);
		adjuster.setKnob('decay', 110);
		adjuster.setKnob('decay', 100);
		const once = voice()[1][2];
		adjuster.setKnob('decay', 64);
		expect(voice()[1][2]).toBe(60);
		adjuster.setKnob('decay', 100);
		expect(voice()[1][2]).toBe(once);
	});

	it('EnvADR Dcy/Rel follows Decay, or Release when DcyRel is on', () => {
		const { adjuster, voice } = setup();
		adjuster.setKnob('release', 0);
		expect(voice()[2][3]).toBe(50);
		adjuster.setKnob('decay', 0);
		expect(voice()[2][3]).toBe(0);

		voice()[2][7] = 1;
		adjuster.commit();
		adjuster.setKnob('decay', 64);
		adjuster.setKnob('release', 127);
		expect(voice()[2][3]).toBe(127);
	});

	it('rebases a param edited elsewhere while the knob is off-centre', () => {
		const { adjuster, voice } = setup();
		adjuster.setKnob('sustain', 32); // k = -0.5 → 100 * 0.5 = 50
		expect(voice()[1][3]).toBe(50);
		voice()[1][3] = 30; // user turns the module knob: implied baseline 60
		adjuster.setKnob('sustain', 64);
		expect(voice()[1][3]).toBe(60);
	});

	it('commit snapshots the focused variation and re-centres every knob', () => {
		const { adjuster, voice } = setup();
		adjuster.setKnob('attack', 127);
		useUiStore().variation = 1;
		adjuster.commit();
		expect(Object.values(adjuster.knobs).every((v) => v === 64)).toBe(true);
		adjuster.setKnob('attack', 0);
		expect(voice(1)[1][1]).toBe(0);
		expect(voice(0)[1][1]).toBe(127); // previous variation keeps its committed value
	});

	it('a whole knob drag is one undo entry', async () => {
		const { slots, adjuster, voice } = setup();
		adjuster.setKnob('attack', 80);
		adjuster.setKnob('attack', 100);
		adjuster.setKnob('attack', 127);
		expect(useHistoryStore().slots.A.past).toHaveLength(1);
		await slots.undo();
		expect(voice()[1][1]).toBe(40);
		expect(voice()[2][1]).toBe(30);
	});

	it('undo/redo moves the knob back and the next move continues from the restored values', async () => {
		const { slots, adjuster, voice } = setup();
		adjuster.setKnob('attack', 32);
		adjuster.setKnob('attack', 0);
		await slots.undo();
		expect(adjuster.knobs.attack).toBe(64);
		expect(voice()[1][1]).toBe(40);
		adjuster.setKnob('attack', 32); // k = -0.5 from the restored baseline 40
		expect(voice()[1][1]).toBe(20);

		await slots.undo();
		await slots.redo();
		expect(adjuster.knobs.attack).toBe(32);
		expect(voice()[1][1]).toBe(20);
		adjuster.setKnob('attack', 64);
		expect(voice()[1][1]).toBe(40);
	});

	it('undo leaves the knobs alone when another variation is focused', async () => {
		const { slots, adjuster, voice } = setup();
		adjuster.setKnob('attack', 0);
		useUiStore().variation = 1;
		adjuster.commit();
		await slots.undo();
		expect(voice(0)[1][1]).toBe(40);
		expect(adjuster.knobs.attack).toBe(64);
	});

	it('a drag whose claimed params change mid-coalesce starts a new undo entry', async () => {
		const { slots, adjuster, voice } = setup();
		adjuster.setKnob('decay', 0); // claims EnvADSR Decay + EnvADR Dcy/Rel
		expect(voice()[2][3]).toBe(0);
		voice()[2][7] = 1; // DcyRel on: EnvADR Dcy/Rel now belongs to Release
		adjuster.setKnob('decay', 127); // claims only EnvADSR Decay
		expect(useHistoryStore().slots.A.past).toHaveLength(2);

		await slots.undo();
		await slots.undo();
		expect(voice()[1][2]).toBe(60);
		expect(voice()[2][3]).toBe(50);
		await slots.redo();
		await slots.redo();
		expect(voice()[1][2]).toBe(127);
		expect(voice()[2][3]).toBe(0);
	});
});
