/**
 * Graph Rendering Functions for Nord Modular G2
 * 
 * Generates SVG paths for module graphs (LFOs, envelopes, oscillators)
 */

import { Patchcord, FastVector, createFastVector } from './patchcord';

interface GraphElement {
  svg: SVGSVGElement;
  f?: string;
  [key: string]: any;
}

interface Control {
  l: number;
  [key: string]: any;
}

/**
 * Safe array access with bounds checking
 */
function safeArrayGet<T>(arr: T[], index: number, defaultIdx = 0, name = ''): T {
  if (index >= 0 && index < arr.length) {
    return arr[index];
  }
  console.warn(`${name}: index ${index} out of bounds [0-${arr.length - 1}], using default ${defaultIdx}`);
  return arr[defaultIdx];
}

/**
 * Interpolate between two arrays of vectors
 */
function interpol(a: FastVector[], b: FastVector[], shp: number): FastVector[] {
  if (!a || !b || !Array.isArray(a) || !Array.isArray(b)) {
    return [];
  }
  const r: FastVector[] = [];
  const d: number[] = [2];
  r.push(createFastVector(0, 0));
  a.forEach(function (a, i) {
    d[i % 2] = (a as any) - ((a as any) - (b as any)[i]) * shp;
    if (i % 2) r.push(createFastVector(d[0], d[1] - 0.5));
  });
  return r;
}

/**
 * LFO B Graph - Renders LFO waveforms
 */
export function lfoBgraph(g: GraphElement, con: Control[]): void {
  const dp = [
    [
      createFastVector(0, 0),
      createFastVector(0.14, -0.2),
      createFastVector(0.3, -0.5),
      createFastVector(0.5, -0.5),
      createFastVector(0.7, -0.5),
      createFastVector(0.86, -0.2),
      createFastVector(1, 0),
    ],
    [
      createFastVector(0, 0),
      createFastVector(0.14, -0.2),
      createFastVector(0.3, -0.5),
      createFastVector(0.5, 0),
      createFastVector(0.7, 0.5),
      createFastVector(0.86, 0.2),
      createFastVector(1, 0),
    ],
    [
      createFastVector(0, 0),
      createFastVector(0.14, 0.2),
      createFastVector(0.3, 0.5),
      createFastVector(0.5, 0.5),
      createFastVector(0.7, 0.5),
      createFastVector(0.86, 0.2),
      createFastVector(1, 0),
    ],
    [
      createFastVector(0, 0),
      createFastVector(0.14, 0.2),
      createFastVector(0.3, 0.5),
      createFastVector(0.5, 0),
      createFastVector(0.7, -0.5),
      createFastVector(0.86, -0.2),
      createFastVector(1, 0),
    ],
    [
      createFastVector(0, 0),
      createFastVector(0.125, 0.5),
      createFastVector(0.25, -0.5),
      createFastVector(0.375, 0.5),
      createFastVector(0.5, -0.5),
      createFastVector(0.625, 0.5),
      createFastVector(0.75, -0.5),
      createFastVector(0.875, 0.5),
      createFastVector(1, 0),
    ],
    [
      createFastVector(0, 0),
      createFastVector(0.2, -0.3),
      createFastVector(0.35, 0.3),
      createFastVector(0.5, -0.3),
      createFastVector(0.65, 0.3),
      createFastVector(0.8, -0.3),
      createFastVector(1, 0),
    ],
  ];
  
  const shp = con[1]?.l ?? 0;
  const waveform = con[0]?.l ?? 0;
  const s = safeArrayGet([0, 0.5, 0.5, 0.25, 0.25, 0.125], shp, 0, 'lfoBgraph') * Math.PI * 2;
  const tp = safeArrayGet(dp, waveform, 0, 'lfoBgraph');
  const d: FastVector[] = [];
  
  tp.forEach(function (v) {
    const x = v.x;
    const ang = s * (x - 0.5);
    const c = Math.cos(ang);
    const ss = Math.sin(ang);
    const nx = v.y * ss + c;
    const ny = v.y * c - v.x * ss;
    d.push(createFastVector(nx, ny));
  });
  
  const m = con[2].l & 1 ? -1 : 1;
  const ph = con[2].l >> 1;
  let path = '';
  
  d.forEach(function (v) {
    const str = v.getstr(path.length ? 'L' : 'M', 48, m * 48, 0);
    if (str && !str.includes('NaN')) {
      path += str + ' ';
    }
  });
  
  if (!path || path === 'M') {
    path = 'M0,0';
  }
  
  const gpath = g.svg.firstChild as SVGPathElement;
  gpath.setAttributeNS(null, 'd', path);
  gpath.setAttributeNS(
    null,
    'transform',
    'translate(' + (ph ? ph * 0.125 : 0) + ',0)',
  );
}

