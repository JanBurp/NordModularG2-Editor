// Port of the graph-drawing functions from
// /Users/jan/Music/Gear/NordModularG2/Tools/patchviewer/main.js (lines 806-1410).
// Each VisualElement with `f: "<name>"` dispatches to the same-named function here.
// `con[i].l` in the original maps to `lv[i]` here; `mode[i]` maps to `modes[i]`.

import type { VisualElement } from '../../types';

// ---------------------------------------------------------------------------
// Visual constants — adjust here to retheme the module graphs
// ---------------------------------------------------------------------------

export const GRAPH_COLORS = {
	bgEnv: '#088', // background rect for graphenv (envelopes, filters, dx)
	bg: '#088', // background rect for graph (LFO/OSC waveforms)
	curveStroke: '#AFA', // waveform / envelope / filter curve stroke
	areaFill: '#066', // area under a curve (envelopes, filter response, comb/noise humps — matches bgEnv → invisible)
	dimLine: '#AFA', // dimmed reference lines (filter 0 dB line, Mux8-1X rails, etc.)
	dimLineOpacity: 0.65, // ditto, opacity
	label: '#FF0', // slope value label (yellow text)
	dxLine: '#AFA', // dxrouter connection lines
	dxNodeBg: '#FF0', // dxrouter node rect
	dxNodeText: '#088', // dxrouter node number
} as const;

// ---------------------------------------------------------------------------
// FastVector (patchviewer:806) and helpers
// ---------------------------------------------------------------------------

type GetStrFn = (this: FastVector, p: string, xs: number, ys: number, yo: number, shp?: number) => string;

const defaultGetstr: GetStrFn = function (p, xs, ys, yo) {
	return `${p}${this.x * xs},${this.y * ys + yo}`;
};

const getstr2: GetStrFn = function (p, xs, ys, yo, shp) {
	let tx = this.x;
	const delta = (this.x2 ?? 0) - tx;
	tx = tx + delta * ((shp ?? 0) * (1 / 128));
	return `${p}${Math.round(tx * xs)},${this.y * ys + yo}`;
};

class FastVector {
	x: number;
	y: number;
	x2?: number;
	getstr: GetStrFn = defaultGetstr;
	constructor(x: number, y: number, x2?: number) {
		this.x = x;
		this.y = y;
		this.x2 = x2;
	}
	add(B: { x: number; y: number }): FastVector {
		return new FastVector(this.x + B.x, this.y + B.y);
	}
}

function fvf(x: number, y: number, x2?: number, ns?: GetStrFn): FastVector {
	const v = new FastVector(x, y, x2);
	if (ns) v.getstr = ns;
	return v;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type GraphPathResult = {
	kind: 'path';
	d: string;
	dFill?: string;
	transform?: string;
	zeroLine?: boolean;
	dimmed?: string; // extra path(s) drawn with the same dimmed reference-line styling as zeroLine
	label?: { text: string; x: number; y: number };
	fill?: string;
};

export type GraphDxNode = { x: number; y: number; label: number };

export type GraphDxResult = {
	kind: 'dx';
	d: string;
	nodes: GraphDxNode[];
};

export type GraphResult = GraphPathResult | GraphDxResult;

const lv = (vals: number[] | undefined, i: number, def = 0): number => {
	const v = vals?.[i];
	return v === undefined ? def : v;
};

// Shared by lfoBgraph/lfoShpgraph/oscShpgraph/oscShpBgraph: assemble a path `d` string from a
// keypoint array via FastVector#getstr — first point is 'M', second uses the curve/line type
// tag, the rest are appended plain.
function buildKeypointPath(points: FastVector[], xs: number, ys: number, yo: number, kt: 'C' | 'L', shp?: number): string {
	let d = points[0].getstr('M', xs, ys, yo, shp) + points[1].getstr(kt, xs, ys, yo, shp);
	points.slice(2).forEach((x) => {
		d += x.getstr(' ', xs, ys, yo, shp);
	});
	return d;
}

// ---------------------------------------------------------------------------
// LFO B graph (patchviewer:905)
// ---------------------------------------------------------------------------

const lfoXf = [
	{ yo: 7, ys: 12.5 },
	{ yo: 7, ys: -12.5 },
	{ yo: 21, ys: 12.5 },
	{ yo: 21, ys: -12.5 },
	{ yo: 14, ys: 26.5 },
	{ yo: 14, ys: -26.5 },
];

function lfoBgraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const dp: FastVector[][] = [
		[
			fvf(0, 0),
			fvf(0.14, -0.2),
			fvf(0.3, -0.5),
			fvf(0.5, -0.5),
			fvf(0.7, -0.5),
			fvf(0.86, -0.2),
			fvf(1, 0),
			fvf(1.14, 0.2),
			fvf(1.3, 0.5),
			fvf(1.5, 0.5),
			fvf(1.7, 0.5),
			fvf(1.86, 0.2),
			fvf(2, 0),
		],
		[fvf(0, 0), fvf(0.5, -0.5), fvf(1.5, 0.5), fvf(2, 0)],
		[fvf(0, 0.5), fvf(0, -0.5), fvf(2, 0.5)],
		[fvf(0, 0.5), fvf(0, -0.5), fvf(1, -0.5), fvf(1, 0.5), fvf(2, 0.5)],
	];
	const phase = lv(vals, 6, 0) * -2.8125 * ((ve.w ?? 0) / 360);
	const wave = lv(vals, 4, 0);
	const xl = lfoXf[lv(vals, 8, 4)] ?? lfoXf[4];
	const kl = dp[wave] ?? dp[0];
	const kt = wave === 0 ? 'C' : 'L';
	const k = kl.concat(kl.slice(1).map((x) => x.add({ x: 2, y: 0 })));
	const d = buildKeypointPath(k, 26, xl.ys, xl.yo, kt);
	return { kind: 'path', d, transform: `translate(${phase},0)` };
}

// ---------------------------------------------------------------------------
// LFO Shape graph (patchviewer:936)
// ---------------------------------------------------------------------------

function lfoShpgraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const dp: FastVector[][] = [
		[fvf(0, 0.5), fvf(0.025, -0.5, 1.975, getstr2), fvf(2, 0.5)],
		[fvf(0, 0.5), fvf(0.975, 0.5, 0.0001, getstr2), fvf(1, -0.5), fvf(1.025, 0.5, 2, getstr2), fvf(2, 0.5)],
		[fvf(0, 0.5), fvf(0.975, 0.5, 0.0001, getstr2), fvf(1, -0.5), fvf(1.025, 0.5, 2, getstr2), fvf(2, 0.5)],
		[fvf(0, 0.5), fvf(0.025, -0.5, 1.975, getstr2), fvf(2, 0.5)],
		[fvf(0, 0), fvf(0.5, -0.5, 0.0001, getstr2), fvf(0.5, -0.5, 1, getstr2), fvf(1.5, 0.5, 1, getstr2), fvf(1.5, 0.5, 2, getstr2), fvf(2, 0)],
		[fvf(0, 0.5), fvf(0, -0.5), fvf(0.01, -0.5, 1.99, getstr2), fvf(0.01, 0.5, 1.99, getstr2), fvf(2, 0.5)],
	];
	const phase = lv(vals, 7, 0) * -2.8125 * ((ve.w ?? 0) / 360);
	const shp = lv(vals, 5, 64);
	const wave = lv(vals, 11, 0);
	const xl = lfoXf[lv(vals, 10, 4)] ?? lfoXf[4];

	let kl = dp[wave] ?? dp[0];
	let kt: 'C' | 'L' = 'L';
	if (wave < 2) {
		kt = 'C';
		kl = expandWaveCurve(kl, shp);
	}
	const k = kl.concat(
		kl.slice(1).map((x) => {
			const nex = x.add({ x: 2, y: 0 });
			if (x.x2) {
				nex.x2 = x.x2 + 2;
				nex.getstr = x.getstr;
			}
			return nex;
		}),
	);
	const d = buildKeypointPath(k, 26, xl.ys, xl.yo, kt, shp);
	return { kind: 'path', d, transform: `translate(${phase},0)` };
}

// ---------------------------------------------------------------------------
// interpol (patchviewer:1011) — used by oscShpgraph / oscShpBgraph
// ---------------------------------------------------------------------------

function interpol(a: number[], b: number[], shp: number): FastVector[] {
	const r: FastVector[] = [];
	const d = [2, 0];
	r.push(fvf(0, 0));
	a.forEach((av, i) => {
		d[i % 2] = av - (av - b[i]) * shp;
		if (i % 2) r.push(fvf(d[0], d[1] - 0.5));
	});
	return r;
}

// ---------------------------------------------------------------------------
// OSC Shape A graph (patchviewer:1023)
// ---------------------------------------------------------------------------

type OscEntry = FastVector[] | [number[], number[]];

function expandWaveCurve(kl: FastVector[], shp: number): FastVector[] {
	const newk: FastVector[] = [];
	let lastx = kl[0].x;
	let lasty = kl[0].y;
	kl.forEach((x, i) => {
		if (i === 0) {
			newk.push(x);
		} else {
			let tx = x.x;
			if (x.x2) {
				const delta = x.x2 - tx;
				tx = tx + delta * (shp * (1 / 128));
			}
			const tx1 = (tx - lastx) / 2;
			newk.push(new FastVector(lastx + tx1, lasty));
			newk.push(new FastVector(tx - tx1, x.y));
			newk.push(new FastVector(tx, x.y));
			lasty = x.y;
			lastx = tx;
		}
	});
	return newk;
}

