// Patch Mutator breeding algorithms, transcribed from the official editor (decompiled G2Editor.c,
// CMutaSynthData; line numbers refer to that file). A genome is a VariationState whose values are
// doubles (a captured integer v is stored as v + 0.5, like the official CModuleParamData<double>);
// they are floored when written to the patch or the G2.

import type { MorphAssignment, PatchParamVariation, VariationState } from '../types/patch';
import { PATCH_PARAM_KEYS } from '../types/patch';
import { getModule } from './nmg2mods';
import { getParam } from './parammap';
import { PARAM_TYPE_IDS } from './paramTypeIds';

export type Genome = VariationState;
export type Rng = () => number; // uniform [0, 1)
type AreaKey = 'fx' | 'voice';
const AREAS: AreaKey[] = ['fx', 'voice'];

/** Per area: moduleIndex → module type and its "Exclude From Mutation" flag. */
export type MutaModules = Record<AreaKey, Record<number, { type: number; locked: boolean }>>;

// Quick Lock bits (a set bit = mutable). OscFreq is locked by default (209442).
export const QUICK_LOCKS = [
	{ label: 'OscFreq', bit: 0x01 },
	{ label: 'OscFine', bit: 0x02 },
	{ label: 'Envelope', bit: 0x08 },
	{ label: 'SeqValue', bit: 0x10 },
	{ label: 'SeqEvent', bit: 0x20 },
	{ label: 'Delays', bit: 0x40 },
	{ label: 'Effects', bit: 0x80 },
] as const;
export const DEFAULT_LOCK_MASK = 0xfe;
export const DEFAULT_PROB = 0.3721;
export const DEFAULT_RANGE = 0.189;
export const DEFAULT_CROSS = 0.15;
export const NUM_CHILDREN = 6;

// Module types excluded from mutation when created (GetDefaultMutationLock, G2Demo.c 175670):
// in/out, MIDI, compressors, pitch trackers, Vocoder, 6ch stereo mixer, …
const DEFAULT_LOCKED_TYPES = new Set([
	3, 4, 17, 38, 42, 48, 50, 57, 59, 60, 68, 69, 71, 75, 76, 81, 82, 83, 85, 105, 108, 112, 115, 127, 141, 142, 143, 147, 148, 149, 150, 156, 157, 170, 171,
	178, 188, 189, 198, 199, 208,
]);
export const defaultMutaLock = (moduleType: number): number => (DEFAULT_LOCKED_TYPES.has(moduleType) ? 1 : 0);

// Signal type, mute/bypass, mode buttons etc. are never evolved (208073).
const PERMANENTLY_LOCKED = new Set([
	0x00, 0x08, 0x09, 0x0a, 0x14, 0x15, 0x18, 0x19, 0x1e, 0x1f, 0x20, 0x24, 0x2c, 0x31, 0x32, 0x34, 0x37, 0x3b, 0x3d, 0x3e, 0x40, 0x45, 0x46, 0x48, 0x4a, 0x4b,
	0x55, 0x5b, 0x5d, 0x5e, 0x5f, 0x60, 0x63, 0x67, 0x6a, 0x6f, 0x70, 0x72, 0x74, 0x75, 0x7b, 0x7c, 0x7d, 0x7e, 0x80, 0x81, 0x84, 0x85, 0x90, 0x91, 0x9f,
]);
const EFFECT_MODULES = new Set([12, 63, 89, 94, 98, 118, 150, 167, 192]);
const DELAY_MODULES = new Set([172, 173, 174, 175, 176, 177, 178, 179, 181, 182]);
const CATEGORY_BIT: Record<number, number> = {};
for (const [bit, ids] of [
	[0x01, [0x02, 0x04, 0x4f, 0x50, 0x56, 0x57]],
	[0x02, [0x03, 0x58]],
	[0x04, [0x3a, 0x3c, 0x3f, 0x64]], // no button of its own
	[0x08, [0x0b, 0x0c, 0x0d, 0x0e, 0x10, 0x47, 0x49, 0x52, 0x9d, 0x9e]],
	[0x10, [0x30, 0x33]],
	[0x20, [0x2f]],
] as const)
	for (const id of ids) CATEGORY_BIT[id] = bit;

