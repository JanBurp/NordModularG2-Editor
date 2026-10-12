// Patch Adjuster ("Global Modifiers" in the official editor) parameter → knob mapping, keyed by
// the official param-type ids in paramTypeIds.ts (generated from the Mac editor v1.62).
// EnvADR's Dcy/Rel knob is overridden at runtime (see adjusterKnobFor).

import { PARAM_TYPE_IDS } from './paramTypeIds';

export type AdjusterKnob = 'attack' | 'decay' | 'sustain' | 'release' | 'modRate' | 'timbre' | 'resonance' | 'effects';

export const ADJUSTER_KNOBS: { knob: AdjusterKnob; label: string }[] = [
	{ knob: 'attack', label: 'Attack' },
	{ knob: 'decay', label: 'Decay' },
	{ knob: 'sustain', label: 'Sustain' },
	{ knob: 'release', label: 'Release' },
	{ knob: 'modRate', label: 'Mod. Rate' },
	{ knob: 'timbre', label: 'Timbre' },
	{ knob: 'resonance', label: 'Resonance' },
	{ knob: 'effects', label: 'Effects' },
];

// CPatch::SetGlobal*Modifier: official param-type id → knob.
const KNOB_BY_TYPE_ID: Record<number, AdjusterKnob> = {
	0x0b: 'attack',
	0x0c: 'decay',
	0x10: 'decay',
	0x0d: 'sustain',
	0x0e: 'release',
	0x16: 'modRate',
	0x41: 'modRate',
	0x88: 'modRate',
	0x12: 'resonance',
	0x87: 'resonance',
	0x05: 'timbre',
	0x06: 'timbre',
	0x11: 'timbre',
	0x22: 'timbre',
	0x8b: 'timbre',
	0x29: 'effects',
	0x83: 'effects',
};

const ENV_ADR = 84;

// CPatch::ApplyDistribution hard-codes EnvADR param 3: Decay, or Release when DcyRel (param 7) is on.
export function adjusterKnobFor(moduleType: number, paramIdx: number, params: number[]): AdjusterKnob | undefined {
	if (moduleType === ENV_ADR && paramIdx === 3) return params[7] ? 'release' : 'decay';
	return KNOB_BY_TYPE_ID[PARAM_TYPE_IDS[moduleType]?.[paramIdx] ?? -1];
}