// Shared by oscShpgraph/oscShpBgraph: the first 5 waveform-shape entries are identical between
// the two graphs (Sine, Saw-ish x2, Square-ish, Triangle).
const OSC_SHAPE_BASE_WAVES: OscEntry[] = [
	[fvf(0, 0.5), fvf(1, -0.5, 0.001, getstr2), fvf(2, 0.5)],
	[
		[0, 0.5, 0.2643, 0, 0.5, 0, 0.7357, 0, 1.0, 0.5, 1.0, 0.5, 1.0, 0.5, 1.264, 1.0, 1.5, 1.0, 1.736, 1.0, 2.0, 0.5, 2.0, 0.5],
		[0, 0.5, 0.15, 0, 0.8999, 0, 1.65, 0, 1.8, 0.5, 1.8, 0.5, 1.8, 0.5, 1.8, 1.0, 1.9, 1.0, 2.0, 1.0, 2.0, 0.5, 2.0, 0.5],
	],
	[
		[0, 0.5, 0.2643, 0, 0.5, 0, 0.7357, 0, 1.0, 0.5, 1.0, 0.5, 1.0, 0.5, 1.264, 1.0, 1.5, 1.0, 1.736, 1.0, 2.0, 0.5, 2.0, 0.5],
		[
			0.3294, 0.4234, 0.6492, 0.3103, 0.95, 0.001531, 0.9667, 0.1815, 0.9833, 0.3615, 1.0, 0.5415, 1.017, 0.6948, 1.033, 0.8482, 1.05, 1.002, 1.382,
			0.6305, 1.692, 0.5297, 2.0, 0.5,
		],
	],
	[
		[0, 0.5, 0.2643, 0, 0.5, 0, 0.7357, 0, 1.0, 0.5, 1.0, 0.5, 1.0, 0.5, 1.264, 1.0, 1.5, 1.0, 1.736, 1.0, 2.0, 0.5, 2.0, 0.5],
		[
			0.05, -0.05072, -0.05, -0.1, 0.5, 0.15, 1.05, -0.1, 0.95, -0.05072, 1.0, 0.4993, 1.05, 1.05, 0.95, 1.1, 1.5, 0.8485, 2.05, 1.1, 1.95, 1.05, 2.0,
			0.4993,
		],
	],
	[fvf(0, 0), fvf(0.5, -0.5, 0.0001, getstr2), fvf(1.5, 0.5, 2, getstr2), fvf(2, 0)],
];

function oscShpgraph(_ve: VisualElement, vals: number[]): GraphPathResult {
	const dp: OscEntry[] = [
		...OSC_SHAPE_BASE_WAVES,
		[
			fvf(0, 0),
			fvf(0, -0.5),
			fvf(1, -0.5, 0.0001, getstr2),
			fvf(1, 0.5, 0.0001, getstr2),
			fvf(2, 0.5, 0.0001, getstr2),
			fvf(2, 0, 0.0001, getstr2),
			fvf(2, 0),
		],
	];
	const shp = lv(vals, 7, 64);
	const wave = lv(vals, 9, 0);
	const entry = dp[wave] ?? dp[0];

	let kl: FastVector[];
	let kt: 'C' | 'L' = 'L';
	if (Array.isArray((entry as unknown[])[0])) {
		const tuple = entry as [number[], number[]];
		kl = interpol(tuple[0], tuple[1], shp * (1 / 128));
		kt = 'C';
	} else {
		kl = entry as FastVector[];
		if (wave < 2) {
			kt = 'C';
			kl = expandWaveCurve(kl, shp);
		}
	}
	const d = buildKeypointPath(kl, 19, 21.5, 11, kt, shp);
	return { kind: 'path', d };
}

// ---------------------------------------------------------------------------
// OSC Shape B graph (patchviewer:1093)
// ---------------------------------------------------------------------------

function oscShpBgraph(_ve: VisualElement, vals: number[], modes: number[] | undefined): GraphPathResult {
	const dp: OscEntry[] = [
		...OSC_SHAPE_BASE_WAVES,
		[
			[0, 0.9965, 0, 0.2965, 0.000306, 0.2938, 0.000306, 0.05479, 2.0, 0.9965],
			[0, 10, 0, 0.3, 1, 1, 1, 0.3, 2.0, 1.0],
		],
		[fvf(0, 0.5), fvf(0, -0.5), fvf(1, -0.5, 1.9, getstr2), fvf(1, 0.5, 1.9, getstr2), fvf(1.9, 0.5)],
		[
			fvf(0, 0),
			fvf(0, -0.5),
			fvf(1, -0.5, 0.0001, getstr2),
			fvf(1, 0.5, 0.0001, getstr2),
			fvf(2, 0.5, 0.0001, getstr2),
			fvf(2, 0, 0.0001, getstr2),
			fvf(2, 0),
		],
	];
	const shp = lv(vals, 6, 64);
	const wave = modes?.[0] ?? 0;
	const entry = dp[wave] ?? dp[0];

	let kl: FastVector[];
	let kt: 'C' | 'L' = 'L';
	if (Array.isArray((entry as unknown[])[0])) {
		const tuple = entry as [number[], number[]];
		kl = interpol(tuple[0], tuple[1], shp * (1 / 128));
		kt = wave > 3 ? 'L' : 'C';
	} else {
		kl = entry as FastVector[];
		if (wave < 2) {
			kt = 'C';
			kl = expandWaveCurve(kl, shp);
		}
	}
	const d = buildKeypointPath(kl, 19, 21.5, 11, kt, shp);
	return { kind: 'path', d };
}

// ---------------------------------------------------------------------------
// Envelope graphs (patchviewer:1168 onward)
// ---------------------------------------------------------------------------

type ThI = { xs: number; ys: number; yo: number; sustime?: number };
type SegMethod = 'lin' | 'exp' | 'log';

const ENV_ARC_STEPS = 8; // C reference (ArcTo) uses 20 angular steps; these graphs are only ~20-90px wide, so 8 is visually smooth and keeps `d` short.

// Mirrors the original editor's ExpTo/LogTo (built on ArcTo, G2Editor.c ~109102-115180):
// samples a quarter-ellipse arc tangent to the box between (x0,y0) and (x1,y1), rather
// than a Bezier with an arbitrary control point. 'exp' centers the ellipse at (x1,y0) ->
// steep-then-flat (decay/release). 'log' centers it at (x0,y1) -> flat-then-steep (attack).
// Returns "L" commands to append to an in-progress path.
function arcSegment(x0: number, y0: number, x1: number, y1: number, mode: 'exp' | 'log'): string {
	const a = Math.abs(x1 - x0);
	const b = Math.abs(y1 - y0);
	if (a < 1e-6 || b < 1e-6) return `L${x1},${y1}`;
	const cx = mode === 'exp' ? x1 : x0;
	const cy = mode === 'exp' ? y0 : y1;
	const theta0 = Math.atan2((y0 - cy) / b, (x0 - cx) / a);
	let theta1 = Math.atan2((y1 - cy) / b, (x1 - cx) / a);
	// The two endpoints are always exactly 90deg apart, but atan2's +-pi branch cut can make
	// the raw theta1 look 270deg away instead of 90deg (e.g. rising 'exp' segments: theta0=pi,
	// theta1=-pi/2). Normalize to the shortest angular path before interpolating.
	let dtheta = theta1 - theta0;
	if (dtheta > Math.PI) dtheta -= 2 * Math.PI;
	if (dtheta <= -Math.PI) dtheta += 2 * Math.PI;
	theta1 = theta0 + dtheta;
	let d = '';
	for (let i = 1; i <= ENV_ARC_STEPS; i++) {
		if (i === ENV_ARC_STEPS) {
			d += `L${x1},${y1}`;
		} else {
			const t = theta0 + ((theta1 - theta0) * i) / ENV_ARC_STEPS;
			d += `L${cx + a * Math.cos(t)},${cy + b * Math.sin(t)}`;
		}
	}
	return d;
}

class EnvSegment {
	l: number;
	t: number;
	sustain = false;
	constructor(t: number, l: number) {
		this.l = l * (1 / 128);
		this.t = t * (1 / 128);
	}
	lin(_i: number, en: EnvCtx): string {
		en.tacc += this.t;
		return `L${en.tacc * en.thi.xs},${this.l * en.thi.ys + en.thi.yo}`;
	}
	private arcTo(i: number, en: EnvCtx, mode: 'exp' | 'log'): string {
		const idx = (i || en.segs.length) - 1;
		const y0 = en.segs[idx].l * en.thi.ys + en.thi.yo;
		const x0 = en.tacc * en.thi.xs;
		en.tacc += this.t;
		const x1 = en.tacc * en.thi.xs;
		const y1 = this.l * en.thi.ys + en.thi.yo;
		return arcSegment(x0, y0, x1, y1, mode);
	}
	exp(i: number, en: EnvCtx): string {
		return this.arcTo(i, en, 'exp');
	}
	log(i: number, en: EnvCtx): string {
		return this.arcTo(i, en, 'log');
	}
	sseg(_i: number, en: EnvCtx): string {
		en.tacc += en.thi.sustime ?? 0;
		return `L${en.tacc * en.thi.xs},${this.l * en.thi.ys + en.thi.yo}`;
	}
}

type EnvCtx = {
	segs: EnvSegment[];
	tacc: number;
	thi: ThI;
};

function envGetd(en: EnvCtx, modes: SegMethod[]): string {
	en.tacc = 0;
	const last = en.segs[en.segs.length - 1];
	let d = `M0,${last.l * en.thi.ys + en.thi.yo}`;
	en.segs.forEach((seg, i) => {
		d += seg[modes[i]](i, en);
		if (seg.sustain) d += seg.sseg(i, en);
	});
	return d;
}

const thi28 = (bit: number): ThI => (bit & 1 ? { ys: -28, xs: 15, yo: 28 } : { ys: 28, xs: 15, yo: 0 });
const thi24x15 = (bit: number): ThI => (bit & 1 ? { ys: -24, xs: 15, yo: 24 } : { ys: 24, xs: 15, yo: 0 });
const thi22x31 = (bit: number): ThI => (bit & 1 ? { ys: -22, xs: 31, yo: 22 } : { ys: 22, xs: 31, yo: 0 });
const thi28x20 = (bit: number): ThI => (bit & 1 ? { ys: -28, xs: 20, yo: 28 } : { ys: 28, xs: 20, yo: 0 });