/**
 * LFO Shape A Graph
 */
export function lfoShpgraph(g: GraphElement, con: Control[]): void {
  const dp = [
    [
      createFastVector(0, 0.5),
      createFastVector(1, -0.5, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(2, 0.5),
    ],
    [
      createFastVector(0, 0.5),
      createFastVector(0.25, -0.5, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(0.5, 0.5),
      createFastVector(0.75, -0.5, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(1, 0.5),
    ],
    [
      createFastVector(0, 0.5),
      createFastVector(1, -0.5, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(1.5, 0.5),
      createFastVector(2.5, -0.5, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(3, 0.5),
    ],
    [
      createFastVector(0, 0),
      createFastVector(1, -1, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(1.5, 0),
      createFastVector(2.5, -1, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(3, 0),
    ],
    [
      createFastVector(0, 0),
      createFastVector(1, -1, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(2, 0),
      createFastVector(3, -1, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(4, 0),
    ],
    [
      createFastVector(0, 0),
      createFastVector(1, -1, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(1.5, 0),
      createFastVector(2.5, -1, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(3, 0),
      createFastVector(4, -1, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(4.5, 0),
    ],
    [
      createFastVector(0, 0),
      createFastVector(1, -1, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(1.5, 0),
      createFastVector(2.5, -1, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(3, 0),
      createFastVector(4, -1, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(4.5, 0),
      createFastVector(5.5, -1, 0.001, function (this: any, p, xs, ys, yo) {
        return p + Math.round(this.x * xs, 5) + ',' + (this.y * ys + yo);
      }),
      createFastVector(6, 0),
    ],
  ];
  
  const shp = con[0]?.l ?? 0;
  const shapeVal = con[1]?.l ?? 0;
  const ncycl = safeArrayGet([1, 2, 2, 1, 1, 1.5, 1.5], shp, 0, 'lfoShpgraph');
  const tp = safeArrayGet(dp, shp, 0, 'lfoShpgraph');
  
  if (!tp || !tp[0] || !tp[1]) return;
  
  const s = interpol([tp[0]], [tp[1]], shapeVal);
  if (tp[2]) s.push.apply(s, interpol([tp[1]], [tp[2]], shapeVal));
  
  const d: FastVector[] = [];
  const div = safeArrayGet([1, 2, 2, 1, 1, 1.5, 1.5], shp, 0, 'lfoShpgraph');
  
  s.forEach(function (v) {
    if (v && typeof v.x === 'number' && typeof v.y === 'number') {
      d.push(createFastVector(v.x / ncycl, v.y));
    }
  });
  
  let path = '';
  d.forEach(function (v) {
    const str = v.getstr(path.length ? 'L' : 'M', 40, 40, 0);
    if (str && !str.includes('NaN')) {
      path += str + ' ';
    }
  });
  
  if (!path || path.includes('NaN')) {
    path = 'M0,0';
  }
  
  (g.svg.firstChild as SVGPathElement).setAttributeNS(null, 'd', path);
}

/**
 * Export all graph functions
 */
export const graphFunctions: Record<string, (g: GraphElement, con: Control[], modes?: any) => void> = {
  lfoBgraph,
  lfoShpgraph,
  // Additional graph functions will be added here
};