// Mutation curve per param type (209022): 2 = biased low, 3 = biased high, 4 = biased to the centre.
const CURVE: Record<number, 2 | 3 | 4> = {};
for (const id of [0x02, 0x03, 0x0c, 0x10, 0x25, 0x2d, 0x3f, 0x58, 0x79, 0x8a, 0x9b, 0x9c]) CURVE[id] = 4;
for (const id of [0x05, 0x0b, 0x0e, 0x27, 0x36, 0x49, 0x51, 0x52, 0x65, 0x76, 0x99]) CURVE[id] = 2;
CURVE[0x0f] = 3;

/** CMutaSynthData::IsEnabled (208057): may Mutate/Randomize change this param? */
export function isEnabled(moduleType: number, locked: boolean, paramIdx: number, lockMask: number, soloMask: number): boolean {
	const typeId = PARAM_TYPE_IDS[moduleType]?.[paramIdx];
	if (locked || typeId === undefined || PERMANENTLY_LOCKED.has(typeId)) return false;
	const mask = soloMask || lockMask;
	if (EFFECT_MODULES.has(moduleType)) return (mask & 0x80) !== 0;
	if (DELAY_MODULES.has(moduleType)) return (mask & 0x40) !== 0;
	const bit = CATEGORY_BIT[typeId];
	return bit === undefined ? soloMask === 0 : (mask & bit) !== 0;
}

export function paramMax(moduleType: number, paramIdx: number): number {
	const type = getModule(moduleType)?.params?.[paramIdx]?.type;
	return (type ? getParam(type)?.high : undefined) ?? 127;
}

const exponent = (c: number) => (c >= 0 ? c + 1 : -1 / (c - 1));

// ApplySingleCurve (373082): power warp on [0, M], mirrored for negative input.
function singleCurve(c: number, x: number, max: number): number {
	if (x < 0) return -singleCurve(c, -x, max);
	const m = max + 0.99;
	return Math.pow(x / m, exponent(c)) * m;
}

// ApplyDualCurve (373112): S-shaped warp around M/2.
function dualCurve(lo: number, hi: number, x: number, max: number): number {
	const m = max + 0.99;
	const t = (2 * (x - m / 2)) / m;
	const s = t > 0 ? Math.pow(t, exponent(hi)) + 1 : t === 0 ? 1 : 1 - Math.pow(-t, exponent(lo));
	return m * s * 0.5;
}

/** ApplyCurve (373652). v < 0 → a fresh random value (Randomize), else v moved by ±range. */
export function applyCurve(v: number, range: number, curve: 1 | 2 | 3 | 4, max: number, rng: Rng): number {
	const top = max + 0.999;
	if (curve === 1) return v >= 0 ? v + 2 * range * top * (rng() - 0.5) : rng() * top;
	const [fwd, inv] =
		curve === 2
			? [(x: number) => singleCurve(-1.5, x, max), (x: number) => singleCurve(1.5, x, max)]
			: curve === 3
				? [(x: number) => singleCurve(1.5, x, max), (x: number) => singleCurve(-1.5, x, max)]
				: [(x: number) => dualCurve(-2, -2, x, max), (x: number) => dualCurve(2, 2, x, max)];
	if (v < 0) return inv(rng() * top);
	const d = max * range;
	const lo = fwd(v - d);
	return inv((fwd(v + d) - lo) * rng() + lo);
}

const curveFor = (moduleType: number, paramIdx: number) => CURVE[PARAM_TYPE_IDS[moduleType]?.[paramIdx] ?? -1] ?? 1;

function cloneGenome(g: Genome): Genome {
	return {
		fx: Object.fromEntries(Object.entries(g.fx).map(([k, a]) => [k, [...a]])),
		voice: Object.fromEntries(Object.entries(g.voice).map(([k, a]) => [k, [...a]])),
		patch: clonePatch(g.patch),
	};
}