const envLELE_3: SegMethod[][] = [
	['exp', 'exp', 'exp'],
	['lin', 'exp', 'exp'],
	['log', 'exp', 'exp'],
	['lin', 'lin', 'lin'],
];
const envLELE_4: SegMethod[][] = [
	['exp', 'exp', 'exp', 'exp'],
	['lin', 'exp', 'exp', 'exp'],
	['log', 'exp', 'exp', 'exp'],
	['lin', 'lin', 'lin', 'lin'],
];
const envLELE_2: SegMethod[][] = [
	['exp', 'exp'],
	['lin', 'exp'],
	['log', 'exp'],
	['lin', 'lin'],
];
const envLELE_AHD: SegMethod[][] = [
	['exp', 'lin', 'exp'],
	['lin', 'lin', 'exp'],
	['log', 'lin', 'exp'],
	['lin', 'lin', 'lin'],
];

function adrGraph(_ve: VisualElement, vals: number[]): GraphPathResult {
	const segs = [new EnvSegment(lv(vals, 1, 0), 0), new EnvSegment(lv(vals, 3, 0), 127)];
	if (lv(vals, 7, 0)) segs[0].sustain = true;
	const en: EnvCtx = { segs, tacc: 0, thi: thi24x15(lv(vals, 5, 0)) };
	en.thi.sustime = 2 - segs.reduce((a, b) => (b.sustain ? a : a + b.t), 0);
	return { kind: 'path', d: envGetd(en, envLELE_2[lv(vals, 0, 0)] ?? envLELE_2[0]) };
}

function adsrGraph(_ve: VisualElement, vals: number[]): GraphPathResult {
	const segs = [new EnvSegment(lv(vals, 1, 0), 0), new EnvSegment(lv(vals, 2, 0), 127 - lv(vals, 3, 0)), new EnvSegment(lv(vals, 4, 0), 127)];
	segs[1].sustain = true;
	const en: EnvCtx = { segs, tacc: 0, thi: thi28(lv(vals, 5, 0)) };
	en.thi.sustime = 3 - segs.reduce((a, b) => (b.sustain ? a : a + b.t), 0);
	return { kind: 'path', d: envGetd(en, envLELE_3[lv(vals, 0, 0)] ?? envLELE_3[0]) };
}

function addsrGraph(_ve: VisualElement, vals: number[]): GraphPathResult {
	const segs = [
		new EnvSegment(lv(vals, 2, 0), 0),
		new EnvSegment(lv(vals, 3, 0), 127 - lv(vals, 4, 0)),
		new EnvSegment(lv(vals, 5, 0), 127 - lv(vals, 6, 0)),
		new EnvSegment(lv(vals, 7, 0), 127),
	];
	segs[(lv(vals, 8, 0) && 2) || 1].sustain = true;
	const en: EnvCtx = { segs, tacc: 0, thi: thi28(lv(vals, 9, 0)) };
	en.thi.sustime = 4 - segs.reduce((a, b) => (b.sustain ? a : a + b.t), 0);
	return { kind: 'path', d: envGetd(en, envLELE_4[lv(vals, 1, 0)] ?? envLELE_4[0]) };
}

function multiEnvGraph(_ve: VisualElement, vals: number[]): GraphPathResult {
	const segs = [
		new EnvSegment(lv(vals, 4, 0), 127 - lv(vals, 0, 0)),
		new EnvSegment(lv(vals, 5, 0), 127 - lv(vals, 1, 0)),
		new EnvSegment(lv(vals, 6, 0), 127 - lv(vals, 2, 0)),
		new EnvSegment(lv(vals, 7, 0), 127 - lv(vals, 3, 0)),
	];
	const sustainIdx = lv(vals, 9, 0);
	if (sustainIdx < 3) segs[sustainIdx].sustain = true;
	const en: EnvCtx = { segs, tacc: 0, thi: thi28(lv(vals, 10, 0)) };
	en.thi.sustime = 4.5 - segs.reduce((a, b) => (b.sustain ? a : a + b.t), 0);
	return { kind: 'path', d: envGetd(en, envLELE_4[lv(vals, 12, 0)] ?? envLELE_4[0]) };
}

function adsrMGraph(_ve: VisualElement, vals: number[]): GraphPathResult {
	const segs = [new EnvSegment(lv(vals, 0, 0), 0), new EnvSegment(lv(vals, 1, 0), 127 - lv(vals, 2, 0)), new EnvSegment(lv(vals, 3, 0), 127)];
	segs[1].sustain = true;
	const en: EnvCtx = { segs, tacc: 0, thi: thi28(lv(vals, 8, 0)) };
	en.thi.sustime = 3 - segs.reduce((a, b) => (b.sustain ? a : a + b.t), 0);
	return { kind: 'path', d: envGetd(en, ['exp', 'exp', 'exp']) };
}

function denvGraph(_ve: VisualElement, vals: number[]): GraphPathResult {
	const segs = [new EnvSegment(0, 0), new EnvSegment(lv(vals, 0, 0), 127)];
	const en: EnvCtx = { segs, tacc: 0, thi: thi22x31(lv(vals, 1, 0)) };
	return { kind: 'path', d: envGetd(en, ['lin', 'exp']) };
}

function henvGraph(_ve: VisualElement, vals: number[]): GraphPathResult {
	const segs = [new EnvSegment(0, 0), new EnvSegment(lv(vals, 0, 0), 0), new EnvSegment(0, 127), new EnvSegment(200, 127)];
	const en: EnvCtx = { segs, tacc: 0, thi: thi22x31(lv(vals, 1, 0)) };
	return { kind: 'path', d: envGetd(en, ['lin', 'lin', 'lin', 'lin']) };
}

function ahdGraph(_ve: VisualElement, vals: number[]): GraphPathResult {
	const segs = [new EnvSegment(lv(vals, 1, 0), 0), new EnvSegment(lv(vals, 2, 0), 0), new EnvSegment(lv(vals, 4, 0), 127)];
	const en: EnvCtx = { segs, tacc: 0, thi: thi28x20(lv(vals, 5, 0)) };
	return { kind: 'path', d: envGetd(en, envLELE_AHD[lv(vals, 0, 0)] ?? envLELE_AHD[0]) };
}

function ahdMGraph(_ve: VisualElement, vals: number[]): GraphPathResult {
	const segs = [new EnvSegment(lv(vals, 0, 0), 0), new EnvSegment(lv(vals, 1, 0), 0), new EnvSegment(lv(vals, 2, 0), 127)];
	const en: EnvCtx = { segs, tacc: 0, thi: thi28x20(lv(vals, 6, 0)) };
	return { kind: 'path', d: envGetd(en, ['exp', 'lin', 'exp']) };
}

// ---------------------------------------------------------------------------
// DX Router (patchviewer:1337)
// ---------------------------------------------------------------------------

const dxAla: { x: number; y: number }[][] = [
	[
		{ x: 46, y: 51 },
		{ x: 46, y: 35 },
		{ x: 78, y: 51 },
		{ x: 78, y: 35 },
		{ x: 78, y: 19 },
		{ x: 78, y: 3 },
	],
	[
		{ x: 46, y: 51 },
		{ x: 46, y: 35 },
		{ x: 46, y: 19 },
		{ x: 78, y: 51 },
		{ x: 78, y: 35 },
		{ x: 78, y: 19 },
	],
	[
		{ x: 28, y: 51 },
		{ x: 28, y: 35 },
		{ x: 60, y: 51 },
		{ x: 60, y: 35 },
		{ x: 92, y: 51 },
		{ x: 92, y: 35 },
	],
	[
		{ x: 28, y: 51 },
		{ x: 28, y: 35 },
		{ x: 60, y: 51 },
		{ x: 60, y: 35 },
		{ x: 92, y: 35 },
		{ x: 92, y: 19 },
	],
	[
		{ x: 83, y: 51 },
		{ x: 83, y: 35 },
		{ x: 83, y: 19 },
		{ x: 55, y: 51 },
		{ x: 55, y: 35 },
		{ x: 26, y: 35 },
	],
	[
		{ x: 99, y: 51 },
		{ x: 99, y: 35 },
		{ x: 44, y: 51 },
		{ x: 17, y: 35 },
		{ x: 44, y: 35 },
		{ x: 72, y: 35 },
	],
	[
		{ x: 43, y: 51 },
		{ x: 43, y: 35 },
		{ x: 72, y: 51 },
		{ x: 72, y: 35 },
		{ x: 43, y: 19 },
		{ x: 72, y: 19 },
	],
	[
		{ x: 54, y: 51 },
		{ x: 26, y: 35 },
		{ x: 55, y: 35 },
		{ x: 55, y: 19 },
		{ x: 83, y: 35 },
		{ x: 83, y: 19 },
	],
	[
		{ x: 54, y: 51 },
		{ x: 26, y: 35 },
		{ x: 55, y: 35 },
		{ x: 83, y: 35 },
		{ x: 83, y: 19 },
		{ x: 83, y: 3 },
	],
	[
		{ x: 28, y: 51 },
		{ x: 28, y: 35 },
		{ x: 28, y: 19 },
		{ x: 60, y: 51 },
		{ x: 93, y: 51 },
		{ x: 60, y: 35 },
	],
	[
		{ x: 11, y: 51 },
		{ x: 44, y: 51 },
		{ x: 11, y: 35 },
		{ x: 108, y: 51 },
		{ x: 108, y: 35 },
		{ x: 76, y: 35 },
	],
	[
		{ x: 11, y: 51 },
		{ x: 44, y: 51 },
		{ x: 11, y: 35 },
		{ x: 76, y: 51 },
		{ x: 108, y: 51 },
		{ x: 76, y: 35 },
	],
	[
		{ x: 11, y: 51 },
		{ x: 11, y: 35 },
		{ x: 44, y: 51 },
		{ x: 76, y: 51 },
		{ x: 108, y: 51 },
		{ x: 76, y: 35 },
	],
	[
		{ x: 11, y: 51 },
		{ x: 44, y: 51 },
		{ x: 44, y: 35 },
		{ x: 76, y: 51 },
		{ x: 108, y: 51 },
		{ x: 76, y: 35 },
	],
	[
		{ x: 1, y: 51 },
		{ x: 31, y: 51 },
		{ x: 61, y: 51 },
		{ x: 90, y: 51 },
		{ x: 120, y: 51 },
		{ x: 90, y: 35 },
	],
	[
		{ x: 11, y: 51 },
		{ x: 44, y: 51 },
		{ x: 44, y: 35 },
		{ x: 108, y: 51 },
		{ x: 76, y: 35 },
		{ x: 108, y: 35 },
	],
	[
		{ x: 28, y: 51 },
		{ x: 28, y: 35 },
		{ x: 60, y: 51 },
		{ x: 60, y: 35 },
		{ x: 60, y: 19 },
		{ x: 92, y: 51 },
	],
	[
		{ x: 11, y: 51 },
		{ x: 44, y: 51 },
		{ x: 76, y: 51 },
		{ x: 76, y: 35 },
		{ x: 108, y: 51 },
		{ x: 108, y: 35 },
	],
	[
		{ x: 11, y: 51 },
		{ x: 44, y: 51 },
		{ x: 76, y: 51 },
		{ x: 76, y: 35 },
		{ x: 76, y: 19 },
		{ x: 108, y: 51 },
	],
	[
		{ x: 1, y: 51 },
		{ x: 31, y: 51 },
		{ x: 61, y: 51 },
		{ x: 90, y: 51 },
		{ x: 120, y: 51 },
		{ x: 120, y: 35 },
	],
	[
		{ x: 1, y: 51 },
		{ x: 25, y: 51 },
		{ x: 49, y: 51 },
		{ x: 73, y: 51 },
		{ x: 97, y: 51 },
		{ x: 121, y: 51 },
	],
];

