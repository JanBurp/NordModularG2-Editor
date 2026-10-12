// Patch Adjuster ("Global Modifiers" in the official editor) parameter → knob table.
// Generated from the official Mac editor v1.62 (i386 slice of `Nord Modular G2 Editor` in
// `Clavia Editors/mac/Nord Modular G2 OS v1.62 Update.dmg`): each `_k<Name>ParamData` record
// (stride 0x1c) carries the official param-type id at +0x12; CPatch::SetGlobal*Modifier claims
// Attack 0x0b; Decay 0x0c,0x10; Sustain 0x0d; Release 0x0e; Mod. Rate 0x16,0x41,0x88;
// Resonance 0x12,0x87; Timbre 0x05,0x06,0x11,0x22,0x8b; Effects 0x29,0x83.
// Record order = nmg2mods.ts params order, so the inner keys are our param indices.
// EnvADR's Dcy/Rel knob is overridden at runtime (see adjusterKnobFor).

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

export const ADJUSTER_PARAMS: Record<number, Record<number, AdjusterKnob>> = {
	7: { 5: 'timbre', 6: 'timbre' }, // OscB
	8: { 5: 'timbre', 6: 'timbre' }, // OscShpB
	9: { 4: 'timbre' }, // OscC
	12: { 1: 'timbre', 2: 'effects' }, // Reverb
	20: { 1: 'attack', 2: 'decay', 3: 'sustain', 4: 'release' }, // EnvADSR
	23: { 0: 'attack', 1: 'decay', 2: 'sustain', 3: 'release' }, // ModADSR
	24: { 0: 'modRate' }, // LfoC
	25: { 0: 'modRate' }, // LfoShpA
	26: { 0: 'modRate' }, // LfoA
	28: { 0: 'timbre' }, // Saturate
	29: { 0: 'timbre' }, // MetNoise
	31: { 0: 'timbre' }, // Noise
	33: { 2: 'timbre' }, // Eq3Band
	34: { 0: 'timbre' }, // ShpExp
	45: { 4: 'timbre' }, // FltVoice
	46: { 1: 'attack', 4: 'decay' }, // EnvAHD
	49: { 0: 'timbre', 4: 'resonance' }, // FltMulti
	51: { 0: 'timbre', 4: 'resonance', 7: 'timbre' }, // FltNord
	52: { 0: 'sustain', 1: 'sustain', 2: 'sustain', 3: 'sustain', 4: 'attack', 5: 'decay', 6: 'decay', 7: 'decay' }, // EnvMulti
	54: { 0: 'timbre', 1: 'resonance' }, // FltStatic
	55: { 0: 'release' }, // EnvD
	58: { 2: 'decay', 3: 'decay', 6: 'timbre', 7: 'resonance', 9: 'decay', 12: 'decay' }, // DrumSynth
	61: { 1: 'timbre' }, // Clip
	62: { 1: 'timbre' }, // Overdrive
	63: { 0: 'timbre' }, // Scratch
	71: { 0: 'attack', 1: 'release' }, // EnvFollow
	74: { 1: 'timbre' }, // WaveWrap
	84: { 1: 'attack', 3: 'release' }, // EnvADR
	87: { 0: 'timbre' }, // FltLP
	89: { 0: 'modRate', 1: 'timbre', 2: 'resonance' }, // Flanger
	92: { 0: 'timbre', 3: 'resonance' }, // FltClassic
	94: { 0: 'timbre', 1: 'effects' }, // StChorus
	98: { 0: 'timbre' }, // FreqShift
	102: { 1: 'timbre', 5: 'timbre' }, // FltPhase
	103: { 0: 'timbre' }, // EqPeak
	106: { 6: 'timbre' }, // OscNoise
	117: { 1: 'timbre' }, // LevMod
	118: { 1: 'timbre' }, // Digitizer
	119: { 2: 'attack', 3: 'decay', 4: 'sustain', 5: 'decay', 6: 'sustain', 7: 'release' }, // EnvADDSR
	125: { 1: 'timbre' }, // WahWah
	134: { 0: 'timbre' }, // FltHP
	150: { 2: 'attack', 3: 'release' }, // Compressor
	162: { 0: 'timbre' }, // FltComb
	163: { 5: 'timbre', 7: 'timbre' }, // OscShpA
	164: { 8: 'timbre', 11: 'timbre', 13: 'timbre' }, // OscDual
	169: { 0: 'attack', 2: 'decay' }, // ModAHD
	176: { 3: 'effects' }, // DelayA
	177: { 3: 'effects' }, // DelayB
	180: { 13: 'sustain' }, // Operator
	182: { 8: 'effects' }, // DlyStereo
	183: { 4: 'timbre' }, // OscPM
	189: { 1: 'attack', 2: 'release' }, // NoiseGate
	190: { 0: 'modRate' }, // LfoB
	192: { 1: 'modRate', 2: 'resonance' }, // Phaser
	196: { 5: 'decay' }, // OscPerc
	200: { 0: 'modRate' }, // RandomA
	202: { 0: 'modRate' }, // RandomB
};

const ENV_ADR = 84;

// CPatch::ApplyDistribution hard-codes EnvADR param 3: Decay, or Release when DcyRel (param 7) is on.
export function adjusterKnobFor(moduleType: number, paramIdx: number, params: number[]): AdjusterKnob | undefined {
	if (moduleType === ENV_ADR && paramIdx === 3) return params[7] ? 'release' : 'decay';
	return ADJUSTER_PARAMS[moduleType]?.[paramIdx];
}