function clonePatch(p: PatchParamVariation): PatchParamVariation {
	return { ...p, morphDials: [...p.morphDials], morphModes: [...p.morphModes], morphAssignments: p.morphAssignments.map((a) => ({ ...a })) };
}

/** A variation's integer values as a genome (each value centred in its integer bucket). */
export function genomeFromVariation(v: VariationState): Genome {
	const g = cloneGenome(v);
	for (const area of AREAS) for (const vals of Object.values(g[area])) vals.forEach((x, i) => (vals[i] = x + 0.5));
	return g;
}

/** Floors every value, giving a VariationState that can be written to the patch / G2. */
export function variationFromGenome(g: Genome): VariationState {
	const v = cloneGenome(g);
	for (const area of AREAS) for (const vals of Object.values(v[area])) vals.forEach((x, i) => (vals[i] = Math.floor(x)));
	const p = v.patch as unknown as Record<string, number>;
	for (const key of PATCH_PARAM_KEYS) p[key] = Math.floor(p[key]);
	v.patch.morphDials = v.patch.morphDials.map(Math.floor);
	v.patch.morphModes = v.patch.morphModes.map(Math.floor);
	return v;
}

// Shared by Mutate and Randomize: patch settings and morphs are copied, enabled VA/FX params
// replaced by next(value, moduleType, paramIdx).
function mapEnabled(src: Genome, modules: MutaModules, lockMask: number, soloMask: number, next: (v: number, type: number, p: number) => number): Genome {
	const out = cloneGenome(src);
	for (const area of AREAS)
		for (const [idx, vals] of Object.entries(out[area])) {
			const mod = modules[area][Number(idx)];
			if (!mod) continue;
			vals.forEach((v, p) => {
				if (isEnabled(mod.type, mod.locked, p, lockMask, soloMask)) vals[p] = next(v, mod.type, p);
			});
		}
	return out;
}

/** CopyMutateContext (208974): each enabled param changes with probability prob, by ±range. */
export function mutate(src: Genome, modules: MutaModules, prob: number, range: number, lockMask: number, soloMask: number, rng: Rng): Genome {
	return mapEnabled(src, modules, lockMask, soloMask, (v, type, p) => {
		if (rng() >= prob) return v;
		const top = paramMax(type, p) + 0.999;
		const x = applyCurve(v, range, curveFor(type, p), paramMax(type, p), rng);
		return x < 0 ? -x : x > top ? 2 * top - x : x; // reflect at the bounds
	});
}

/** CopyRandomizeContext (208757): every enabled param gets a fresh value from its curve's distribution.
 * The official special case for osc coarse freq when a sibling 0x90 param is 3 is not ported: its
 * curve max sits in a register the decompile lost. */
export function randomize(src: Genome, modules: MutaModules, lockMask: number, soloMask: number, rng: Rng): Genome {
	return mapEnabled(src, modules, lockMask, soloMask, (_v, type, p) => {
		const top = paramMax(type, p) + 0.999;
		return Math.min(Math.max(applyCurve(-1, -1, curveFor(type, p), paramMax(type, p), rng), 0), top);
	});
}

const morphKey = (a: Pick<MorphAssignment, 'location' | 'moduleIndex' | 'paramIndex' | 'groupIndex'>) =>
	`${a.location}:${a.moduleIndex}:${a.paramIndex}:${a.groupIndex}`;