const dxAlb: { i: number; d: string }[] = [
	{ i: 0, d: 'm 54.8,46 0,19.01 33,0 0,-64.3184 12,0 0,15.7984 -12,0' },
	{ i: 0, d: 'm 55,48.51 11.51,0 0,-16.02 -11.61,0 -0.1,32.52 33,0 0,-51.01' },
	{ i: 1, d: 'm 54.8,30 0,34.91 33,0 0,-48.32 11.08,0 0,15.8 -11.08,0' },
	{ i: 1, d: 'm 54.8,30 0,34.91 33,0 0,-48.32 11.08,0 0,46.9 -11.08,-0.12' },
	{ i: 2, d: 'm 36.41,45.93 0,19.01 64.99,0 0,-32.32 11.5,0 0,15.8 -11.5,0 M 68.74,46 l 0,19' },
	{ i: 2, d: 'm 36.41,45.93 0,19.01 64.99,0 0,-32.32 11.4,0 0,31.16 -11.4,0 M 68.68,46 l 0,19' },
	{ i: 3, d: 'M 77.56,50.66 92.43,46.1 m -56.02,-0.17 0,19.01 32.63,0 0,-18.94 M 101,35 l 0.2,-18.59 11.4,0 0,16.18 -11.4,-0.1' },
	{ i: 3, d: 'm 77.52,50.72 14.9,-4.56 m -56.01,-0.17 0,18.97 32.61,0 0,-32.71 -12.23,0.19 0,16.04 12.23,0.1 M 100.9,35.06 101,29.54' },
	{ i: 3, d: 'm 77.45,50.69 14.9,-4.56 m -56.15,2.35 -12.36,0 0,-16.4 12.68,0 -0.18,32.89 32.61,0 0,-18.94 m 32.15,-11 0,-5.04' },
	{ i: 4, d: 'm 43.2,46.1 11.15,4.68 m 8.87,-4.78 0,18.94 28.52,0 0,-48.32 11.06,0 0,15.8 -11.06,0' },
	{ i: 4, d: 'm 43.2,46.1 11.15,4.68 m 8.99,-2.31 11.63,0.1 -0.12,-16.47 -11.63,0 0,32.91 28.52,0 0,-35.01' },
	{ i: 5, d: 'M 71.99,46.1 61.8,50.78 M 34.16,46.1 44.35,50.78 m 63.35,-2.31 11.6,0.1 -0.1,-16.47 -11.6,0 0,2.79 m -54.38,11.15 0,18.97 54.48,0 0,-19.07' },
	{
		i: 5,
		d: 'M 71.99,46.1 61.8,50.78 M 34.16,46.1 44.35,50.78 m 36.07,-4.71 0,2.44 11.55,0 -0.1,-16.47 -11.6,0 0,2.79 m -27.1,11.15 0,18.97 54.53,0 0,-19.07',
	},
	{ i: 6, d: 'm 59.7,30.28 11.87,4.55 m -20.24,11.09 0,19 29,0 0,-34.92 m 0.16,2.41 11.6,0.1 -0.1,-16.47 -11.6,0 0,2.79' },
	{ i: 6, d: 'm 59.7,30.28 11.87,4.55 m -20.24,11.09 0,19 29,0 0,-34.92 m -28.82,18.53 -11.6,0.1 0.1,-15.99 11.6,0 0,2.79' },
	{
		i: 7,
		d: 'M 82.83,46.1 71.68,50.78 M 43.2,46.1 54.35,50.78 m 37.35,-18.31 11.6,0.1 -0.1,-16.47 -11.62,0 0,2.6 m -28.24,11.68 0,34.63 m 28.4,-18.82 0,-16.19',
	},
	{ i: 7, d: 'M 82.83,46.1 71.68,50.78 M 43.2,46.1 54.35,50.78 m 37.39,-4.66 0,-16.19 m -28.4,0.38 0,34.63 m -16.88,-17.59 -0.1,-15.27 -11.62,0 0,2.6' },
	{
		i: 8,
		d: 'm 63.34,34.87 0,30.07 M 82.83,46.1 71.68,50.78 M 43.2,46.1 54.35,50.78 m 0.1,0 17.21,0 0,11.3 -17.21,0 z m 37.3,-15.87 0,-20.75 m -28.43,34.5 8.01,0 3.69,-1.84 -0.1,-14.71 -11.62,0 0,2.6',
	},
	{ i: 9, d: 'm 69.11,34.57 0,-3.13 12.64,0 0,15.99 m -4.43,-1.39 15.16,4.74 m -56.07,-21.97 0,36.13 64.99,0 0,-3.67 M 68.68,46 l 0,19' },
	{
		i: 10,
		d: 'm 93.4,46.04 14.9,4.74 m -87.91,-16.21 0,-3.13 12.64,0 0,15.99 M 28.6,46.04 43.76,50.78 M 20.41,46 l 0,18.94 96.69,0 0,-18.94 m -64.42,14 0,5',
	},
	{
		i: 11,
		d: 'M 93.4,46.04 108.3,50.78 M 28.6,46.04 43.76,50.78 M 20.39,34.57 20.39,31.44 33.03,31.44 33.03,47.43 M 20.41,46 20.41,64.94 117.1,64.94 117.1,62 M 52.68,62 52.68,65 M 84.75,46 84.75,65',
	},
	{
		i: 12,
		d: 'M 75.74,46.04 60.84,50.78 M 93.4,46.04 108.3,50.78 M 84.25,34.38 84.25,31.25 96.95,31.25 96.95,47.24 M 43.67,50.81 60.89,50.81 60.89,62.09 43.67,62.09 z M 20.41,46 20.41,64.94 117.1,64.94 117.1,62 M 52.68,62 52.68,65 M 84.75,46 84.75,65',
	},
	{
		i: 13,
		d: 'M 93.4,46.04 108.3,50.78 M 84.25,34.38 84.25,31.25 96.95,31.25 96.95,47.24 M 20.41,61.95 20.41,64.94 117.1,64.94 117.1,62 M 52.68,46 52.68,64.87 M 84.75,46 84.75,65',
	},
	{
		i: 14,
		d: 'M 39.04,62 39.04,65 M 90.5,46.04 77.83,50.78 M 107.9,46.04 120.3,50.78 M 99.01,34.95 99.01,31.82 111.8,31.82 111.8,47.56 M 9.542,61.67 9.542,64.94 129.1,64.94 129.1,62 M 69.04,62 69.04,65 M 98.75,46 98.75,65',
	},
	{
		i: 14,
		d: 'M 39.04,62 39.04,65 M 107.9,46.04 120.3,50.78 M 99.01,34.95 99.01,31.82 111.8,31.82 111.8,47.56 M 9.542,61.67 9.542,64.94 129.1,64.94 129.1,62 M 69.04,62 69.04,65 M 98.75,46 98.75,65',
	},
	{
		i: 15,
		d: 'M 93.4,46.04 108.3,50.78 M 117.1,34.38 117.1,31.56 129.6,31.56 129.6,48.22 117.1,48.22 M 20.41,61.95 20.41,64.94 117.1,64.94 117.1,45.86 M 52.68,46 52.68,64.87',
	},
	{
		i: 15,
		d: 'M 93.4,46.04 108.3,50.78 M 52.69,34.38 52.69,31.56 65.19,31.56 65.19,48.22 52.69,48.22 M 20.41,61.95 20.41,64.94 117.1,64.94 117.1,45.86 M 52.68,46 52.68,64.87',
	},
	{ i: 16, d: 'M 69.11,18.57 69.11,15.44 81.75,15.44 81.75,32.47 68.62,32.47 M 36.41,45.96 36.41,64.94 101.4,64.94 101.4,61.27 M 68.68,29.52 68.68,65' },
	{
		i: 17,
		d: 'M 117.1,34.38 117.1,31.25 129.9,31.25 129.9,48.13 117.1,48.13 M 20.41,61.95 20.41,64.94 117.1,64.94 117.1,45.72 M 52.68,62.18 52.68,64.87 M 84.75,46 84.75,65',
	},
	{
		i: 18,
		d: 'M 84.75,18.38 84.75,15.25 97.55,15.25 97.55,32.13 84.75,32.13 M 20.41,61.95 20.41,64.94 117.1,64.94 117.1,61.82 M 52.68,62.18 52.68,64.87 M 84.75,29.9 84.75,65',
	},
	{
		i: 19,
		d: 'M 39.04,62 39.04,65 M 129.4,34.92 129.4,31.79 116.6,31.79 116.6,48.32 129.1,48.32 M 9.542,61.67 9.542,64.94 129.1,64.94 129.1,45.67 M 69.04,62 69.04,65 M 98.75,61.54 98.75,65',
	},
	{
		i: 20,
		d: 'M 33.06,62 33.06,65 M 129.4,50.92 129.4,47.79 116.9,47.79 116.9,63.67 129.1,63.67 M 80.82,61.54 80.82,65 M 57.08,62 57.08,65 M 9.542,61.67 9.542,64.94 129.1,64.94 129.1,61.82 M 105.5,62 105.5,65',
	},
];

