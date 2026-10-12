import { defineStore } from 'pinia';
import { getModule } from '../renderer/nmg2mods';
import { getParam } from '../renderer/parammap';
import { ADJUSTER_KNOBS, adjusterKnobFor, type AdjusterKnob } from '../renderer/patchAdjusterMap';
import { useSlotsStore } from './slots';
import { useUiStore } from './ui';
import type { ParamChange } from './slotHelpers';

// Port of the official editor's "Global Modifiers" (CPatch::ApplyDistribution / ResetUntouchedData in
// G2Editor.c). Each knob scales every param it claims in the focused variation relative to a baseline
// snapshot, so moves never compound and centre restores the baseline exactly.

export const ADJUSTER_CENTRE = 64;

// Knob 0..127 → k in -1..+1 (the original's -50..+50 modifier / 50).
export function knobOffset(knobValue: number): number {
	const d = knobValue - ADJUSTER_CENTRE;
	return d / (d < 0 ? ADJUSTER_CENTRE : 127 - ADJUSTER_CENTRE);
}

// k > 0 moves toward max, k < 0 toward 0; truncated like the original's C cast.
export function adjustValue(baseline: number, k: number, max: number): number {
	const v = k > 0 ? baseline + (max - baseline) * k : baseline * (1 + k);
	return Math.min(max, Math.max(0, Math.trunc(v)));
}

// Inverse of adjustValue (CPatch::HandleParamChange): the baseline that would produce `value` at k.
// The original divides by zero at the extremes; there the baseline is unrecoverable, so keep it.
export function inverseAdjust(value: number, k: number, max: number, fallback: number): number {
	let b: number;
	if (k > 0) b = k === 1 ? fallback : (value - k * max) / (1 - k);
	else if (k < 0) b = k === -1 ? fallback : value / (1 + k);
	else b = value;
	return Math.min(max, Math.max(0, Math.round(b)));
}

interface ClaimedParam {
	key: string;
	area: 'voice' | 'fx';
	moduleId: number;
	paramIdx: number;
	max: number;
	live: number;
}

function centredKnobs(): Record<AdjusterKnob, number> {
	return Object.fromEntries(ADJUSTER_KNOBS.map(({ knob }) => [knob, ADJUSTER_CENTRE])) as Record<AdjusterKnob, number>;
}

// Every param of the focused slot/variation that `knob` claims (all knobs when omitted).
function claimedParams(knob?: AdjusterKnob): ClaimedParam[] {
	const slotsStore = useSlotsStore();
	const ui = useUiStore();
	const entry = slotsStore.slots[ui.slotInFocus];
	const vState = entry?.variations?.[ui.variation];
	if (!entry?.patch || !vState) return [];

	const result: ClaimedParam[] = [];
	(['fx', 'voice'] as const).forEach((area, areaIdx) => {
		for (const mod of entry.patch!.areas[areaIdx]?.modules ?? []) {
			const params = vState[area][mod.index];
			const defs = getModule(mod.type)?.params;
			if (!params || !defs) continue;
			defs.forEach((def, paramIdx) => {
				const owner = adjusterKnobFor(mod.type, paramIdx, params);
				if (!owner || (knob && owner !== knob)) return;
				result.push({
					key: `${area}:${mod.index}:${paramIdx}`,
					area,
					moduleId: mod.index,
					paramIdx,
					max: getParam(def.type)?.high ?? 127,
					live: params[paramIdx],
				});
			});
		}
	});
	return result;
}

export const usePatchAdjusterStore = defineStore('patchAdjuster', {
	state: () => ({
		knobs: centredKnobs(),
		baseline: {} as Record<string, number>,
		lastWritten: {} as Record<string, number>,
	}),
	actions: {
		// ResetUntouchedData: snapshot the focused variation and re-centre all knobs.
		commit() {
			this.knobs = centredKnobs();
			this.baseline = Object.fromEntries(claimedParams().map((p) => [p.key, p.live]));
			this.lastWritten = {};
		},

		setKnob(knob: AdjusterKnob, value: number) {
			const prevK = knobOffset(this.knobs[knob]);
			const k = knobOffset(value);
			this.knobs[knob] = value;

			const changes: ParamChange[] = [];
			for (const p of claimedParams(knob)) {
				// A value we didn't write (manual/hardware/undo edit) rebases this param, so the knob
				// stays relative to what the user now hears.
				const expected = this.lastWritten[p.key] ?? this.baseline[p.key];
				if (expected === undefined) this.baseline[p.key] = p.live;
				else if (p.live !== expected) this.baseline[p.key] = inverseAdjust(p.live, prevK, p.max, this.baseline[p.key]);

				const v = adjustValue(this.baseline[p.key], k, p.max);
				this.lastWritten[p.key] = v;
				changes.push({ area: p.area, moduleId: p.moduleId, paramIdx: p.paramIdx, value: v });
			}
			void useSlotsStore().setParamsMulti(changes, useUiStore().variation, `adjuster:${knob}:${useUiStore().variation}`);
		},
	},
});