/** InterpolateContext (208532): every param and morph range at fraction t from mother to father; ignores locks. */
export function interpolate(mother: Genome, father: Genome, t: number): Genome {
	const out = cloneGenome(mother);
	const lerp = (m: number, f: number | undefined) => (f === undefined ? m : (f - m) * t + m);
	for (const area of AREAS) for (const [idx, vals] of Object.entries(out[area])) vals.forEach((m, p) => (vals[p] = lerp(m, father[area][Number(idx)]?.[p])));
	const op = out.patch as unknown as Record<string, number>;
	const fp = father.patch as unknown as Record<string, number>;
	for (const key of PATCH_PARAM_KEYS) op[key] = lerp(op[key], fp[key]);
	out.patch.morphDials = out.patch.morphDials.map((m, i) => lerp(m, father.patch.morphDials[i]));
	out.patch.morphModes = out.patch.morphModes.map((m, i) => lerp(m, father.patch.morphModes[i]));

	const fRange = new Map(father.patch.morphAssignments.map((a) => [morphKey(a), a.range]));
	const mRange = new Map(mother.patch.morphAssignments.map((a) => [morphKey(a), a.range]));
	const candidates = [...mother.patch.morphAssignments, ...father.patch.morphAssignments.filter((a) => !mRange.has(morphKey(a)))];
	out.patch.morphAssignments = candidates
		.filter((a) => mother[a.location === 0 ? 'fx' : 'voice'][a.moduleIndex]) // walks mother's modules only
		.map((a) => {
			const md = mRange.get(morphKey(a)) ?? 0;
			return { ...a, range: Math.trunc(md + t * ((fRange.get(morphKey(a)) ?? 0) - md)) };
		})
		.filter((a) => a.range !== 0);
	return out;
}

/** RecombineContext (208640): copy runs of params from one parent, switching parent after each
 * param with probability crossProb; each context starts with a random parent. Ignores locks. */
export function cross(mother: Genome, father: Genome, crossProb: number, rng: Rng): Genome {
	const out = cloneGenome(mother);
	const parents = [mother, father];
	const morphs: MorphAssignment[] = [];
	const step = (cur: number) => (rng() < crossProb ? 1 - cur : cur);

	for (const area of AREAS) {
		let cur = Math.trunc(rng() * 1.9999);
		const loc = area === 'fx' ? 0 : 1;
		for (const [idx, vals] of Object.entries(out[area])) {
			const moduleIndex = Number(idx);
			vals.forEach((_, p) => {
				const src = parents[cur];
				vals[p] = src[area][moduleIndex]?.[p] ?? mother[area][moduleIndex][p];
				morphs.push(
					...src.patch.morphAssignments
						.filter((a) => a.location === loc && a.moduleIndex === moduleIndex && a.paramIndex === p)
						.map((a) => ({ ...a })),
				);
				cur = step(cur);
			});
		}
	}
	out.patch.morphAssignments = morphs;

	// Patch-settings context, in its module order: morph dials, morph modes, then the patch params.
	let cur = Math.trunc(rng() * 1.9999);
	for (const field of ['morphDials', 'morphModes'] as const)
		out.patch[field] = out.patch[field].map((_, i) => {
			const v = parents[cur].patch[field][i];
			cur = step(cur);
			return v;
		});
	const op = out.patch as unknown as Record<string, number>;
	for (const key of PATCH_PARAM_KEYS) {
		op[key] = (parents[cur].patch as unknown as Record<string, number>)[key];
		cur = step(cur);
	}
	return out;
}

/** Link knob formulas (207657 / 207681). */
export function linkedRange(prob: number): number {
	const r = Math.pow(((Math.sqrt(prob) - 0.22) / 0.78) * -0.53 + 0.7, 2);
	return Math.min(Math.max(r, 0), 0.5);
}
export function linkedProb(range: number): number {
	const p = Math.pow(((Math.sqrt(range) - 0.7) / 0.53) * -0.78 + 0.22, 2);
	return Math.min(Math.max(p, 0), 1);
}

/** CDialogMutaBox::MakeParamArray + DrawChromosome (207019 / 207062): turtle walk over the VA then
 * FX values; even entries turn the heading by (a - 63)°, odd entries step forward a. */
export function chromosomePath(g: Genome): [number, number][] {
	const arr: number[] = [];
	for (const area of ['voice', 'fx'] as const) {
		arr.push(0);
		for (const vals of Object.values(g[area])) for (const v of vals) arr.push(Math.trunc(v + 1) & 0xff);
	}
	let heading = 0;
	let x = 0;
	let y = 0;
	const pts: [number, number][] = [];
	arr.forEach((a, i) => {
		pts.push([x, y]);
		if (i % 2 === 0) heading += a - 63;
		else {
			const rad = (heading * Math.PI) / 180;
			x += a * Math.cos(rad);
			y += a * Math.sin(rad);
		}
	});
	pts.push([x, y]);
	return pts;
}