function dxrouterGraph(_ve: VisualElement, vals: number[]): GraphDxResult | null {
	const algo = lv(vals, 0, 0) || 0;
	const al = dxAlb[algo];
	if (!al) return null;
	const positions = dxAla[al.i] ?? [];
	const nodes: GraphDxNode[] = positions.map((p, ix) => ({ x: p.x, y: p.y, label: ix + 1 }));
	return { kind: 'dx', d: al.d, nodes };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const registry: Record<string, (ve: VisualElement, vals: number[], modes: number[] | undefined) => GraphResult | null> = {
	lfoBgraph,
	lfoShpgraph,
	oscShpgraph,
	oscShpBgraph,
	adrGraph,
	adsrGraph,
	addsrGraph,
	multiEnvGraph,
	adsrMGraph,
	denvGraph,
	henvGraph,
	ahdGraph,
	ahdMGraph,
	dxrouterGraph,
};

// ---------------------------------------------------------------------------
// Filter graph functions (no `f` field — dispatch by module id)
// ---------------------------------------------------------------------------

// Frequency-axis range used for all filter graphs (matches FltFreq's range)
const F_MIN = 13.75;
const F_MAX = 21100;
const F_OCT = Math.log2(F_MAX / F_MIN); // ≈ 10.58

// Param value → Hz mappings
const fltFreqToHz = (v: number) => F_MIN * Math.pow(2, v / 12);
const freq2ToHz = (v: number) => 100 * Math.pow(2, (v / 127) * 7.32);
const freq3ToHz = (v: number) => 20 * Math.pow(2, (v / 127) * 9.64);
const eqMidFreqToHz = (v: number) => 100 * Math.pow(2, (v / 127) * 6.32);
const eqLoFreqToHz = (v: number) => [80, 110, 160][Math.max(0, Math.min(2, v))];
const eqHiFreqToHz = (v: number) => [6000, 8000, 12000][Math.max(0, Math.min(2, v))];

// Param value → other quantities
const eqDbFromVal = (v: number) => ((v - 63.5) * 36) / 127; // EqdB: 0→-18, 64→0, 127→+18
const bandwidthOct = (v: number) => 2 - (1.98 * v) / 127; // EqPeakBandwidth
const res1ToQ = (v: number) => 0.5 * Math.pow(100, v / 127); // Res_1: 0.5..50
const level100Q = (v: number) => 0.5 + (v / 127) * 9.5; // resonance from Level_100: 0.5..10

// Filter response math (magnitude, not in dB)
function resonanceDenom(r: number, Q: number): number {
	return (1 - r * r) * (1 - r * r) + (r / Q) * (r / Q);
}

function lpResp(hz: number, fc: number, Q: number, order: number): number {
	const r = hz / fc;
	const denom = resonanceDenom(r, Q);
	let mag = 1 / Math.sqrt(Math.max(1e-12, denom));
	if (order > 2) {
		mag *= 1 / Math.sqrt(1 + Math.pow(r, 2 * (order - 2)));
	} else if (order < 2 && order > 0) {
		mag = 1 / Math.sqrt(1 + Math.pow(r, 2 * order));
	}
	return mag;
}

function hpResp(hz: number, fc: number, Q: number, order: number): number {
	return lpResp(fc, hz, Q, order);
}

function bpResp(hz: number, fc: number, Q: number): number {
	const r = hz / fc;
	const denom = resonanceDenom(r, Q);
	return r / Q / Math.sqrt(Math.max(1e-12, denom));
}

function brResp(hz: number, fc: number, Q: number): number {
	const r = hz / fc;
	const denom = resonanceDenom(r, Q);
	return Math.abs(1 - r * r) / Math.sqrt(Math.max(1e-12, denom));
}

// Shelving filter (1st-order). gainDb at extreme; flat at the other side; transition near fc.
function loShelfResp(hz: number, fc: number, gainDb: number): number {
	const A = Math.pow(10, gainDb / 40);
	const r = hz / fc;
	// Smooth crossfade between A^2 (DC) and 1 (high freq)
	const k = 1 / (1 + r * r);
	return Math.sqrt(A * A * k + (1 - k));
}

function hiShelfResp(hz: number, fc: number, gainDb: number): number {
	const A = Math.pow(10, gainDb / 40);
	const r = hz / fc;
	const k = (r * r) / (1 + r * r);
	return Math.sqrt(A * A * k + (1 - k));
}

function peakResp(hz: number, fc: number, gainDb: number, bwOct: number): number {
	const A = Math.pow(10, gainDb / 40);
	// Bandwidth in octaves → Q
	const Q = Math.max(0.1, 1 / (2 * Math.sinh((Math.LN2 / 2) * bwOct)));
	const r = hz / fc;
	const w = r - 1 / r;
	const denom = w * w + 1 / (Q * Q);
	const num = w * w + (A * A) / (Q * Q);
	return Math.sqrt(num / Math.max(1e-12, denom));
}

// Sample a magnitude function across the graph and return both the open
// curve (for stroke) and a closed version (for fill). The stroke path
// breaks across regions where the magnitude falls below -dbRange so the
// flat clamped tail at the bottom isn't drawn as a horizontal line.
function sampleResponse(w: number, h: number, mag: (hz: number) => number, dbRange = 24, n = 96): { d: string; dFill: string } {
	const fillParts: string[] = [];
	const strokeParts: string[] = [];
	let inRange = false;
	for (let i = 0; i <= n; i++) {
		const x = (i / n) * w;
		const hz = F_MIN * Math.pow(2, (x / w) * F_OCT);
		let db = 20 * Math.log10(Math.max(1e-6, mag(hz)));
		const clampedLow = db <= -dbRange;
		if (db > dbRange) db = dbRange;
		else if (db < -dbRange) db = -dbRange;
		const y = h / 2 - (db * (h / 2)) / dbRange;
		fillParts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
		if (!clampedLow) {
			strokeParts.push(`${inRange ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`);
			inRange = true;
		} else {
			inRange = false;
		}
	}
	const dFill = `${fillParts.join(' ')} L${w.toFixed(2)},${h} L0,${h} Z`;
	return { d: strokeParts.join(' '), dFill };
}

const FILTER_FILL = GRAPH_COLORS.areaFill;

// Shared by the filter/EQ graph functions below: assemble the common
// { kind: 'path', d, dFill, zeroLine: true, fill: FILTER_FILL, label? } result shape.
function makeFilterGraphResult(d: string, dFill: string, label?: { text: string; x: number; y: number }): GraphPathResult {
	return { kind: 'path', d, dFill, zeroLine: true, fill: FILTER_FILL, label };
}

// Not part of the original editor: FltComb and OscNoise have a Freq-type param the original
// graph never used, unlike every other filter graph in this file (whose curve visibly shifts
// with Freq). Gives them the same "graph moves with Freq" feel via a simple bounded horizontal
// shift, applied as an SVG transform so it doesn't disturb any of the ported geometry above.
const FREQ_SHIFT_FRACTION = 0.3;
function freqShiftAmount(freqParam: number, w: number): number {
	return (freqParam / 127 - 0.5) * w * FREQ_SHIFT_FRACTION;
}

// ---------------------------------------------------------------------------
// Waveshaper transfer-function helper
// ---------------------------------------------------------------------------

function sampleShaper(w: number, h: number, transfer: (x: number) => number, n = 64): string {
	const cx = w / 2;
	const parts: string[] = [`M${cx.toFixed(2)},0 L${cx.toFixed(2)},${h}`];
	for (let i = 0; i <= n; i++) {
		const px = (i / n) * w;
		const input = (i / n) * 2 - 1;
		const output = Math.max(-1, Math.min(1, transfer(input)));
		const py = (h / 2) * (1 - output);
		parts.push(`${i === 0 ? 'M' : 'L'}${px.toFixed(2)},${py.toFixed(2)}`);
	}
	return parts.join(' ');
}

// --- Clip (id 61) ---
function clipGraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const clipLevel = lv(vals, 1, 64) / 127;
	const isAsym = lv(vals, 2, 0) === 0; // 0=Asym, 1=Sym
	const d = sampleShaper(ve.w!, ve.h!, (x) => {
		if (isAsym) return Math.min(x, clipLevel);
		return Math.max(-clipLevel, Math.min(clipLevel, x));
	});
	return { kind: 'path', d, zeroLine: true };
}

// --- Overdrive (id 62) ---
function overdriveGraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const amount = lv(vals, 1, 0) / 127;
	const type = lv(vals, 3, 0); // 0=Soft,1=Hard,2=Fat,3=Heavy
	const isAsym = lv(vals, 4, 0) === 0;
	const maxDrive = [4, 10, 7, 20][Math.max(0, Math.min(3, type))];
	const drive = 1 + amount * maxDrive;
	const norm = Math.tanh(drive);
	const d = sampleShaper(ve.w!, ve.h!, (x) => {
		if (isAsym && x <= 0) return x;
		return Math.tanh(drive * x) / norm;
	});
	return { kind: 'path', d, zeroLine: true };
}

// --- Saturate (id 28) ---
function saturateGraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const amount = lv(vals, 0, 0) / 127;
	const curve = lv(vals, 3, 0);
	const strength = [1, 3, 7, 20][Math.max(0, Math.min(3, curve))];
	const drive = Math.max(0.01, amount * strength);
	const norm = Math.log(1 + drive);
	const d = sampleShaper(ve.w!, ve.h!, (x) => {
		const sign = x < 0 ? -1 : 1;
		return (sign * Math.log(1 + drive * Math.abs(x))) / norm;
	});
	return { kind: 'path', d, zeroLine: true };
}

// --- ShpExp (id 34) ---
function shpExpGraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const amount = lv(vals, 0, 0) / 127;
	const expBase = [2, 3, 4, 5][Math.max(0, Math.min(3, lv(vals, 3, 0)))];
	const e = 1 + (expBase - 1) * amount;
	const d = sampleShaper(ve.w!, ve.h!, (x) => {
		const sign = x < 0 ? -1 : 1;
		return sign * Math.pow(Math.abs(x), e);
	});
	return { kind: 'path', d, zeroLine: true };
}

// --- WaveWrap (id 74) ---
function waveWrapGraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const amount = lv(vals, 1, 0) / 127;
	const gain = 1 + amount * 3;
	const fold = (v: number): number => {
		let w = v;
		for (let i = 0; i < 16 && Math.abs(w) > 1; i++) {
			if (w > 1) w = 2 - w;
			if (w < -1) w = -2 - w;
		}
		return w;
	};
	const d = sampleShaper(ve.w!, ve.h!, (x) => fold(x * gain), 128);
	return { kind: 'path', d, zeroLine: true };
}

function drawLevScaleCurve(w: number, h: number, bpNote: number, slopeL: number, slopeR: number): GraphPathResult {
	const MAX_DB = 40;
	const bpX = (bpNote / 127) * w;
	const bpY = h / 2;

	const gainLeft = slopeL * (bpNote / 12);
	const gainRight = slopeR * ((127 - bpNote) / 12);
	const yLeft = Math.max(0, Math.min(h, bpY * (1 - gainLeft / MAX_DB)));
	const yRight = Math.max(0, Math.min(h, bpY * (1 - gainRight / MAX_DB)));

	const d = [`M${bpX.toFixed(2)},0 L${bpX.toFixed(2)},${h}`, `M0,${yLeft.toFixed(2)} L${bpX.toFixed(2)},${bpY.toFixed(2)} L${w},${yRight.toFixed(2)}`].join(
		' ',
	);

	return { kind: 'path', d, zeroLine: true };
}

function levScalerGraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const slopeL = ((lv(vals, 0, 64) - 64) / 64) * 8.0;
	const bpNote = lv(vals, 1, 64);
	const slopeR = ((lv(vals, 2, 64) - 64) / 64) * 8.0;
	return drawLevScaleCurve(ve.w!, ve.h!, bpNote, slopeL, slopeR);
}

// --- FM Operator (id 180) — two graph slots: rate/level envelope + breakpoint level-scale curve ---
// Panel sizes exactly match the reference editor's CPnlDXEnvGraph (85x28) and CPnlOperatorGraph
// (63x24), confirming which algorithm belongs to which slot — despite the "Operator" class name,
// the rate/level envelope (R1L1..R4L4) is drawn by CPnlDXEnvGraph, not CPnlOperatorGraph.

// Port of CPnlDXEnvGraph::Draw: 4 rate/level stages, each stage's curvature/width shaped by
// 1.0471^level (truncated to a byte — an 8-bit wraparound quirk in the original, preserved here).
// L4 doubles as both the envelope's starting level and the level stage 4 curves back to.
function operatorEnvGraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const w = ve.w! - 2; // geometry uses the post-Shrink(1) rect in the reference
	const h = ve.h! - 2;
	const r1 = lv(vals, 8, 0);
	const l1 = lv(vals, 9, 0);
	const r2 = lv(vals, 10, 0);
	const l2 = lv(vals, 11, 0);
	const r3 = lv(vals, 12, 0);
	const l3 = lv(vals, 13, 0);
	const r4 = lv(vals, 14, 0);
	const l4 = lv(vals, 15, 0);

	const xScale = (w - 3) / 480;
	const yScale = (h - 7) / 100;
	const powByte = (level: number) => (level === 0 ? 0 : Math.trunc(Math.pow(1.0471, level)) & 0xff);
	const yOf = (level: number) => h - 3 - yScale * powByte(level);
	const widthOf = (a: number, b: number, rate: number) => (Math.abs(a - b) / 99) * xScale * (99 - rate);

	const y0 = yOf(l4);
	const y1 = yOf(l1);
	const y2 = yOf(l2);
	const y3 = yOf(l3);

	const x1 = widthOf(l4, l1, r1) + 2;
	const x2 = widthOf(l1, l2, r2) + x1;
	const x3 = widthOf(l2, l3, r3) + x2;
	const xSustainEnd = w - 1 - widthOf(l3, l4, r4);

	const baseline = `M1,${h - 2} L${w},${h - 2}`;
	let curve = `M2,${y0}`;
	curve += arcSegment(2, y0, x1, y1, 'exp');
	curve += arcSegment(x1, y1, x2, y2, 'exp');
	curve += arcSegment(x2, y2, x3, y3, 'exp');
	curve += ` L${xSustainEnd},${y3}`;
	curve += arcSegment(xSustainEnd, y3, w - 1, y0, 'exp');

	const d = `${baseline} ${curve}`;
	const dFill = `${curve} L${w},${h} L2,${h} Z`;
	return { kind: 'path', d, dFill, fill: GRAPH_COLORS.areaFill };
}

// Port of CPnlOperatorGraph::Draw: a dashed centerline plus a breakpoint curve. Both halves
// always meet at (bpX, vMid) exactly. Each half's *DepthMode selects sign (mode<2 → above
// center) and shape (mode 0/3 → straight, 1/2 → curved); *Depth is the (always non-negative)
// magnitude — the original has no bipolar/centered depth math despite the "Depth" naming.
function operatorKbLevScaleGraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const w = ve.w!;
	const h = ve.h!;
	const brPoint = lv(vals, 17, 0);
	const attackMode = lv(vals, 18, 0); // LDepthMode: 0-3
	const attackExtent = lv(vals, 19, 0); // LDepth
	const decayMode = lv(vals, 20, 0); // RDepthMode: 0-3
	const decayExtent = lv(vals, 21, 0); // RDepth

	const vMidF = (h - 4) * 0.5;
	const vMid = Math.trunc(vMidF);
	const bpX = Math.round(((w - 2) * brPoint) / 99);

	const attackUp = attackMode < 2;
	const yAttack = Math.round(vMidF + (attackUp ? attackExtent / 2 : -attackExtent / 2));
	const xAttack = Math.round(bpX - w - 3);

	const decayUp = decayMode === 0 || decayMode === 1;
	const yDecay = Math.round(vMidF + (decayUp ? decayExtent / 2 : -decayExtent / 2));
	const xDecay = Math.round(bpX + w - 1);

	const baseline = `M1,${vMid} L${Math.trunc(w - 2)},${vMid}`;

	let curve = `M${xAttack},${yAttack}`;
	// dir=1 -> 'exp', dir=0 -> 'log': matches the arc-center convention used by the shared
	// envelope arcSegment helper; not independently hardware-verified for this graph.
	curve += attackMode === 0 || attackMode === 3 ? ` L${bpX},${vMid}` : arcSegment(xAttack, yAttack, bpX, vMid, attackMode === 1 ? 'exp' : 'log');
	curve += decayMode === 0 || decayMode === 3 ? ` L${xDecay},${yDecay}` : arcSegment(bpX, vMid, xDecay, yDecay, decayMode === 1 ? 'exp' : 'log');

	return { kind: 'path', d: `${baseline} ${curve}` };
}

function operator(ve: VisualElement, vals: number[]): GraphResult | null {
	if (ve.w === 85 && ve.h === 28) return operatorEnvGraph(ve, vals);
	if (ve.w === 63 && ve.h === 24) return operatorKbLevScaleGraph(ve, vals);
	return null;
}

// --- Oscillator Noise (id 106) ---
// Port of CPnlTunedNoiseGraph::Draw: a flat baseline plus one symmetric "hump" built from two
// chained cubic Beziers (each with both control points collapsed onto the baseline, giving a
// smooth ease-in/ease-out rise to a fixed-x peak). Only the peak's width responds to the param.
function oscNoiseGraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const w = ve.w!;
	const h = ve.h!;
	const p = lv(vals, 5, 64); // Width
	const freqCoarse = lv(vals, 0, 64); // FreqCoarse, 0-127 — not read by the original graph; shifts the peak here (see FREQ_SHIFT_FRACTION)
	const hMinus4 = h - 4;
	const baseY = Math.round(hMinus4);
	const topY = Math.round(baseY - 0.9 * hMinus4);
	const unit = (w - 6) / 128;
	// Baseline deliberately spans the full 0..w width (see hump below), so unlike FltComb the
	// shift is baked into the peak position directly rather than wrapped in an SVG transform —
	// a transform here would leave a gap at one edge and clip the other.
	const midX = Math.round(unit * 64 + 1 + (freqCoarse / 127 - 0.5) * w * FREQ_SHIFT_FRACTION);
	const spread = unit * p;
	const rightCPx = Math.round(spread * 0.7 + midX + 4);
	const leftCPx = Math.round(spread * -0.7 + midX - 4);
	const rightMidX = Math.round((midX + rightCPx) / 2);
	const leftMidX = Math.round((leftCPx + midX) / 2);

	const hump =
		`M0,${baseY} L${leftCPx},${baseY} ` +
		`C${leftMidX},${baseY} ${leftMidX},${baseY} ${midX},${topY} ` +
		`C${rightMidX},${baseY} ${rightMidX},${baseY} ${rightCPx},${baseY} ` +
		`L${w},${baseY}`;
	const dFill = `${hump} L${w},${h} L0,${h} Z`;
	return { kind: 'path', d: hump, dFill, fill: FILTER_FILL };
}

// --- Mux 8-1 X-Fade (id 60) ---
// Port of CPnlXMuxGraph::Draw: a fixed trapezoid/funnel housing (two 4-point straight-line
// polylines, pinched together at a param-driven x offset) plus two dashed vertical rails.
function muxXFadeGraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const w = ve.w!;
	const h = ve.h!;
	const halfW = Math.floor(w * 0.5);
	const sixthW = Math.floor(w / 6);
	const p = lv(vals, 0, 64);
	const off = (p / 127) * (w - 2 * sixthW) * 0.5;
	const yTop = 3;
	const yBase = h - 1;
	const pen0X = 3 * sixthW - 2 * halfW;
	const p1x = off + 2 * sixthW - halfW;
	const p2x = halfW - off;
	const p3x = halfW + off;
	const p5x = halfW + w - 2 * sixthW - off;
	const p6x = 2 * halfW + w - 3 * sixthW;
	const railL = sixthW;
	const railR = w - sixthW;

	const housing =
		`M${pen0X.toFixed(2)},${yBase.toFixed(2)} L${p1x.toFixed(2)},${yTop} L${p2x.toFixed(2)},${yTop} L${p3x.toFixed(2)},${yBase.toFixed(2)} ` +
		`M${p2x.toFixed(2)},${yBase.toFixed(2)} L${p3x.toFixed(2)},${yTop} L${p5x.toFixed(2)},${yTop} L${p6x.toFixed(2)},${yBase.toFixed(2)}`;
	const rails = `M${railL.toFixed(2)},1 L${railL.toFixed(2)},${yBase.toFixed(2)} M${railR.toFixed(2)},1 L${railR.toFixed(2)},${yBase.toFixed(2)}`;
	return { kind: 'path', d: housing, dimmed: rails };
}

// --- Random Trig (id 205) ---
// Port of CPnlRndTrigGraph::Draw: up to 6 vertical tick marks spread across the full graph
// width, each gated by comparing StepProb against a distinct, non-monotonic threshold. The
// reference declares 4 more thresholds (compared against a second, always-zero local var) that
// can never fire — they're omitted here since they're dead code in the original too.
const RND_TRIG_THRESHOLDS = [120, 96, 24, 60, 36];

function rndTrigGraph(ve: VisualElement, vals: number[]): GraphPathResult {
	const w = ve.w!;
	const h = ve.h!;
	const prob = lv(vals, 0, 0);
	const yTop = 2;
	const yBase = h - 2;
	const margin = 1;
	const step = (w - 2 * margin) / 5;
	let d = '';
	RND_TRIG_THRESHOLDS.forEach((threshold, i) => {
		if (prob > threshold) d += ` M${(margin + i * step).toFixed(2)},${yTop} L${(margin + i * step).toFixed(2)},${yBase.toFixed(2)}`;
	});
	if (prob !== 0) d += ` M${(margin + 5 * step).toFixed(2)},${yTop} L${(margin + 5 * step).toFixed(2)},${yBase.toFixed(2)}`;
	return { kind: 'path', d };
}

function makeSlopeLabel(text: string, w: number): { text: string; x: number; y: number } {
	return { text, x: w - 2, y: 9 };
}

// --- Filter Nord (id 51) ---
function filterNord(ve: VisualElement, vals: number[]): GraphPathResult {
	const fc = fltFreqToHz(lv(vals, 0, 75));
	const gc = !!lv(vals, 3, 0);
	const Q = res1ToQ(lv(vals, 4, 0));
	const slopeIdx = lv(vals, 5, 0);
	const filterType = lv(vals, 8, 0);
	const slopeDb = slopeIdx === 0 ? 12 : 24;
	const order = slopeDb / 6;
	const mag = pickFilterResp(filterType, fc, Q, order);
	const norm = gc ? gainComp(mag, fc, Q) : 1;
	const { d, dFill } = sampleResponse(ve.w!, ve.h!, (hz) => mag(hz) * norm);
	return makeFilterGraphResult(d, dFill, makeSlopeLabel(String(slopeDb), ve.w!));
}

// --- Filter Static (id 54) ---
function filterStatic(ve: VisualElement, vals: number[]): GraphPathResult {
	const fc = fltFreqToHz(lv(vals, 0, 75));
	const Q = res1ToQ(lv(vals, 1, 0));
	const filterType = lv(vals, 2, 0);
	const gc = !!lv(vals, 4, 0);
	const order = 2;
	const mag = pickFilterResp(filterType, fc, Q, order);
	const norm = gc ? gainComp(mag, fc, Q) : 1;
	const { d, dFill } = sampleResponse(ve.w!, ve.h!, (hz) => mag(hz) * norm);
	return makeFilterGraphResult(d, dFill);
}

// --- Filter Classic (id 92) — always LP ---
function filterClassic(ve: VisualElement, vals: number[]): GraphPathResult {
	const fc = fltFreqToHz(lv(vals, 0, 75));
	const Q = level100Q(lv(vals, 3, 0));
	const slopeIdx = lv(vals, 4, 0); // 0=12, 1=18, 2=24
	const slopeDb = [12, 18, 24][Math.max(0, Math.min(2, slopeIdx))];
	const order = slopeDb / 6;
	const { d, dFill } = sampleResponse(ve.w!, ve.h!, (hz) => lpResp(hz, fc, Q, order));
	return makeFilterGraphResult(d, dFill, makeSlopeLabel(String(slopeDb), ve.w!));
}

// --- Filter Lowpass (id 87) — always LP, slope from mode ---
function filterLowpass(ve: VisualElement, vals: number[], modes: number[] | undefined): GraphPathResult {
	const fc = fltFreqToHz(lv(vals, 0, 75));
	const slopeIdx = modes?.[0] ?? 0; // 0..5 → 6/12/18/24/30/36 dB
	const slopeDb = [6, 12, 18, 24, 30, 36][Math.max(0, Math.min(5, slopeIdx))];
	const order = slopeDb / 6;
	const { d, dFill } = sampleResponse(ve.w!, ve.h!, (hz) => lpResp(hz, fc, 0.707, order));
	return makeFilterGraphResult(d, dFill, makeSlopeLabel(String(slopeDb), ve.w!));
}

// --- Filter Highpass (id 134) — always HP, slope from mode ---
function filterHighpass(ve: VisualElement, vals: number[], modes: number[] | undefined): GraphPathResult {
	const fc = fltFreqToHz(lv(vals, 0, 75));
	const slopeIdx = modes?.[0] ?? 0;
	const slopeDb = [6, 12, 18, 24, 30, 36][Math.max(0, Math.min(5, slopeIdx))];
	const order = slopeDb / 6;
	const { d, dFill } = sampleResponse(ve.w!, ve.h!, (hz) => hpResp(hz, fc, 0.707, order));
	return makeFilterGraphResult(d, dFill, makeSlopeLabel(String(slopeDb), ve.w!));
}

// --- Eq 2 Band (id 32) ---
function eq2Band(ve: VisualElement, vals: number[]): GraphPathResult {
	const loSlopeDb = eqDbFromVal(lv(vals, 0, 64));
	const hiSlopeDb = eqDbFromVal(lv(vals, 1, 64));
	const loFc = eqLoFreqToHz(lv(vals, 4, 0));
	const hiFc = eqHiFreqToHz(lv(vals, 5, 0));
	const { d, dFill } = sampleResponse(ve.w!, ve.h!, (hz) => loShelfResp(hz, loFc, loSlopeDb) * hiShelfResp(hz, hiFc, hiSlopeDb));
	return makeFilterGraphResult(d, dFill);
}

// --- Eq 3 Band (id 33) ---
function eq3Band(ve: VisualElement, vals: number[]): GraphPathResult {
	const loSlopeDb = eqDbFromVal(lv(vals, 0, 64));
	const midGainDb = eqDbFromVal(lv(vals, 1, 64));
	const midFc = eqMidFreqToHz(lv(vals, 2, 93));
	const hiSlopeDb = eqDbFromVal(lv(vals, 3, 64));
	const loFc = eqLoFreqToHz(lv(vals, 6, 0));
	const hiFc = eqHiFreqToHz(lv(vals, 7, 0));
	const { d, dFill } = sampleResponse(
		ve.w!,
		ve.h!,
		(hz) => loShelfResp(hz, loFc, loSlopeDb) * peakResp(hz, midFc, midGainDb, 1.0) * hiShelfResp(hz, hiFc, hiSlopeDb),
	);
	return makeFilterGraphResult(d, dFill);
}

// --- Eq Peak (id 103) ---
function eqPeak(ve: VisualElement, vals: number[]): GraphPathResult {
	const fc = freq3ToHz(lv(vals, 0, 60));
	const gainDb = eqDbFromVal(lv(vals, 1, 64));
	const bw = bandwidthOct(lv(vals, 2, 64));
	const { d, dFill } = sampleResponse(ve.w!, ve.h!, (hz) => peakResp(hz, fc, gainDb, bw));
	return makeFilterGraphResult(d, dFill);
}

// --- Filter Phase (id 102) — multi-notch ---
function filterPhase(ve: VisualElement, vals: number[]): GraphPathResult {
	const fc = freq2ToHz(lv(vals, 1, 64));
	const notchCount = lv(vals, 4, 2) + 1; // 0..5 → 1..6
	const type = lv(vals, 9, 0); // 0=Notch, 1=Peak, 2=Deep
	const Q = type === 2 ? 8 : type === 1 ? 4 : 2;
	const { d, dFill } = sampleResponse(ve.w!, ve.h!, (hz) => {
		let m = 1;
		for (let k = 1; k <= notchCount; k++) {
			m *= type === 1 ? bpResp(hz, fc * k, Q) * 1.5 + 0.3 : brResp(hz, fc * k, Q);
		}
		return Math.min(2, m);
	});
	return makeFilterGraphResult(d, dFill);
}

// --- Filter Comb (id 162) ---
// Port of CPnlFeedbackFlt::Draw (shared with Phaser), specialized to N=4 (comb's fixed tooth
// count) and P8d=120 (comb's fixed "depth" constant). Draws a lead-in Bezier, 4 repeated
// 2-segment "tooth" Beziers, and a closing Bezier — not a sampled frequency-response curve.
function filterComb(ve: VisualElement, vals: number[]): GraphPathResult {
	const w = ve.w!;
	const h = ve.h!;
	const freqParam = lv(vals, 0, 64); // Freq, 0-127 — not read by the original graph; drives horizontal movement here (see FREQ_SHIFT_FRACTION)
	const fb = lv(vals, 3, 64); // FB, 0-127
	const type = lv(vals, 5, 0); // Type: 0/1/2

	const N = 4;
	const P8D = 120;
	const AMP_SWITCH = 2.0;
	const SPACING_SWITCH = 6.0;
	const OFFSET_SWITCH = -18.0;

	const vertCenter = (h - 2) * 0.5;
	const anchorMid = Math.round(vertCenter + 0.5);

	const toothSpacing = (SPACING_SWITCH * P8D) / 127;
	const toothAmp = ((AMP_SWITCH * P8D) / 127) * 0.8125;
	const leadC1 = (25 - Math.floor((P8D * 20) / 127)) * 0.8125;
	const xOffset = Math.round(-(toothSpacing * (N + 1) - (w - 5)) * 0.5);

	// Mode-selected y-anchors: branch on Type, then on FB relative to the 64 midpoint.
	let f5 = 0;
	let f6 = 0;
	let y25 = anchorMid;
	if (type === 0) {
		if (fb < 64) {
			f6 = (fb * -0.015625 + 1.0) * 15.0;
			y25 = Math.round((fb - 64) * 0.015625 * -15.0 + vertCenter + 0.5);
		} else {
			f5 = (fb - 64) * 0.015625 * 15.0;
		}
	} else if (type === 1) {
		if (fb >= 64) {
			f6 = (fb - 64) * 0.015625 * -15.0;
			y25 = Math.round(vertCenter + f6 + 0.5);
		} else {
			f5 = (fb - 64) * 0.015625 * 15.0;
		}
	} else {
		const t = (fb - 64) * 0.015625;
		if (fb < 64) {
			f5 = t * 15.0;
			f6 = t * -15.0;
		} else {
			f6 = t * -15.0;
			f5 = t * 15.0;
			y25 = Math.round(vertCenter + f6 + 0.5);
		}
	}

	const yP0 = Math.round(f5 + vertCenter + 0.5);
	const leadCP1x = Math.round(leadC1 + OFFSET_SWITCH + 0.5);
	const leadCP2x = Math.round(xOffset - 3.0 + 0.5);
	const leadCP2y = Math.round(f5 * 0.5 + vertCenter + 0.5);
	const leadEndX = Math.round(xOffset + 0.5);
	const penStartX = Math.trunc(OFFSET_SWITCH);

	const leadIn = `M${penStartX},${y25} C${leadCP1x},${anchorMid} ${leadCP2x},${leadCP2y} ${leadEndX},${yP0}`;

	const toothYa = Math.round(vertCenter + 0.5); // f10 is always 0
	const toothYb = Math.round(f6 + vertCenter + 0.5);
	const toothYc = Math.round(f6 + vertCenter + 0.5); // f7 is always 0, so toothYc === toothYb

	let teeth = '';
	let lastToothEndX1 = leadEndX;
	for (let i = 0; i < N; i++) {
		const toothX0 = toothSpacing * 2 * i + xOffset;
		const toothX1 = toothX0 + 2 * toothSpacing;
		const toothCPxA = Math.round(toothSpacing + toothX0 + 0.5);
		const toothCPxB = Math.round(toothAmp + toothX0 + 0.5);
		const toothEndX1 = Math.round(toothX1 + 0.5);
		const toothCPxC = Math.round(toothX1 - toothAmp + 0.5);
		teeth += ` C${toothCPxB},${toothYa} ${toothCPxA},${toothYc} ${toothCPxA},${toothYb}`;
		teeth += ` C${toothCPxA},${toothYc} ${toothCPxC},${toothYa} ${toothEndX1},${yP0}`;
		lastToothEndX1 = toothEndX1;
	}

	// Closing segment: the original's formula for this produced a backward-then-forward loop
	// (visible since the teeth already reach close to the right edge) — mirrors the lead-in's own
	// control-point spacing instead, so x increases monotonically all the way out past the edge.
	const d1 = leadCP1x - penStartX;
	const d2 = leadCP2x - leadCP1x;
	const d3 = leadEndX - leadCP2x;
	const closeCP1x = lastToothEndX1 + d1;
	const closeCP2x = closeCP1x + d2;
	const closeEndX = closeCP2x + d3;
	const closing = ` C${closeCP1x},${leadCP2y} ${closeCP2x},${anchorMid} ${closeEndX},${y25}`;

	const d = `${leadIn}${teeth}${closing}`;

	// The lead-in/closing curves run off-canvas and don't end at the bottom, so the fill uses a
	// flat "roof" out to the panel edges instead of following them — guarantees it always reaches
	// the bottom at x=0/x=w rather than picking up whatever height the curve has out there. Since
	// the whole path (including this fill) gets shifted by the Freq transform below, the corner
	// anchors are pre-compensated by -shift so they still land exactly on x=0/x=w afterwards —
	// otherwise the shift would carry them away from the real edges, leaving a gap on one side.
	const shift = freqShiftAmount(freqParam, w);
	const leftEdge = -shift;
	const rightEdge = w - shift;
	const dFill = `M${leftEdge},${h} L${leftEdge},${yP0} L${leadEndX},${yP0}${teeth} L${lastToothEndX1},${yP0} L${rightEdge},${yP0} L${rightEdge},${h} Z`;

	return { kind: 'path', d, dFill, zeroLine: true, fill: FILTER_FILL, transform: `translate(${shift.toFixed(2)},0)` };
}

// --- Vocoder (id 108) ---
// Port of CPnlVocoderGraph::Draw: NOT a bar chart. For each of 16 bands (skipped when the band's
// value is 0), a single line runs from a fixed near-bottom anchor to an endpoint whose X (not
// height) encodes the band value — VocoderBand's range is 0..16, matching the source's `*12`
// column math exactly (16*12-6 = 186, within the 194px-wide panel).
function vocoder(ve: VisualElement, vals: number[]): GraphPathResult | null {
	// Vocoder has two graph elements; only render bars on the main analysis pane.
	if (ve.h !== 47) return null;
	const h = ve.h!;
	const yBase = h - 2;
	let d = '';
	for (let i = 0; i < 16; i++) {
		const v = lv(vals, i, 0);
		if (v === 0) continue;
		const x0 = 6 + i * 12;
		const x1 = v * 12 - 6;
		d += ` M${x0},${yBase} L${x1},-1`;
	}
	return { kind: 'path', d };
}

// Helpers
function pickFilterResp(filterType: number, fc: number, Q: number, order: number): (hz: number) => number {
	switch (filterType) {
		case 0:
			return (hz) => lpResp(hz, fc, Q, order);
		case 1:
			return (hz) => bpResp(hz, fc, Q);
		case 2:
			return (hz) => hpResp(hz, fc, Q, order);
		case 3:
			return (hz) => brResp(hz, fc, Q);
		default:
			return (hz) => lpResp(hz, fc, Q, order);
	}
}

// Approximate gain compensation: attenuate so resonant peak doesn't exceed +6 dB.
function gainComp(mag: (hz: number) => number, fc: number, Q: number): number {
	if (Q <= 1) return 1;
	const peakMag = mag(fc);
	if (peakMag <= 2) return 1;
	return 2 / peakMag;
}

const moduleIdRegistry: Record<number, (ve: VisualElement, vals: number[], modes: number[] | undefined) => GraphResult | null> = {
	51: filterNord,
	54: filterStatic,
	92: filterClassic,
	87: filterLowpass,
	134: filterHighpass,
	32: eq2Band,
	33: eq3Band,
	103: eqPeak,
	102: filterPhase,
	162: filterComb,
	108: vocoder,
	61: clipGraph,
	62: overdriveGraph,
	28: saturateGraph,
	34: shpExpGraph,
	74: waveWrapGraph,
	115: levScalerGraph,
	106: oscNoiseGraph,
	180: operator,
	60: muxXFadeGraph,
	205: rndTrigGraph,
};

export function getGraph(ve: VisualElement, lvVals: number[] | undefined, modes: number[] | undefined, moduleId?: number): GraphResult | null {
	if (ve.f) {
		const fn = registry[ve.f];
		if (!fn) return null;
		return fn(ve, lvVals ?? [], modes);
	}
	if (moduleId !== undefined) {
		const fn = moduleIdRegistry[moduleId];
		if (fn) return fn(ve, lvVals ?? [], modes);
	}
	return null;
}
