const XMLNS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

const MODULE_COLORS = {
  0: '#c0c0c0',
  6: '#e5777a',
  13: '#ba7d81',
  14: '#ca8d8d',
  1: '#ccbaba',
  9: '#e7d14b',
  11: '#dec77d',
  15: '#ded1a5',
  4: '#d0cbaa',
  10: '#93d162',
  8: '#82b980',
  16: '#94cf9c',
  2: '#baccba',
  17: '#69d6c7',
  7: '#7bc1bd',
  18: '#a0d2c8',
  19: '#bed2d2',
  5: '#74a0d4',
  20: '#808cc0',
  12: '#8f9ac2',
  3: '#b0bacc',
  21: '#d673c7',
  22: '#be82be',
  23: '#cda0d2',
  24: '#d2bed2',
};

const CABLE_COLORS = {
  0: '#f26d6d',
  1: '#6d9cf2',
  2: '#f2f26d',
  3: '#f2a26d',
  4: '#6df26d',
  5: '#d26df2',
  6: '#ffffff',
};

function svgNSGet(tag, attrs) {
  const se = typeof tag === 'object' ? tag : document.createElementNS(XMLNS, tag);
  for (const a in attrs) {
    if (a === 'innerHTML' || a === 'textContent') {
      se[a] = attrs[a];
    } else {
      se.setAttributeNS(null, a, attrs[a]);
    }
  }
  return se;
}

function getModuleColor(colourix) {
  return MODULE_COLORS[colourix] || MODULE_COLORS[0];
}

function makeBasicPanel(s, h) {
  const h0 = parseInt(h) - 16;
  s.appendChild(svgNSGet('rect', { width: '256', height: h, fill: 'currentColor' }));
  s.appendChild(
    svgNSGet('rect', {
      width: '256',
      height: 16,
      fill: 'url(#g119)',
      transform: `translate(0,${h0})`,
    }),
  );
  s.appendChild(
    svgNSGet('rect', { width: '256', height: 16, fill: 'url(#g118)' }),
  );
  s.appendChild(
    svgNSGet('path', {
      fill: 'url(#g117)',
      stroke: 'none',
      d: `M256,0 l0,${h - 1} -4,-4 0,${-(h - 7)}z`,
    }),
  );
  s.appendChild(
    svgNSGet('path', {
      fill: 'url(#g116)',
      stroke: 'none',
      d: `M0,0 l0,${h - 1} 4,-4 0,${-(h - 7)}z`,
    }),
  );
}

function makeSubElements(s, o) {
  o.ve?.forEach((n) => {
    switch (n.type) {
      case 'graph':
      case 'graphenv':
        s.appendChild(
          svgNSGet('rect', {
            x: n.x,
            y: n.y,
            width: n.w,
            height: n.h,
            fill: '#088',
          }),
        );
        if (n.type === 'graph') {
          s.appendChild(
            svgNSGet('line', {
              x1: n.x,
              y1: n.y + n.h / 2,
              x2: n.x + n.w,
              y2: n.y + n.h / 2,
              stroke: '#0DD',
            }),
          );
        }
        break;
      case 'line':
        s.appendChild(
          svgNSGet('line', { stroke: '#333', x1: n.x1, y1: n.y1, x2: n.x2, y2: n.y2 }),
        );
        break;
      case 'path':
        s.appendChild(
          svgNSGet('path', { stroke: '#333', fill: 'none', d: n.d }),
        );
        break;
      case 'valueDisplay':
        s.appendChild(
          svgNSGet('rect', {
            x: n.x,
            y: n.y,
            width: n.w,
            height: 14,
            fill: '#666',
            'data-id': n.ref,
          }),
        );
        break;
      case 'led':
      case 'ledArray': {
        const max = n.cnt || 1;
        const spc = +n.xo || 0;
        let x = 2 + n.x;
        for (let i = 0; i < max; i++, x += spc) {
          s.appendChild(
            svgNSGet('rect', {
              fill: '#040',
              stroke: '#000',
              width: n.w,
              height: 6.5,
              x: x,
              y: n.y,
            }),
          );
        }
        break;
      }
      case 'bmp': {
        const t = svgNSGet('svg', { x: n.x, y: n.y });
        const u = document.createElementNS(XMLNS, 'use');
        const classn = `Bitmap${n.id}`;
        u.setAttributeNS(XLINK_NS, 'xlink:href', `#${classn}`);
        t.appendChild(u);
        s.appendChild(t);
        break;
      }
      case 'text':
        s.appendChild(
          svgNSGet('text', { fill: 'black', x: n.x, y: n.y, textContent: n.t }),
        );
        break;
    }
  });

  o.modes?.forEach((n) => {
    const w = n.w;
    if (w) {
      if (w > 0) {
        s.appendChild(
          svgNSGet('rect', {
            stroke: '#222',
            fill: '#EEE',
            x: n.x,
            y: n.y,
            height: n.h,
            width: w,
          }),
        );
      }
      const absW = Math.abs(w);
      s.appendChild(
        svgNSGet('rect', {
          stroke: '#222',
          fill: '#CCC',
          x: n.x + absW,
          y: n.y,
          height: n.h,
          width: 8,
        }),
      );
      s.appendChild(
        svgNSGet('path', {
          stroke: 'none',
          fill: '#000',
          d: `M${n.x + absW + 1.5},${n.y + (n.h >> 1) - 1.5} l5,0 -2.5,3z`,
        }),
      );
    }
  });

  const colourmap = {
    yellow: '#f2f26d',
    orange: '#f2f26d',
    red: '#f26d6d',
    blue: '#6d6df2',
    purple: '#6d6df2',
  };

  o.inputs?.forEach((n) => {
    const t = svgNSGet('svg', {
      fill: colourmap[n.colour],
      x: n.x - 6,
      y: n.y - 5.5,
    });
    const u = document.createElementNS(XMLNS, 'use');
    u.setAttributeNS(XLINK_NS, 'xlink:href', '#input');
    t.appendChild(u);
    s.appendChild(t);
  });

  o.outputs?.forEach((n) => {
    const t = svgNSGet('svg', {
      fill: colourmap[n.colour],
      x: n.x - 6,
      y: n.y - 5.5,
    });
    const u = document.createElementNS(XMLNS, 'use');
    u.setAttributeNS(XLINK_NS, 'xlink:href', '#output');
    t.appendChild(u);
    s.appendChild(t);
  });
}

function setupParam(p) {
  if (p.names) return;
  if (p.high < 17) {
    const nam = p.defin[0].split(',');
    const na = [];
    let maxlen = 0;
    nam.forEach((x) => {
      const k = x.split('~');
      const trimmed = k[1].trim();
      na.push(trimmed);
      const pl = plen(trimmed);
      if (pl > maxlen) maxlen = pl;
    });
    p.width = Math.max(maxlen + 2, 14);
    p.names = na;
  }
}

function plen(s) {
  const charw = [
    4.578125, 2.296875, 3.4375, 5.15625, 5.15625, 8, 6.296875, 1.71875,
    2.859375, 2.859375, 3.4375, 5.15625, 2.296875, 2.859375, 2.296875, 2.296875,
    5.15625, 5.15625, 5.15625, 5.15625, 5.15625, 5.15625, 5.15625, 5.15625,
    5.15625, 5.15625, 2.296875, 2.296875, 5.15625, 5.15625, 5.15625, 5.15625,
    9.15625, 6.296875, 6.296875, 6.296875, 6.296875, 6.296875, 5.71875,
    6.859375, 6.296875, 2.296875, 4.578125, 6.296875, 5.15625, 7.4375, 6.296875,
    6.859375, 6.296875, 6.859375, 6.296875, 6.296875, 5.71875, 6.296875,
    6.296875, 8.578125, 6.296875, 6.296875, 5.71875, 2.296875, 2.296875,
    2.296875, 4, 5.15625, 2.859375, 5.15625, 5.15625, 4.578125, 5.15625,
    5.15625, 2.296875, 5.15625, 5.15625, 1.71875, 1.71875, 4.578125, 1.71875,
    7.4375, 5.15625, 5.15625, 5.15625, 5.15625, 2.859375, 4.578125, 2.296875,
    5.15625, 4.578125, 6.296875, 4.578125, 4.578125,
  ];
  let pl = 0;
  for (let i = 0; i < s.length; i++) pl += charw[s.charCodeAt(i) - 32] || 5;
  return pl;
}

const templateCache = new Map();

export function clearTemplateCache() {
  templateCache.clear();
}

function createModuleTemplate(moduleDef, defs) {
  const cached = templateCache.get(moduleDef.id);
  if (cached) return cached;

  const h = moduleDef.height * 16;
  const s = document.createElementNS(XMLNS, 'svg');
  s.setAttributeNS(null, 'id', moduleDef.shortnm);
  makeBasicPanel(s, h);
  makeSubElements(s, moduleDef);
  defs.appendChild(s);
  templateCache.set(moduleDef.id, s);
  return s;
}

export function addModuleTemplate(moduleInstance, defs, paramMap) {
  const { type, horiz, vert, colour, uname, lv, modes } = moduleInstance;
  const moduleDef = window.modules.getById(type);
  if (!moduleDef) return 0;

  const h = moduleDef.height * 16;
  const xpos = horiz * 256;
  const ypos = vert * 16;

  let template = createModuleTemplate(moduleDef, defs);
  const templateId = template.id;

  const g = svgNSGet('g', {
    class: 'module',
    transform: `translate(${xpos},${ypos})`,
  });
  const moduleColor = getModuleColor(colour);
  const u = document.createElementNS(XMLNS, 'use');
  u.setAttributeNS(XLINK_NS, 'xlink:href', `#${templateId}`);
  u.setAttributeNS(null, 'fill', moduleColor);
  u.setAttributeNS(null, 'color', moduleColor);
  g.appendChild(u);

  const textop = { x: 10, a: 'start' };
  if (type === 0x7e) {
    textop.x = 128;
    textop.a = 'middle';
  }
  const textAttrs = {
    fill: '#000',
    x: textop.x,
    y: 10,
    'text-anchor': textop.a,
    textContent: (uname !== undefined && uname !== null) ? uname : moduleDef.shortnm,
  };
  if (type === 0x7e) textAttrs['font-weight'] = 'bold';
  g.appendChild(svgNSGet('text', textAttrs));

  g.lv = lv;
  g.modes = modes;
  g.modid = type;
  g.moduleDef = moduleDef;

  defs.parentNode.appendChild(g);

  setupModuleControls(g, moduleDef, paramMap);

  return h;
}

export function setupModuleControls(moduleGroup, moduleDef, paramMap) {
  const { lv, modes } = moduleGroup;
  const controls = [];

  const vds = [];
  let graph = null;

  moduleDef.ve?.forEach((ve) => {
    if (ve.type === 'valueDisplay') {
      const text = svgNSGet('text', {
        x: 3 + ve.x,
        y: 9.5 + ve.y,
        fill: '#FFF',
      });
      let ii = ve.ref;
      if (ii instanceof Array) ii = ii[0];
      const p = paramMap[moduleDef.params[ii]?.type] || {};
      let val = p.def || 64;
      if (lv) val = lv[ii] !== undefined ? lv[ii] : val;
      // Don't format here - vds.forEach loop will handle formatting with proper context
      text.textContent = val;
      vds.push({ el: text, id: ve.ref });
      moduleGroup.appendChild(text);
    }
    if (ve.type === 'graph' || ve.type === 'graphenv') {
      const p = svgNSGet('path', {
        stroke: '#AFA',
        fill: ve.type === 'graph' ? 'none' : '#00A4A4',
      });
      const s = svgNSGet('svg', {
        x: ve.x + 0.5,
        y: ve.y,
        width: ve.w,
        height: ve.h,
        class: 'clipper',
      });
      s.appendChild(p);
      moduleGroup.appendChild(s);
      graph = Object.assign({}, ve);
      graph.svg = s;
    }
  });

  moduleDef.params?.forEach((knob, knobIndex) => {
    const n = knob.n;
    let dial;
    let area;
    const x = knob.x;
    const y = knob.y;
    let ang = 0;
    let sv;
    const p = paramMap[knob.type] || {};
    const defaultVal = p.def ?? 64;
    const l = (lv && typeof lv[knobIndex] === 'number') ? lv[knobIndex] : defaultVal;

    if (p.defin && !p.names && p.high < 17) {
      setupParam(p);
    }

    switch (n) {
      case 'KnobBig':
      case 'KnobMedium':
      case 'KnobSmall':
      case 'KnobReset': {
        const r = { KnobBig: 11, KnobMedium: 10, KnobSmall: 9, KnobReset: 10 }[n] || 10;
        const top = n === 'KnobReset' ? 6 : 0;
        ang = (l / 128) * 270 - 135;
        if (!Number.isFinite(ang)) ang = 0;
        const cx = (Number.isFinite(x) ? x : 0) + r;
        const cy = (Number.isFinite(y) ? y : 0) + top + r;
        area = svgNSGet('svg', {
          x: cx - r - 2,
          y: cy - r - 2,
          width: r * 2 + 4,
          height: r * 2 + 4,
          class: 'knob',
        });
        const strokeColor = '#333';
        if (n === 'KnobSmall') {
          area.appendChild(svgNSGet('circle', { r: r, cx: r + 2, cy: r + 2, fill: 'url(#g120)', stroke: strokeColor, 'stroke-width': 0.5 }));
          area.appendChild(svgNSGet('line', { x1: 0.5, y1: r + 9.5, x2: 2.5, y2: r + 7.5, stroke: strokeColor }));
          area.appendChild(svgNSGet('line', { x1: r * 2 + 3.5, y1: r + 9.5, x2: r * 2 + 1.5, y2: r + 7.5, stroke: strokeColor }));
        } else if (n === 'KnobMedium') {
          area.appendChild(svgNSGet('circle', { r: r, cx: r + 2, cy: r + 2, fill: 'url(#g120)', stroke: strokeColor, 'stroke-width': 0.5 }));
          area.appendChild(svgNSGet('line', { x1: 1, y1: r + 9, x2: 3, y2: r + 7, stroke: strokeColor }));
          area.appendChild(svgNSGet('line', { x1: r * 2 + 3, y1: r + 9, x2: r * 2 + 1, y2: r + 7, stroke: strokeColor }));
        } else if (n === 'KnobReset') {
          area.appendChild(svgNSGet('circle', { r: r, cx: r + 2, cy: r + 2, fill: 'url(#g120)', stroke: strokeColor, 'stroke-width': 0.5 }));
          area.appendChild(svgNSGet('path', { d: 'm9,-2 l6,0 -3,4 z', fill: 'green', stroke: 'black' }));
          area.appendChild(svgNSGet('line', { x1: 1, y1: r + 11, x2: 3, y2: r + 9, stroke: strokeColor }));
          area.appendChild(svgNSGet('line', { x1: r * 2 + 3, y1: r + 11, x2: r * 2 + 1, y2: r + 9, stroke: strokeColor }));
        } else if (n === 'KnobBig') {
          area.appendChild(svgNSGet('circle', { r: r, cx: r + 2, cy: r + 2, fill: 'url(#g120)', stroke: strokeColor, 'stroke-width': 0.5 }));
          area.appendChild(svgNSGet('line', { x1: 1, y1: r + 11, x2: 3, y2: r + 9, stroke: strokeColor }));
          area.appendChild(svgNSGet('line', { x1: r * 2 + 3, y1: r + 11, x2: r * 2 + 1, y2: r + 9, stroke: strokeColor }));
        }
        dial = svgNSGet('line', {
          x1: cx,
          y1: cy,
          x2: cx,
          y2: cy - r,
          stroke: 'black',
          'stroke-width': 2,
        });
        dial.setAttribute('transform', `rotate(${ang} ${cx} ${cy})`);
        break;
      }
      case 'KnobSlider':
      case 'KnobSeqSlider': {
        ang = (Number.isFinite(l) ? l : 64) * 0.3125;
        if (!Number.isFinite(ang)) ang = 0;
        area = svgNSGet('rect', {
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
          width: 12,
          height: 62,
          fill: 'rgba(44,0,0,0.01)',
        });
        dial = svgNSGet('rect', {
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
          width: 10,
          height: 6,
          fill: 'url(#g121)',
          stroke: 'none',
          transform: `translate(0,${ang})`,
        });
        break;
      }
      default: {
        const w = p.width || 18;
        let xo = 0;
        let yo = 0;
        let cnt = 1;
        if (p.mode === 'VR' || p.mode === 'HR') {
          cnt = p.names?.length || 1;
          if (p.mode === 'VR') yo = 11;
          else xo = w;
        }
        area = svgNSGet('svg', { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 });
        const fillt = ['#6df2f2', '#CCC'];
        const active = Number.isFinite(l) ? l : 0;
        const rows = p.rows || 1;
        const itemsPerRow = Math.ceil(cnt / rows);
        let ro = 0;
        let co = 0;
        for (let i = 0; i < cnt; i++) {
          const nix = cnt === 1 ? active : i;
          let t = '';
          if (p.names && p.names.length > 0) {
            const nameIndex = (nix >= 0 && nix < p.names.length) ? nix : 0;
            const nameFromMap = p.names[nameIndex];
            t = nameFromMap !== undefined ? getSwName(nameFromMap, knob.name) : (knob.name || '');
          }
          const isActive = i === active;
          const fill = cnt > 1 ? (isActive ? fillt[0] : fillt[1]) : fillt[0];
          // Calculate column and row position
          co = i % itemsPerRow;
          if (i > 0 && co === 0) ro += 11;
          if (t === '' && cnt === 1) t = '\u00A0\u00A0';
          const re = svgNSGet('rect', {
            x: co * xo,
            y: (i < itemsPerRow ? i : (i % itemsPerRow)) * yo + ro,
            opacity: 0.5,
            fill: fill,
            stroke: '#333',
            width: w,
            height: 11,
          });
          area.appendChild(re);

          // Check if this parameter should show a bitmap instead of text
          if (p.bmp) {
            // Render bitmap for wavefile selectors
            const bx = co * xo;
            const by = (i < itemsPerRow ? i : (i % itemsPerRow)) * yo + ro;
            const bitmapSvg = svgNSGet('svg', {
              x: bx,
              y: by,
              width: w,
              height: 11,
            });
            // Create a clipPath to show only this button's portion of the bitmap
            const clipId = `clip${p.bmp}_${i}_${co}_${ro}`;
            const clipPath = document.createElementNS(XMLNS, 'clipPath');
            clipPath.setAttribute('id', clipId);
            const clipRect = svgNSGet('rect', {
              x: 0,
              y: 0,
              width: w,
              height: 11,
            });
            clipPath.appendChild(clipRect);
            bitmapSvg.appendChild(clipPath);

            const use = document.createElementNS(XMLNS, 'use');
            use.setAttributeNS(XLINK_NS, 'xlink:href', `#Bitmap${p.bmp}`);
            // Offset the bitmap to show the correct waveform for this button index
            const offsetX = -(i * w);
            use.setAttribute('transform', `translate(${offsetX}, 0)`);
            use.setAttribute('clip-path', `url(#${clipId})`);
            bitmapSvg.appendChild(use);
            area.appendChild(bitmapSvg);
          } else if (t && t.trim() !== '') {
            // Only render text if non-empty
            const textColor = cnt > 1 ? '#000' : '#333';
            const tx = svgNSGet('text', {
              x: w / 2 + co * xo,
              y: 9 + (i < itemsPerRow ? i : (i % itemsPerRow)) * yo + ro,
              fill: textColor,
              textContent: t,
              'text-anchor': 'middle',
            });
            area.appendChild(tx);
          }
          // If text is empty, we render only the colored rect (on/off state) but no text
        }
        break;
      }
    }

    if (area) {
      moduleGroup.appendChild(area);
    }
    if (dial) {
      dial.setAttribute('class', 'nomouse');
      sv = moduleGroup.appendChild(dial);
    }

    controls.push({
      sv: sv || area,
      a: ang,
      l: l,
      mdx: 0,
      n: n,
      x: x,
      y: y,
      p: p,
    });
  });

  moduleDef.modes?.forEach((sw, mIndex) => {
    if (sw.w && sw.w > 0 && sw.h && sw.h > 0) {
      const pm = paramMap[sw.type] || {};
      const vo = pm.h || -18;
      const svgEl = svgNSGet('svg', {
        x: sw.x,
        y: sw.y,
        width: sw.w,
        class: 'clipper',
        height: sw.h,
      });
      const modeValue = modes && modes[mIndex] !== undefined ? modes[mIndex] : 0;
      const ofs = Number.isFinite(modeValue) ? modeValue * vo : 0;
      const u = svgNSGet('use', { transform: `translate(0,${ofs})` });
      u.setAttributeNS(XLINK_NS, 'xlink:href', `#${pm.img}`);
      svgEl.appendChild(u);
      moduleGroup.appendChild(svgEl);
    }
  });

  vds.forEach((vvd) => {
    if (vvd.id instanceof Array) {
      vvd.el.ca = vvd.id;
      vvd.id.forEach((id) => {
        if (controls[id]) controls[id].tw = vvd.el;
      });
      // Format the value if a formatting function exists
      const control0 = controls[vvd.id[0]];
      if (control0?.p?.f && window[control0.p.f]) {
        const t = window[control0.p.f](0, controls, control0.tw);
        if (t !== undefined && t !== null) {
          vvd.el.textContent = t;
        }
      }
    } else if (controls[vvd.id]) {
      controls[vvd.id].tw = vvd.el;
    }
  });

  moduleGroup.controls = controls;
  if (graph && graph.f && graphFunctions[graph.f]) {
    moduleGroup.graph = graph;
    graphFunctions[graph.f](graph, controls, modes);
  }
}

function getSwName(a, b) {
  if (!a || a.indexOf('#') < 0) return a;
  const nmre = /\d+/;
  const m = nmre.exec(b);
  return m ? a.replace('#', m[0]) : b;
}

function getstr2(p, xs, ys, yo, shp) {
  let tx = this.x;
  const delta = this.x2 - tx;
  tx = tx + delta * (shp * (1 / 128));
  return p + Math.round(tx * xs, 5) + ',' + (this.y * ys + yo);
}

function fvf(x, y, x2, ns) {
  const nefv = new FastVector(x, y, x2);
  if (ns) nefv.getstr = getstr2;
  return nefv;
}

function safeArrayGet(arr, index, defaultIdx = 0, name = '') {
  if (index >= 0 && index < arr.length) {
    return arr[index];
  }
  console.warn(`${name}: index ${index} out of bounds [0-${arr.length - 1}], using default ${defaultIdx}`);
  return arr[defaultIdx];
}

function lfoBgraph(g, con) {
  const dp = [
    [
      fvf(0, 0),
      fvf(0.14, -0.2),
      fvf(0.3, -0.5),
      fvf(0.5, -0.5),
      fvf(0.7, -0.5),
      fvf(0.86, -0.2),
      fvf(1, 0),
    ],
    [
      fvf(0, 0),
      fvf(0.14, -0.2),
      fvf(0.3, -0.5),
      fvf(0.5, 0),
      fvf(0.7, 0.5),
      fvf(0.86, 0.2),
      fvf(1, 0),
    ],
    [
      fvf(0, 0),
      fvf(0.14, 0.2),
      fvf(0.3, 0.5),
      fvf(0.5, 0.5),
      fvf(0.7, 0.5),
      fvf(0.86, 0.2),
      fvf(1, 0),
    ],
    [
      fvf(0, 0),
      fvf(0.14, 0.2),
      fvf(0.3, 0.5),
      fvf(0.5, 0),
      fvf(0.7, -0.5),
      fvf(0.86, -0.2),
      fvf(1, 0),
    ],
    [
      fvf(0, 0),
      fvf(0.125, 0.5),
      fvf(0.25, -0.5),
      fvf(0.375, 0.5),
      fvf(0.5, -0.5),
      fvf(0.625, 0.5),
      fvf(0.75, -0.5),
      fvf(0.875, 0.5),
      fvf(1, 0),
    ],
    [
      fvf(0, 0),
      fvf(0.2, -0.3),
      fvf(0.35, 0.3),
      fvf(0.5, -0.3),
      fvf(0.65, 0.3),
      fvf(0.8, -0.3),
      fvf(1, 0),
    ],
  ];
  const shp = con[1] && con[1].l !== undefined ? con[1].l : 0;
  const waveform = con[0] && con[0].l !== undefined ? con[0].l : 0;
  const s = safeArrayGet([0, 0.5, 0.5, 0.25, 0.25, 0.125], shp, 0, 'lfoBgraph') * Math.PI * 2;
  const tp = safeArrayGet(dp, waveform, 0, 'lfoBgraph');
  const d = [];
  tp.forEach(function (v) {
    const x = v.x;
    const ang = s * (x - 0.5);
    const c = Math.cos(ang);
    const ss = Math.sin(ang);
    const nx = v.y * ss + c;
    const ny = v.y * c - v.x * ss;
    d.push(fvf(nx, ny));
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
  const gpath = g.svg.firstChild;
  gpath.setAttributeNS(null, 'd', path);
  gpath.setAttributeNS(
    null,
    'transform',
    'translate(' + (ph ? ph * 0.125 : 0) + ',0)',
  );
}

function lfoShpgraph(g, con) {
  const dp = [
    [
      fvf(0, 0.5),
      fvf(1, -0.5, 0.001, getstr2),
      fvf(2, 0.5),
    ],
    [
      fvf(0, 0.5),
      fvf(0.25, -0.5, 0.001, getstr2),
      fvf(0.5, 0.5),
      fvf(0.75, -0.5, 0.001, getstr2),
      fvf(1, 0.5),
    ],
    [
      fvf(0, 0.5),
      fvf(1, -0.5, 0.001, getstr2),
      fvf(1.5, 0.5),
      fvf(2.5, -0.5, 0.001, getstr2),
      fvf(3, 0.5),
    ],
    [
      fvf(0, 0),
      fvf(1, -1, 0.001, getstr2),
      fvf(1.5, 0),
      fvf(2.5, -1, 0.001, getstr2),
      fvf(3, 0),
    ],
    [
      fvf(0, 0),
      fvf(1, -1, 0.001, getstr2),
      fvf(2, 0),
      fvf(3, -1, 0.001, getstr2),
      fvf(4, 0),
    ],
    [
      fvf(0, 0),
      fvf(1, -1, 0.001, getstr2),
      fvf(1.5, 0),
      fvf(2.5, -1, 0.001, getstr2),
      fvf(3, 0),
      fvf(4, -1, 0.001, getstr2),
      fvf(4.5, 0),
    ],
    [
      fvf(0, 0),
      fvf(1, -1, 0.001, getstr2),
      fvf(1.5, 0),
      fvf(2.5, -1, 0.001, getstr2),
      fvf(3, 0),
      fvf(4, -1, 0.001, getstr2),
      fvf(4.5, 0),
      fvf(5.5, -1, 0.001, getstr2),
      fvf(6, 0),
    ],
  ];
  const shp = con[0] && con[0].l !== undefined ? con[0].l : 0;
  const shapeVal = con[1] && con[1].l !== undefined ? con[1].l : 0;
  const ncycl = safeArrayGet([1, 2, 2, 1, 1, 1.5, 1.5], shp, 0, 'lfoShpgraph');
  const tp = safeArrayGet(dp, shp, 0, 'lfoShpgraph');
  if (!tp || !tp[0] || !tp[1]) return;
  const s = interpol(tp[0], tp[1], shapeVal);
  if (tp[2]) s.push.apply(s, interpol(tp[1], tp[2], shapeVal));
  const d = [];
  const div = safeArrayGet([1, 2, 2, 1, 1, 1.5, 1.5], shp, 0, 'lfoShpgraph');
  s.forEach(function (v) {
    if (v && typeof v.x === 'number' && typeof v.y === 'number') {
      d.push(fvf(v.x / ncycl, v.y));
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
  g.svg.firstChild.setAttributeNS(null, 'd', path);
}

function interpol(a, b, shp) {
  if (!a || !b || !Array.isArray(a) || !Array.isArray(b)) {
    return [];
  }
  const r = [];
  const d = [2];
  r.push(fvf(0, 0));
  a.forEach(function (a, i) {
    d[i % 2] = a - (a - b[i]) * shp;
    if (i % 2) r.push(fvf(d[0], d[1] - 0.5));
  });
  return r;
}

function oscShpgraph(g, con) {
  const dp = [
    [fvf(0, 0.5), fvf(1, -0.5, 0.001, getstr2), fvf(2, 0.5)],
    [
      [
        0, 0.5, 0.2643, 0, 0.5, 0, 0.7357, 0, 1.0, 0.5, 1.0, 0.5, 1.0, 0.5,
        1.264, 1.0, 1.5, 1.0, 1.736, 1.0, 2.0, 0.5, 2.0, 0.5,
      ],
      [
        0, 0.5, 0.15, 0, 0.8999, 0, 1.65, 0, 1.8, 0.5, 1.8, 0.5, 1.8, 0.5, 1.8,
        1.0, 1.9, 1.0, 2.0, 1.0, 2.0, 0.5, 2.0, 0.5,
      ],
      [0, 0.5, 0.5, 0, 1.0, 0.5, 1.5, 1.0, 2.0, 0.5],
      [0, 0.5, 0.5, 0, 1.0, 0, 1.0, 0, 2.0, 0.5],
      [0, 0.5, 1.0, 0.5, 2.0, 0.5],
      [0, 0, 0.5, 0, 1.0, 0.5, 1.5, 0, 2.0, 0],
    ],
    [
      [
        0, 0, 0.5, 1, 1, 0, 1.5, 1, 2, 0, 2.5, 1, 3, 0, 3.5, 1, 4, 0,
      ],
      [
        0, 0, 1.0, 0, 2.0, 0, 2.9999, 1, 3.9999, 0, 5.0, 1, 6.0, 0,
      ],
      [0, 0, 1.0, 1, 2.0, 0, 3.0, 1, 4.0, 0],
      [0, 0, 1.0, 0, 2.0, 1, 3.0, 0, 4.0, 1, 5.0, 0, 6.0, 1, 7.0, 0, 8.0, 1],
      [0, 0, 1.0, 1, 2.0, 0, 3.0, 1, 4.0, 1, 5.0, 0, 6.0, 1, 7.0, 0, 8.0, 1],
    ],
  ];
  // Validate control values with bounds checking
  const shp = con[2] && con[2].l !== undefined ? Math.min(con[2].l, 127) : 0;
  let s = [];
  const wave = con[0] && con[0].l !== undefined ? con[0].l : 0;
  const d1 = dp[0];
  // Clamp waveIdx to valid range [0, dp[1].length - 1]
  let waveIdx = con[1] && con[1].l !== undefined ? con[1].l : 0;
  waveIdx = Math.min(Math.max(waveIdx, 0), dp[1].length - 1);
  // Clamp shapeIdx to valid range [0, dp[2].length - 1]
  let shapeIdx = con[3] && con[3].l !== undefined ? con[3].l : 0;
  shapeIdx = Math.min(Math.max(shapeIdx, 0), dp[2].length - 1);
  const d2 = waveIdx < dp[1].length && Array.isArray(dp[1][waveIdx]) ? dp[1][waveIdx] : dp[1][0];
  const d3 = shapeIdx < dp[2].length && Array.isArray(dp[2][shapeIdx]) ? dp[2][shapeIdx] : dp[2][0];
  s.push(fvf(d1[0], d1[1]));
  s.push(fvf(d1[0], d1[1], d1[2], getstr2));
  s[1].x = 1;
  const len = d2.length;
  let i = 0;
  while (i < len) {
    const a = d2.slice(i, i + 2);
    i += 2;
    const b = d2.slice(i, i + 2);
    i += 2;
    s = s.concat(interpol(fvf(a[0] + 1, a[1]), fvf(b[0] + 1, b[1]), shp));
  }
  if (d3.length) {
    s.push(fvf(s[s.length - 1].x + 0.5, 0.5));
    s = s.concat(interpol(fvf(0, 0.5), fvf(1, 0.5), shp));
    const len = d3.length;
    let i = 0;
    while (i < len) {
      const a = d3.slice(i, i + 2);
      i += 2;
      const b = d3.slice(i, i + 2);
      i += 2;
      s = s.concat(interpol(fvf(a[0] + 1, a[1]), fvf(b[0] + 1, b[1]), shp));
    }
  }
  const d = [];
  s.forEach(function (v) {
    if (v && typeof v.x === 'number' && typeof v.y === 'number') {
      d.push(fvf(v.x / 8, v.y));
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
  g.svg.firstChild.setAttributeNS(null, 'd', path);
}

function oscShpBgraph(g, con, mode) {
  const dp = [
    [fvf(0, 0.5), fvf(1, -0.5, 0.001, getstr2), fvf(2, 0.5)],
    [
      [
        0, 0.5, 0.2643, 0, 0.5, 0, 0.7357, 0, 1.0, 0.5, 1.0, 0.5, 1.0, 0.5,
        1.264, 1.0, 1.5, 1.0, 1.736, 1.0, 2.0, 0.5, 2.0, 0.5,
      ],
      [
        0, 0.5, 0.15, 0, 0.8999, 0, 1.65, 0, 1.8, 0.5, 1.8, 0.5, 1.8, 0.5, 1.8,
        1.0, 1.9, 1.0, 2.0, 1.0, 2.0, 0.5, 2.0, 0.5,
      ],
      [0, 0.5, 0.5, 0, 1.0, 0.5, 1.5, 1.0, 2.0, 0.5],
      [0, 0.5, 0.5, 0, 1.0, 0, 1.0, 0, 2.0, 0.5],
      [0, 0.5, 1.0, 0.5, 2.0, 0.5],
      [0, 0, 0.5, 0, 1.0, 0.5, 1.5, 0, 2.0, 0],
    ],
    [
      [
        0, 0, 0.5, 1, 1, 0, 1.5, 1, 2, 0, 2.5, 1, 3, 0, 3.5, 1, 4, 0,
      ],
      [
        0, 0, 1.0, 0, 2.0, 0, 2.9999, 1, 3.9999, 0, 5.0, 1, 6.0, 0,
      ],
      [0, 0, 1.0, 1, 2.0, 0, 3.0, 1, 4.0, 0],
      [0, 0, 1.0, 0, 2.0, 1, 3.0, 0, 4.0, 1, 5.0, 0, 6.0, 1, 7.0, 0, 8.0, 1],
      [0, 0, 1.0, 1, 2.0, 0, 3.0, 1, 4.0, 1, 5.0, 0, 6.0, 1, 7.0, 0, 8.0, 1],
    ],
  ];
  // Validate control values with bounds checking
  const shp = con[2] && con[2].l !== undefined ? Math.min(con[2].l, 127) : 0;
  let s = [];
  const d1 = dp[0];
  // Clamp waveIdx to valid range [0, dp[1].length - 1]
  let waveIdx = con[1] && con[1].l !== undefined ? con[1].l : 0;
  waveIdx = Math.min(Math.max(waveIdx, 0), dp[1].length - 1);
  // Clamp shapeIdx to valid range [0, dp[2].length - 1]
  let shapeIdx = con[3] && con[3].l !== undefined ? con[3].l : 0;
  shapeIdx = Math.min(Math.max(shapeIdx, 0), dp[2].length - 1);
  const d2 = waveIdx < dp[1].length && Array.isArray(dp[1][waveIdx]) ? dp[1][waveIdx] : dp[1][0];
  const d3 = shapeIdx < dp[2].length && Array.isArray(dp[2][shapeIdx]) ? dp[2][shapeIdx] : dp[2][0];
  s.push(fvf(d1[0], d1[1]));
  s.push(fvf(d1[0], d1[1], d1[2], getstr2));
  s[1].x = 1;
  const len = d2.length;
  let i = 0;
  while (i < len) {
    const a = d2.slice(i, i + 2);
    i += 2;
    const b = d2.slice(i, i + 2);
    i += 2;
    s = s.concat(interpol(fvf(a[0] + 1, a[1]), fvf(b[0] + 1, b[1]), shp));
  }
  if (d3.length) {
    s.push(fvf(s[s.length - 1].x + 0.5, 0.5));
    s = s.concat(interpol(fvf(0, 0.5), fvf(1, 0.5), shp));
    const len = d3.length;
    let i = 0;
    while (i < len) {
      const a = d3.slice(i, i + 2);
      i += 2;
      const b = d3.slice(i, i + 2);
      i += 2;
      s = s.concat(interpol(fvf(a[0] + 1, a[1]), fvf(b[0] + 1, b[1]), shp));
    }
  }
  const d = [];
  s.forEach(function (v) {
    if (v && typeof v.x === 'number' && typeof v.y === 'number') {
      d.push(fvf(v.x / 8, v.y));
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
  g.svg.firstChild.setAttributeNS(null, 'd', path);
}

class envsegment {
  constructor(t, l) {
    this.l = l * (1 / 128);
    this.t = t * (1 / 128);
  }

  lin(i, en) {
    const emt = (en.tacc += this.t);
    return 'L' + emt * en.thi.xs + ',' + (this.l * en.thi.ys + en.thi.yo);
  }

  exp(i, en) {
    const emt1 = en.tacc + this.t * 0.16;
    const emt2 = (en.tacc += this.t);
    const y = this.l * en.thi.ys + en.thi.yo;
    return 'Q' + emt1 * en.thi.xs + ',' + y + ' ' + emt2 * en.thi.xs + ',' + y;
  }

  log(i, en) {
    const pli = en[(i || en.length) - 1].l * en.thi.ys + en.thi.yo;
    const emt1 = en.tacc + this.t * 0.8;
    const emt2 = (en.tacc += this.t);
    const y = this.l * en.thi.ys + en.thi.yo;
    return 'Q' + emt1 * en.thi.xs + ',' + pli + ' ' + emt2 * en.thi.xs + ',' + y;
  }

  sseg(i, en) {
    const emt = (en.tacc += en.thi.sustime);
    return 'L' + emt * en.thi.xs + ',' + (this.l * en.thi.ys + en.thi.yo);
  }

  initial(l, en) {
    l = en[en.length - 1].l;
    return 'M0,' + (l * en.thi.ys + en.thi.yo);
  }
}

function envGetd(en, segs) {
  if (!en || !en[0] || !segs) return '';
  en.tacc = 0;
  let d = en[0].initial(1, en);
  en.forEach(function (seg, i) {
    if (segs[i] && seg[segs[i]]) {
      d += seg[segs[i]](i, en);
    }
    if (seg.sustain && seg['sseg']) {
      d += seg['sseg'](i, en);
    }
  });
  return d;
}

function adrGraph(g, con) {
  if (!con || !con[1] || !con[3] || !g || !g.svg) return;
  const en = [new envsegment(con[1].l, 0), new envsegment(con[3].l, 127)];
  if (con[7] && con[7].l) en[0].sustain = true;
  en.thi = con[5] && con[5].l & 1 ? { ys: -22, xs: 15, yo: 22 } : { ys: 22, xs: 15, yo: 0 };
  const shapes = [
    ['exp', 'exp'],
    ['lin', 'exp'],
    ['log', 'exp'],
    ['lin', 'lin'],
  ];
  const sm = shapes[con[0] && con[0].l !== undefined ? con[0].l : 0] || shapes[0];
  en.thi.sustime =
    2 -
    en.reduce(function (a, b) {
      b.en = en;
      return b.sustain ? a : a + b.t;
    }, 0);
  const d = envGetd(en, sm);
  const path = g.svg.firstChild;
  if (path) path.setAttributeNS(null, 'd', d);
}

function adsrGraph(g, con) {
  if (!con || !con[1] || !con[2] || !con[3] || !con[4] || !g || !g.svg) return;
  const en = [
    new envsegment(con[1].l, 0),
    new envsegment(con[2].l, 127 - (con[3] && con[3].l !== undefined ? con[3].l : 0)),
    new envsegment(con[4].l, 127),
  ];
  en[1].sustain = true;
  en.thi = con[5] && con[5].l & 1 ? { ys: -28, xs: 15, yo: 28 } : { ys: 28, xs: 15, yo: 0 };
  const shapes = [
    ['exp', 'exp', 'exp'],
    ['lin', 'exp', 'exp'],
    ['log', 'exp', 'exp'],
    ['lin', 'lin', 'lin'],
  ];
  const sm = shapes[con[0] && con[0].l !== undefined ? con[0].l : 0] || shapes[0];
  en.thi.sustime =
    3 -
    en.reduce(function (a, b) {
      b.en = en;
      return b.sustain ? a : a + b.t;
    }, 0);
  const d = envGetd(en, sm);
  const path = g.svg.firstChild;
  if (path) path.setAttributeNS(null, 'd', d);
}

function addsrGraph(g, con) {
  if (!con || !con[2] || !con[3] || !con[4] || !con[5] || !con[6] || !con[7] || !g || !g.svg) return;
  const en = [
    new envsegment(con[2].l, 0),
    new envsegment(con[3].l, 127 - (con[4] && con[4].l !== undefined ? con[4].l : 0)),
    new envsegment(con[5].l, 127 - (con[6] && con[6].l !== undefined ? con[6].l : 0)),
    new envsegment(con[7].l, 127),
  ];
  const sustainIndex = con[8] && con[8].l ? 2 : 1;
  en[sustainIndex].sustain = true;
  en.thi = con[9] && con[9].l & 1 ? { ys: -28, xs: 15, yo: 28 } : { ys: 28, xs: 15, yo: 0 };
  const shapes = [
    ['exp', 'exp', 'exp', 'exp'],
    ['lin', 'exp', 'exp', 'exp'],
    ['log', 'exp', 'exp', 'exp'],
    ['lin', 'lin', 'lin', 'lin'],
  ];
  const sm = shapes[con[1] && con[1].l !== undefined ? con[1].l : 0] || shapes[0];
  en.thi.sustime =
    4 -
    en.reduce(function (a, b) {
      b.en = en;
      return b.sustain ? a : a + b.t;
    }, 0);
  const d = envGetd(en, sm);
  const path = g.svg.firstChild;
  if (path) path.setAttributeNS(null, 'd', d);
}

function multiEnvGraph(g, con) {
  if (!con || !con[4] || !con[5] || !con[6] || !con[7] || !g || !g.svg) return;
  const en = [
    new envsegment(con[4].l, 127 - (con[0] && con[0].l !== undefined ? con[0].l : 0)),
    new envsegment(con[5].l, 127 - (con[1] && con[1].l !== undefined ? con[1].l : 0)),
    new envsegment(con[6].l, 127 - (con[2] && con[2].l !== undefined ? con[2].l : 0)),
    new envsegment(con[7].l, 127 - (con[3] && con[3].l !== undefined ? con[3].l : 0)),
  ];
  if (con[9] && con[9].l < 3) en[con[9].l].sustain = true;
  en.thi = con[10] && con[10].l & 1 ? { ys: -28, xs: 15, yo: 28 } : { ys: 28, xs: 15, yo: 0 };
  const shapes = [
    ['exp', 'exp', 'exp', 'exp'],
    ['lin', 'exp', 'exp', 'exp'],
    ['log', 'exp', 'exp', 'exp'],
    ['lin', 'lin', 'lin', 'lin'],
  ];
  const sm = shapes[con[12] && con[12].l !== undefined ? con[12].l : 0] || shapes[0];
  en.thi.sustime =
    4.5 -
    en.reduce(function (a, b) {
      b.en = en;
      return b.sustain ? a : a + b.t;
    }, 0);
  const d = envGetd(en, sm);
  const path = g.svg.firstChild;
  if (path) path.setAttributeNS(null, 'd', d);
}

function adsrMGraph(g, con) {
  if (!con || !con[0] || !con[1] || !con[2] || !con[3] || !g || !g.svg) return;
  const en = [
    new envsegment(con[0].l, 0),
    new envsegment(con[1].l, 127 - (con[2] && con[2].l !== undefined ? con[2].l : 0)),
    new envsegment(con[3].l, 127),
  ];
  en[1].sustain = true;
  en.thi = con[8] && con[8].l & 1 ? { ys: -28, xs: 15, yo: 28 } : { ys: 28, xs: 15, yo: 0 };
  const sm = ['exp', 'exp', 'exp'];
  en.thi.sustime =
    3 -
    en.reduce(function (a, b) {
      b.en = en;
      return b.sustain ? a : a + b.t;
    }, 0);
  const d = envGetd(en, sm);
  const path = g.svg.firstChild;
  if (path) path.setAttributeNS(null, 'd', d);
}

function denvGraph(g, con) {
  if (!con || !con[0] || !g || !g.svg) return;
  const en = [new envsegment(0, 0), new envsegment(con[0].l, 127)];
  en.thi = con[1] && con[1].l & 1 ? { ys: -22, xs: 31, yo: 22 } : { ys: 22, xs: 31, yo: 0 };
  const sm = ['lin', 'exp'];
  en.reduce(function (a, b) {
    b.en = en;
    return b.sustain ? a : a + b.t;
  }, 0);
  const d = envGetd(en, sm);
  const path = g.svg.firstChild;
  if (path) path.setAttributeNS(null, 'd', d);
}

function henvGraph(g, con) {
  if (!con || !con[0] || !g || !g.svg) return;
  const en = [
    new envsegment(0, 0),
    new envsegment(con[0].l, 0),
    new envsegment(0, 127),
    new envsegment(200, 127),
  ];
  en.thi = con[1] && con[1].l & 1 ? { ys: -22, xs: 31, yo: 22 } : { ys: 22, xs: 31, yo: 0 };
  const sm = ['lin', 'lin', 'lin', 'lin'];
  en.reduce(function (a, b) {
    b.en = en;
    return b.sustain ? a : a + b.t;
  }, 0);
  const d = envGetd(en, sm);
  const path = g.svg.firstChild;
  if (path) path.setAttributeNS(null, 'd', d);
}

function ahdGraph(g, con) {
  if (!con || !con[1] || !con[2] || !con[4] || !g || !g.svg) return;
  const en = [
    new envsegment(con[1].l, 0),
    new envsegment(con[2].l, 0),
    new envsegment(con[4].l, 127),
  ];
  en.thi = con[5] && con[5].l & 1 ? { ys: -28, xs: 20, yo: 28 } : { ys: 28, xs: 20, yo: 0 };
  en.tacc = 0;
  const shapes = [
    ['exp', 'lin', 'exp'],
    ['lin', 'lin', 'exp'],
    ['log', 'lin', 'exp'],
    ['lin', 'lin', 'lin'],
  ];
  const sm = shapes[con[0] && con[0].l !== undefined ? con[0].l : 0] || shapes[0];
  en.reduce(function (a, b) {
    b.en = en;
    return b.sustain ? a : a + b.t;
  }, 0);
  const d = envGetd(en, sm);
  const path = g.svg.firstChild;
  if (path) path.setAttributeNS(null, 'd', d);
}

function ahdMGraph(g, con) {
  if (!con || !con[0] || !con[1] || !con[2] || !g || !g.svg) return;
  const en = [
    new envsegment(con[0].l, 0),
    new envsegment(con[1].l, 0),
    new envsegment(con[2].l, 127),
  ];
  en.thi = con[6] && con[6].l & 1 ? { ys: -28, xs: 20, yo: 28 } : { ys: 28, xs: 20, yo: 0 };
  en.tacc = 0;
  const sm = ['exp', 'lin', 'exp'];
  en.reduce(function (a, b) {
    b.en = en;
    return b.sustain ? a : a + b.t;
  }, 0);
  const d = envGetd(en, sm);
  const path = g.svg.firstChild;
  if (path) path.setAttributeNS(null, 'd', d);
}

function dxrouterGraph(g, con) {
  const ala = [];
  const alb = [];
  ala[0] = [
    { x: 46, y: 51 },
    { x: 46, y: 35 },
    { x: 78, y: 51 },
    { x: 78, y: 35 },
    { x: 78, y: 19 },
    { x: 78, y: 3 },
  ];
  alb[0] = {
    i: 0,
    d: 'm 54.8,46 0,19.01 33,0 0,-64.3184 12,0 0,15.7984 -12,0',
  };
  alb[1] = {
    i: 0,
    d: 'm 55,48.51 11.51,0 0,-16.02 -11.61,0 -0.1,32.52 33,0 0,-51.01',
  };
  ala[1] = [
    { x: 46, y: 51 },
    { x: 46, y: 35 },
    { x: 46, y: 19 },
    { x: 78, y: 51 },
    { x: 78, y: 35 },
    { x: 78, y: 19 },
  ];
  alb[2] = {
    i: 1,
    d: 'm 54.8,30 0,34.91 33,0 0,-48.32 11.08,0 0,15.8 -11.08,0',
  };
  alb[3] = {
    i: 1,
    d: 'm 54.8,30 0,34.91 33,0 0,-48.32 11.08,0 0,46.9 -11.08,-0.12',
  };
  ala[2] = [
    { x: 28, y: 51 },
    { x: 28, y: 35 },
    { x: 60, y: 51 },
    { x: 60, y: 35 },
    { x: 92, y: 51 },
    { x: 92, y: 35 },
  ];
  alb[4] = {
    i: 2,
    d: 'm 36.41,45.93 0,19.01 64.99,0 0,-32.32 11.5,0 0,15.8 -11.5,0 M 68.74,46 0,19',
  };
  alb[5] = {
    i: 2,
    d: 'm 36.4,46 0,18.93 64.99,0 0,-32.32 11.5,0 0,46.93 -11.5,0 M 68.73,46 0,19',
  };
  ala[3] = [
    { x: 28, y: 51 },
    { x: 28, y: 35 },
    { x: 28, y: 19 },
    { x: 60, y: 51 },
    { x: 60, y: 35 },
    { x: 92, y: 51 },
    { x: 92, y: 35 },
  ];
  alb[6] = {
    i: 3,
    d: 'm 36.41,29.93 0,34.93 64.99,0 0,-48.32 11.5,0 0,15.8 -11.5,0 M 68.74,34 0,31',
  };
  alb[7] = {
    i: 3,
    d: 'm 36.4,30 0,34.93 64.99,0 0,-48.32 11.5,0 0,46.93 -11.5,0 M 68.73,34 0,31',
  };
  ala[4] = [
    { x: 46, y: 51 },
    { x: 46, y: 35 },
    { x: 78, y: 51 },
    { x: 78, y: 35 },
    { x: 78, y: 19 },
    { x: 78, y: 3 },
  ];
  alb[8] = {
    i: 4,
    d: 'm 55.3,46 0,18.93 33,0 0,-32.32 11.08,0 0,15.8 -11.08,0 M 68.73,46 0,19',
  };
  alb[9] = {
    i: 4,
    d: 'm 55.3,46 0,18.93 33,0 0,-32.32 11.08,0 0,46.93 -11.08,0 M 68.73,46 0,19',
  };
  ala[5] = [
    { x: 46, y: 51 },
    { x: 46, y: 35 },
    { x: 46, y: 19 },
    { x: 78, y: 51 },
    { x: 78, y: 35 },
    { x: 78, y: 19 },
  ];
  alb[10] = {
    i: 5,
    d: 'm 55.3,30 0,34.93 33,0 0,-48.32 11.08,0 0,15.8 -11.08,0 M 68.73,34 0,31',
  };
  alb[11] = {
    i: 5,
    d: 'm 55.3,30 0,34.93 33,0 0,-48.32 11.08,0 0,46.93 -11.08,0 M 68.73,34 0,31',
  };
  ala[6] = [
    { x: 72, y: 51 },
    { x: 72, y: 35 },
    { x: 43, y: 19 },
    { x: 72, y: 19 },
  ];
  alb[12] = {
    i: 6,
    d: 'm 59.7,30.28 11.87,4.55 m -20.24,11.09 0,19 29,0 0,-34.92 m 0.16,2.41 11.6,0.1 -0.1,-16.47 -11.6,0 0,2.79',
  };
  alb[13] = {
    i: 6,
    d: 'm 59.7,30.28 11.87,4.55 m -20.24,11.09 0,19 29,0 0,-34.92 m 0.16,2.41 11.6,0.1 -0.1,-16.47 -11.6,0 0,2.79',
  };
  alb[14] = {
    i: 6,
    d: 'm 59.7,30.28 11.87,4.55 m -20.24,11.09 0,19 29,0 0,-34.92 m -28.82,18.53 -11.6,0.1 0.1,-15.99 11.6,0 0,2.79',
  };
  ala[7] = [
    { x: 54, y: 51 },
    { x: 26, y: 35 },
    { x: 55, y: 35 },
    { x: 55, y: 19 },
    { x: 83, y: 35 },
    { x: 83, y: 19 },
  ];
  alb[15] = {
    i: 7,
    d: 'M 82.83,46.1 71.68,50.78 M 43.2,46.1 54.35,50.78 m 37.35,-18.31 11.6,0.1 -0.1,-16.47 -11.62,0 0,2.6 m -28.24,11.68 0,34.63 m 28.4,-18.82 0,-16.19',
  };
  alb[16] = {
    i: 7,
    d: 'M 82.83,46.1 71.68,50.78 M 43.2,46.1 54.35,50.78 m 37.39,-4.66 0,-16.19 m -28.4,0.38 0,34.63 m -16.88,-17.59 -0.1,-15.27 -11.62,0 0,2.6',
  };
  ala[8] = [
    { x: 54, y: 51 },
    { x: 26, y: 35 },
    { x: 55, y: 35 },
    { x: 83, y: 35 },
    { x: 83, y: 19 },
    { x: 83, y: 3 },
  ];
  alb[17] = {
    i: 8,
    d: 'm 63.34,34.87 0,30.07 M 82.83,46.1 71.68,50.78 M 43.2,46.1 54.35,50.78 m 0.1,0 17.21,0 0,11.3 -17.21,0 z m 37.3,-15.87 0,-20.75 m -28.43,34.5 8.01,0 3.69,-1.84 -0.1,-14.71 -11.62,0 0,2.6',
  };
  ala[9] = [
    { x: 28, y: 51 },
    { x: 28, y: 35 },
    { x: 28, y: 19 },
    { x: 60, y: 51 },
    { x: 93, y: 51 },
    { x: 60, y: 35 },
  ];
  alb[18] = {
    i: 9,
    d: 'm 69.11,34.57 0,-3.13 12.64,0 0,15.99 m -4.43,-1.39 15.16,4.74 m -56.07,-21.97 0,36.13 64.99,0 0,-3.67 M 68.68,46 0,19',
  };
  ala[10] = [
    { x: 11, y: 51 },
    { x: 44, y: 51 },
    { x: 11, y: 35 },
    { x: 108, y: 51 },
    { x: 108, y: 35 },
    { x: 76, y: 35 },
  ];
  alb[19] = {
    i: 10,
    d: 'm 93.4,46.04 14.9,4.74 m -87.91,-16.21 0,-3.13 12.64,0 0,15.99 M 28.6,46.04 43.76,50.78 M 20.41,46 0,18.94 96.69,0 0,-18.94 m -64.42,14 0,5',
  };
  ala[11] = [
    { x: 11, y: 51 },
    { x: 44, y: 51 },
    { x: 11, y: 35 },
    { x: 76, y: 51 },
    { x: 108, y: 51 },
    { x: 76, y: 35 },
  ];
  alb[20] = {
    i: 11,
    d: 'M 93.4,46.04 108.3,50.78 M 28.6,46.04 43.76,50.78 M 20.39,34.57 20.39,31.44 33.03,31.44 33.03,47.43 M 20.41,46 20.41,64.94 117.1,64.94 117.1,62 M 52.68,62 52.68,65 M 84.75,46 84.75,65',
  };
  ala[12] = [
    { x: 11, y: 51 },
    { x: 11, y: 35 },
    { x: 76, y: 51 },
    { x: 76, y: 35 },
    { x: 108, y: 51 },
    { x: 108, y: 35 },
  ];
  alb[21] = {
    i: 12,
    d: 'M 93.4,46.04 108.3,50.78 M 28.39,34.57 28.39,31.44 41.03,31.44 41.03,47.43 M 93.4,46.04 93.4,64.94 117.1,64.94 117.1,45.86 M 52.68,46 52.68,64.87 M 20.41,61.95 20.41,64.94 117.1,64.94 117.1,61.82 M 68.75,46 68.75,65',
  };
  alb[22] = {
    i: 12,
    d: 'M 93.4,46.04 108.3,50.78 M 28.39,34.57 28.39,31.44 41.03,31.44 41.03,47.43 M 93.4,46.04 93.4,64.94 117.1,64.94 117.1,45.86 M 52.68,46 52.68,64.87 M 20.41,61.95 20.41,64.94 117.1,64.94 117.1,61.82 M 68.75,46 68.75,65',
  };
  ala[13] = [
    { x: 11, y: 51 },
    { x: 44, y: 51 },
    { x: 44, y: 35 },
    { x: 108, y: 51 },
    { x: 108, y: 35 },
    { x: 76, y: 35 },
  ];
  alb[23] = {
    i: 13,
    d: 'M 93.4,46.04 108.3,50.78 M 61.59,34.57 61.59,31.44 74.23,31.44 74.23,47.43 M 20.39,61.95 20.39,64.94 117.1,64.94 117.1,61.82 M 68.73,61.95 68.73,64.94 117.1,64.94 117.1,45.86 M 28.41,46.04 43.77,50.78 M 28.6,46 0,18.94 96.69,0 0,-18.94 m -64.42,14 0,5',
  };
  alb[24] = {
    i: 14,
    d: 'M 39.04,62 39.04,65 M 90.5,46.04 77.83,50.78 M 107.9,46.04 120.3,50.78 M 99.01,34.95 99.01,31.82 111.8,31.82 111.8,47.56 M 9.542,61.67 9.542,64.94 129.1,64.94 129.1,62 M 69.04,62 69.04,65 M 98.75,46 98.75,65',
  };
  alb[25] = {
    i: 15,
    d: 'M 39.04,62 39.04,65 M 107.9,46.04 120.3,50.78 M 99.01,34.95 99.01,31.82 111.8,31.82 111.8,47.56 M 9.542,61.67 9.542,64.94 129.1,64.94 129.1,62 M 69.04,62 69.04,65 M 98.75,46 98.75,65',
  };
  ala[15] = [
    { x: 11, y: 51 },
    { x: 44, y: 51 },
    { x: 44, y: 35 },
    { x: 108, y: 51 },
    { x: 76, y: 35 },
    { x: 108, y: 35 },
  ];
  alb[26] = {
    i: 15,
    d: 'M 93.4,46.04 108.3,50.78 M 117.1,34.38 117.1,31.56 129.6,31.56 129.6,48.22 117.1,48.22 M 20.41,61.95 20.41,64.94 117.1,64.94 117.1,45.86 M 52.68,46 52.68,64.87',
  };
  alb[27] = {
    i: 15,
    d: 'M 93.4,46.04 108.3,50.78 M 52.69,34.38 52.69,31.56 65.19,31.56 65.19,48.22 52.69,48.22 M 20.41,61.95 20.41,64.94 117.1,64.94 117.1,45.86 M 52.68,46 52.68,64.87',
  };
  ala[16] = [
    { x: 28, y: 51 },
    { x: 28, y: 35 },
    { x: 60, y: 51 },
    { x: 60, y: 35 },
    { x: 60, y: 19 },
    { x: 92, y: 51 },
  ];
  alb[28] = {
    i: 16,
    d: 'M 69.11,18.57 69.11,15.44 81.75,15.44 81.75,32.47 68.62,32.47 M 36.41,45.96 36.41,64.94 101.4,64.94 101.4,61.27 M 68.68,29.52 68.68,65',
  };
  ala[17] = [
    { x: 11, y: 51 },
    { x: 44, y: 51 },
    { x: 76, y: 51 },
    { x: 76, y: 35 },
    { x: 108, y: 51 },
    { x: 108, y: 35 },
  ];
  alb[29] = {
    i: 17,
    d: 'M 117.1,34.38 117.1,31.25 129.9,31.25 129.9,48.13 117.1,48.13 M 20.41,61.95 20.41,64.94 117.1,64.94 117.1,45.72 M 52.68,62.18 52.68,64.87 M 84.75,46 84.75,65',
  };
  ala[18] = [
    { x: 11, y: 51 },
    { x: 44, y: 51 },
    { x: 76, y: 51 },
    { x: 76, y: 35 },
    { x: 76, y: 19 },
    { x: 108, y: 51 },
    { x: 108, y: 35 },
  ];
  alb[30] = {
    i: 18,
    d: 'M 93.39,34.57 93.39,31.44 106.03,31.44 106.03,47.43 M 36.39,34.57 36.39,31.44 49.03,31.44 49.03,47.43 M 36.41,61.95 36.41,64.94 117.1,64.94 117.1,61.82 M 84.75,46 84.75,65 M 68.73,61.95 68.73,64.94 117.1,64.94 117.1,45.86 M 20.39,61.95 20.39,64.94 117.1,64.94 117.1,61.82 M 52.66,62 52.66,65',
  };
  ala[19] = [
    { x: 11, y: 51 },
    { x: 44, y: 51 },
    { x: 76, y: 51 },
    { x: 76, y: 35 },
    { x: 76, y: 19 },
    { x: 108, y: 51 },
    { x: 108, y: 35 },
  ];
  alb[31] = {
    i: 19,
    d: 'M 93.39,34.57 93.39,31.44 106.03,31.44 106.03,47.43 M 20.39,34.57 20.39,31.44 33.03,31.44 33.03,47.43 M 36.41,61.95 36.41,64.94 117.1,64.94 117.1,61.82 M 84.75,46 84.75,65 M 68.73,61.95 68.73,64.94 117.1,64.94 117.1,45.86 M 20.39,61.95 20.39,64.94 117.1,64.94 117.1,61.82 M 52.66,62 52.66,65',
  };
  ala[20] = [
    { x: 1, y: 51 },
    { x: 25, y: 51 },
    { x: 49, y: 51 },
    { x: 73, y: 51 },
    { x: 97, y: 51 },
    { x: 121, y: 51 },
  ];
  alb[32] = {
    i: 20,
    d: 'M 33.06,62 33.06,65 M 129.4,50.92 129.4,47.79 116.9,47.79 116.9,63.67 129.1,63.67 M 80.82,61.54 80.82,65 M 57.08,62 57.08,65 M 9.542,61.67 9.542,64.94 129.1,64.94 129.1,61.82 M 105.5,62 105.5,65',
  };
  alb[33] = {
    i: 20,
    d: 'M 33.06,62 33.06,65 M 129.4,50.92 129.4,47.79 116.9,47.79 116.9,63.67 129.1,63.67 M 80.82,61.54 80.82,65 M 57.08,62 57.08,65 M 9.542,61.67 9.542,64.94 129.1,64.94 129.1,61.82 M 105.5,62 105.5,65',
  };

  const al = alb[con[0].l || 0];
  if (!al) return;
  g.svg.appendChild(
    svgNSGet('path', { fill: 'none', stroke: 'white', d: al.d }),
  );
  ala[al.i].forEach(function (i, ix) {
    const s = svgNSGet('svg', { x: i.x, y: i.y });
    const r = svgNSGet('rect', { height: 11, width: 18, fill: 'white' });
    const t = svgNSGet('text', {
      x: 6.5,
      y: 9,
      fill: '#088',
      textContent: ix + 1,
    });
    s.appendChild(r);
    s.appendChild(t);
    g.svg.appendChild(s);
  });
}

const graphFunctions = {
  adsrGraph,
  adrGraph,
  addsrGraph,
  multiEnvGraph,
  adsrMGraph,
  denvGraph,
  henvGraph,
  ahdGraph,
  ahdMGraph,
  dxrouterGraph,
  lfoBgraph,
  lfoShpgraph,
  oscShpgraph,
  oscShpBgraph,
};

export function removeAllModules(svgElement) {
  const toRemove = [];
  let sibling = svgElement.firstElementChild;
  while (sibling) {
    const next = sibling.nextElementSibling;
    if (sibling.tagName === 'g' && sibling.classList.contains('module')) {
      toRemove.push(sibling);
    }
    sibling = next;
  }
  toRemove.forEach((mod) => svgElement.removeChild(mod));
}

export class Patchcord {
  constructor(sx, sy, dx, dy) {
    this.points = [4];
    this.points[3] = new FastVector(sx, sy);
    this.points[0] = new FastVector(dx, dy);
  }

  shake() {
    const angle1 = (Math.random() - 0.5) * 2;
    const strength1 = Math.random() * 0.38;
    const angle2 = (Math.random() - 0.5) * 2;
    const strength2 = Math.random() * 0.38;
    const dir1 = this.points[0].subtract(this.points[3]).rotate(angle1);
    const dir2 = this.points[0].subtract(this.points[3]).rotate(angle2);
    this.points[1] = this.points[0].subtract(dir1.multiply(strength1));
    this.points[2] = this.points[3].add(dir2.multiply(strength2));
  }

  getCurvePath() {
    this.shake();
    return (
      this.points[0].toString('M') +
      this.points[1].toString('C') +
      this.points[2].toString(',') +
      this.points[3].toString(',')
    );
  }
}

class FastVector {
  constructor(x, y, x2) {
    this.x = x;
    this.y = y;
    this.x2 = x2;
  }

  add(B) {
    if (typeof B === 'number') {
      return new FastVector(this.x + B, this.y + B);
    }
    return new FastVector(this.x + B.x, this.y + B.y);
  }

  subtract(B) {
    if (typeof B === 'number') {
      return new FastVector(this.x - B, this.y - B);
    }
    return new FastVector(this.x - B.x, this.y - B.y);
  }

  multiply(B) {
    if (typeof B === 'number') {
      return new FastVector(this.x * B, this.y * B);
    }
    return new FastVector(this.x * B.x, this.y * B.y);
  }

  rotate(angle) {
    const sa = Math.sin(angle);
    const ca = Math.cos(angle);
    return new FastVector(
      ca * this.x - sa * this.y,
      sa * this.x + ca * this.y,
    );
  }

  getstr(p, xs, ys, yo) {
    return p + this.x * xs + ',' + (this.y * ys + yo);
  }

  toString(pre = '') {
    return `${pre}${this.x} ${this.y}`;
  }
}

export function makePatchCables(modules, cables, svgElement) {
  cables.forEach((cable) => {
    const sourceModule = cable.sourceModule ?? cable.smod;
    const destModule = cable.destModule ?? cable.dmod;
    const sourceJack = cable.sourceJack ?? cable.scon;
    const destJack = cable.destJack ?? cable.dcon;
    const dir = cable.dir ?? 1;

    const smod = modules.find((m) => m.index == sourceModule);
    const dmod = modules.find((m) => m.index == destModule);

    if (!smod || !dmod) {
      console.warn(`Cable skipped: module not found (source=${sourceModule}, dest=${destModule})`);
      return;
    }

    // Look up module definitions to get inputs/outputs
    const smodDef = window.modules?.getById(smod.type);
    const dmodDef = window.modules?.getById(dmod.type);

    if (!smodDef || !dmodDef) {
      console.warn(`Cable skipped: module definition not found (source=${smod.type}, dest=${dmod.type})`);
      return;
    }

    // dir: 1 = output->input, 0 = input->input
    // Note: dcon (destination) is ALWAYS an input jack
    const scon = dir === 1 ? smodDef.outputs?.[sourceJack] : smodDef.inputs?.[sourceJack];
    const dcon = dmodDef.inputs?.[destJack];

    if (!scon || !dcon) {
      console.warn(`Cable skipped: jack not found (dir=${dir}, sourceJack=${sourceJack}, destJack=${destJack}, smod=${smod.type}, dmod=${dmod.type})`);
      return;
    }

    const sx = scon.x + smod.horiz * 256;
    const sy = scon.y + smod.vert * 16;
    const dx = dcon.x + dmod.horiz * 256;
    const dy = dcon.y + dmod.vert * 16;

    const pc = new Patchcord(sx, sy, dx, dy);
    const d = pc.getCurvePath();
    const color = CABLE_COLORS[cable.colour] || CABLE_COLORS[0];

    // Create 2-layer cable: border -> main
    const border = svgNSGet('path', {
      stroke: color,
      fill: 'none',
      d: d,
      class: 'svgcableborder nomouse',
    });
    const main = svgNSGet('path', {
      stroke: color,
      fill: 'none',
      d: d,
      class: 'svgcable nomouse',
    });
    svgElement.appendChild(border);
    svgElement.appendChild(main);
  });
}

export function removeAllCables(svgElement) {
  const toRemove = [];
  let sibling = svgElement.firstElementChild;
  while (sibling) {
    if (sibling.tagName === 'path' && (
      sibling.classList.contains('svgcable') ||
      sibling.classList.contains('svgcableborder')
    )) {
      toRemove.push(sibling);
    }
    sibling = sibling.nextElementSibling;
  }
  toRemove.forEach((cable) => svgElement.removeChild(cable));
}

export function buildPatchPanel(modules, cables, svgElement, defs, paramMap) {
  clearTemplateCache();
  removeAllModules(svgElement);
  removeAllCables(svgElement);

  modules.forEach((m) => {
    addModuleTemplate(m, defs, paramMap);
  });

  if (cables && cables.length > 0) {
    makePatchCables(modules, cables, svgElement);
  }
}

export function createSVGTemplateDefs() {
  const defs = document.createElementNS(XMLNS, 'defs');

  defs.innerHTML = `
    <filter id="f3" x="-20%" y="-20%" width="200%" height="200%">
      <feOffset result="offOut" in="SourceAlpha" dx="1" dy="1"></feOffset>
      <feGaussianBlur result="blurOut" in="offOut" stdDeviation="2"></feGaussianBlur>
      <feBlend in="SourceGraphic" in2="blurOut" mode="normal"></feBlend>
    </filter>
    <filter id="fc">
      <feGaussianBlur stdDeviation="0.6"></feGaussianBlur>
    </filter>
    <filter id="f4" x="-10%" y="-10%" width="150%" height="150%">
      <feOffset result="offOut" in="SourceAlpha" dx="0.5" dy="0.5"></feOffset>
      <feGaussianBlur result="blurOut" in="offOut" stdDeviation="1"></feGaussianBlur>
      <feBlend in="SourceGraphic" in2="blurOut" mode="normal"></feBlend>
    </filter>

    <linearGradient id="g116" gradientUnits="objectBoundingBox">
      <stop style="stop-color:rgb(16,16,16);stop-opacity:1" offset="0"></stop>
      <stop style="stop-color:rgb(127,127,127);stop-opacity:0.75" offset="0.2"></stop>
      <stop style="stop-color:rgb(190,190,190);stop-opacity:0" offset="1"></stop>
    </linearGradient>
    <linearGradient id="g117" gradientUnits="objectBoundingBox">
      <stop style="stop-color:rgb(190,190,190);stop-opacity:0" offset="0"></stop>
      <stop style="stop-color:rgb(210,210,210);stop-opacity:0.15" offset="0.7"></stop>
      <stop style="stop-color:rgb(255,255,255);stop-opacity:1" offset="1"></stop>
    </linearGradient>
    <linearGradient id="g118" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop style="stop-color:rgb(255,255,255);stop-opacity:1" offset="0"></stop>
      <stop style="stop-color:rgb(190,190,190);stop-opacity:0.15" offset="0.3"></stop>
      <stop style="stop-color:rgb(190,190,190);stop-opacity:0" offset="1"></stop>
    </linearGradient>
    <linearGradient id="g119" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop style="stop-color:rgb(190,190,190);stop-opacity:0" offset="0"></stop>
      <stop style="stop-color:rgb(127,127,127);stop-opacity:0.25" offset="0.8"></stop>
      <stop style="stop-color:rgb(16,16,16);stop-opacity:0.75" offset="1"></stop>
    </linearGradient>
    <radialGradient id="g120" gradientUnits="objectBoundingBox" cx="50%" cy="50%" r="70%">
      <stop stop-color="#FFF" offset="0"></stop>
      <stop stop-color="#FFF" offset="0.5"></stop>
      <stop stop-color="#000" offset="1"></stop>
    </radialGradient>
    <linearGradient id="g121" gradientUnits="objectBoundingBox" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop stop-color="#333" offset="0"></stop>
      <stop stop-color="#CCC" offset="0.5"></stop>
      <stop stop-color="#222" offset="1"></stop>
    </linearGradient>

    <path id="em-logo" stroke="none" fill-rule="evenodd" fill="#255293" d="m 424,40.03 -7.6,0 3.3,-14.38 c 0.5,-2.67 0.9,-4.45 0.9,-5.47 0,-2.29 -1.4,-3.31 -3.7,-3.31 -1.4,0 -3.6,0.76 -6.7,2.42 0,0.89 -0.1,1.91 -0.3,3.05 l -4.2,17.69 -7.7,0 3.4,-14.25 c 0.4,-2.68 0.9,-4.58 0.9,-5.48 0,-2.29 -1.3,-3.43 -3.8,-3.43 -1.5,0 -3.6,0.76 -6.4,2.29 l -4.8,20.87 -7.6,0 6.6,-28.62 7.6,0 -0.9,4.07 c 3,-2.16 5,-3.43 6.4,-4.07 1.3,-0.52 2.7,-0.77 3.9,-0.77 3.6,0 5.9,1.79 6.8,5.47 4.6,-3.68 8.6,-5.47 11.6,-5.47 2.2,0 3.8,0.64 5.1,2.04 1.1,1.4 1.8,3.18 1.8,5.72 0,1.14 -0.1,2.54 -0.6,4.07 z m -59,0.89 c -4.2,0 -7.4,-1.02 -9.7,-3.06 -2.3,-2.03 -3.4,-4.96 -3.4,-8.65 0,-5.34 1.5,-9.8 4.7,-13.35 3,-3.56 7,-5.35 12,-5.35 4.3,0 7.5,1.02 9.7,3.19 2.3,2.03 3.5,4.82 3.5,8.52 0,5.47 -1.8,9.92 -4.7,13.49 -3.1,3.43 -7.2,5.21 -12.1,5.21 z m 3.4,-25.19 c -2.6,0 -4.5,1.27 -6.2,4.07 -1.5,2.67 -2.4,5.98 -2.4,9.92 0,4.07 1.9,6.11 5.4,6.11 2.5,0 4.6,-1.4 6.1,-4.08 1.7,-2.66 2.5,-5.97 2.5,-9.92 0,-4.07 -1.8,-6.1 -5.4,-6.1 z m -13.2,-2.29 -1.6,6.61 -0.3,0 c -1.6,-1.78 -3,-2.8 -4.1,-3.3 -1.3,-0.52 -2.4,-0.77 -3.8,-0.77 -2.8,0 -5.1,1.14 -7.1,3.56 -1.8,2.42 -2.6,5.48 -2.6,9.03 0,2.17 0.6,3.95 1.8,5.1 1.3,1.27 3,1.9 5.3,1.9 2.4,0 5.2,-1.14 8.4,-3.43 l 0.4,0 -1.5,6.87 c -3.2,1.14 -6.1,1.78 -8.3,1.78 -4.5,0 -7.9,-1.01 -10.3,-3.18 -2.5,-2.04 -3.9,-5.09 -3.9,-8.77 0,-5.48 1.7,-9.8 5.2,-13.11 3.3,-3.43 7.6,-5.09 12.7,-5.09 3.4,0 6.6,0.89 9.7,2.8 z m -30.1,17.55 -2.1,9.04 -8.6,0 2.2,-9.04 z m -7.2,-17.55 -1.3,6.61 -0.4,0 c -1.7,-1.78 -2.9,-2.8 -4.2,-3.3 -1.1,-0.52 -2.4,-0.77 -3.6,-0.77 -3,0 -5.3,1.14 -7.1,3.56 -1.7,2.42 -2.6,5.48 -2.6,9.03 0,2.17 0.6,3.95 1.7,5.1 1.4,1.27 3,1.9 5.2,1.9 2.4,0 5.3,-1.14 8.5,-3.43 l 0.3,0 -1.5,6.87 c -3.2,1.14 -5.9,1.78 -8.3,1.78 -4.3,0 -7.7,-1.01 -10.3,-3.18 -2.6,-2.04 -3.8,-5.09 -3.8,-8.77 0,-5.48 1.7,-9.8 5.1,-13.11 3.3,-3.43 7.6,-5.09 12.8,-5.09 3.4,0 6.7,0.89 9.5,2.8 z m -22.1,-12.475 -1.5,6.749 -8.3,0 1.7,-6.749 z m -2.6,10.445 -6.6,28.62 -7.6,0 6.6,-28.62 z m -23.7,-10.445 -1.7,6.749 -8.3,0 1.7,-6.749 z m -2.6,10.445 -6.6,28.62 -7.7,0 6.6,-28.62 z m -31.1,17.69 4.1,-17.69 c 0.2,-1.14 0.3,-2.16 0.3,-3.05 3.1,-1.66 5.3,-2.42 6.7,-2.42 2.3,0 3.7,1.02 3.7,3.31 0,1.02 -0.4,2.8 -0.9,5.47 l -3.3,14.38 7.6,0 -6.6,28.62 -7.6,0 6.6,-28.62 7.6,0 -4.2,-17.69 z"/>

    <path id="BitmapHVCA" stroke="#222" fill="none" d="M0,6 L5,6 M21,6 L16,6 5,11.5 5,0 16,6"></path>
    <path id="BitmapVVCA" stroke="#222" fill="none" d="M6,0 L6,5 M6,21 L6,16 11.5,5 0,5 6,16"></path>
    <path id="BitmapADD" stroke="#222" fill="none" d="M6,6 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0 M0,6l6,0 M8,6l6,0 M11,3l0,6 M9,-2l2,2 2,-2"></path>
    <path id="BitmapWSAW" stroke="#222" fill="none" d="M0,9 L0,2 13,8.5"></path>
    <path id="BitmapWSQR1" stroke="#222" fill="none" d="M0,5.5 L0,2 7,2 7,8.5 13,8.5 13,5.5"></path>
    <path id="BitmapWSQR2" stroke="#222" fill="none" d="M2,5.5 L2,2 9,2 9,8.5 15,8.5 15,5.5"></path>
    <path id="BitmapINV" stroke="#222" fill="none" d="M3,12 L13,7 3,2 3,12 M15.5,7 m-2,0 a2,2 0 1,1 4,0 a2,2 0 1,1 -4,0"></path>
    <path id="BitmapSW12" stroke="#222" fill="none" d="M0,12 l8,0 a1.2,1.2 0 1,1 4,0 a2,2 0 1,1 -4,0 m2.5,-1.5 l3,-6 0,-4.5 M15,12 a1.2,1.2 0 1,1 4,0 a2,2 0 1,1 -4,0 m4,0 l4,0"></path>
    <path id="BitmapSH" stroke="#222" fill="none" d="M0,12 l6,0 10,-6 M12,0 l0,7 M15,12 a1.2,1.2 0 1,1 4,0 a2,2 0 1,1 -4,0 m4,0 l4,0 m0,5 l10,0 0,-10 -10,0 z m2,-1.5 l0,-7 3,3 3,-3 0,7"></path>
    <path id="BitmapSWcon" stroke="#222" fill="none" d="M0,12 l6,0 10,-6 M15,12 a1.2,1.2 0 1,1 4,0 a2,2 0 1,1 -4,0 m4,0 l7,0"></path>
    <path id="BitmapSWMcon" stroke="#222" fill="none" d="M2,0 l0,10.5 M0,2 l2,-2 2,2 M0,8 l2,2 2,-2"></path>
    <path id="BitmapLMOD" stroke="#222" fill="none" d="M0,24 l6,0 M21,24 l-5,0 -10,6 0,-12 10,6 M0,3 l6,0 m0,-2 l9,0 0,4 -9,0 0,-4 m9,2 l4,0 0,10 -8,0 0,8"></path>
    <path id="BitmapRect" stroke="#222" fill="none" d="M 69.91,5.54 C 69.91,10.1 77.08,10.1 77.08,5.54 77.06,10.1 84.05,10.1 84.05,5.54 M 48,5.54 C 48,0.9948 55.18,0.9948 55.18,5.54 55.16,0.9948 62.15,0.9948 62.15,5.54 M 26.55,5.438 C 26.55,9.994 33.74,9.994 33.74,5.438 L 40.7,5.438 M 4.265,5.54 C 4.265,0.9948 11.45,0.9948 11.45,5.54 L 18.41,5.54"></path>
    <path id="BitmapShpStatic" stroke="#222" fill="none" d="M 71.47,9.272 C 71.37,5.202 74.69,5.202 77.6,5.202 80.51,5.202 83.73,5.022 83.63,1.302 M 49.03,9.252 C 49.43,6.432 52.34,4.972 55.15,5.062 57.96,5.162 60.17,4.432 61.17,1.062 M 26.16,9.012 C 29.82,9.012 31.03,7.312 32.75,5.212 34.44,2.812 36.13,1.912 39.13,1.912 M 3.93,8.672 C 7.604,8.672 10.76,8.762 10.54,5.232 10.83,2.162 13.93,2.252 16.94,2.252"></path>
    <path id="BitmapLfoAWave" stroke="#222" fill="none" d="M 4.397,5.477 C 5.543,1.851 6.833,0.4288 8.544,5.477 10.12,9.915 11.11,10.3 12.48,5.477 M 21.67,8.971 25.39,1.829 29.27,9.026 M 40.11,9.038 40.11,1.967 47.51,9.297 M 55.1,5.452 55.1,2.017 59.35,2.017 59.35,9.214 63.76,9.214 63.76,5.67 M 72.03,7.421 72.03,6.13 74.16,6.13 74.16,2.178 76.36,2.178 76.36,6.612 78.5,6.612 78.5,4.376 80.62,4.376 80.62,8.25 81.94,8.25 M 88.85,7.113 C 89.95,0.3546 91.59,1.612 93.14,6.94 93.8,9.293 94.79,7.959 95.15,6.94 95.84,4.574 96.6,4.411 98.59,9.33"></path>
    <path id="BitmapLfoBWave" stroke="#222" fill="none" d="M 55.1,5.452 55.1,2.017 59.35,2.017 59.35,9.214 63.76,9.214 63.76,5.67 M 40.11,9.038 40.11,1.967 47.51,9.297 M 21.67,8.971 25.39,1.829 29.27,9.026 M 4.397,5.477 C 5.543,1.851 6.833,0.4288 8.544,5.477 10.12,9.915 11.11,10.3 12.48,5.477"></path>
    <path id="BitmapLfoShpAWave" stroke="#222" fill="none" d="M 4.271,5.919 C 4.124,2.442 5.788,-0.3886 8.607,5.919 11.43,12.23 12.88,8.532 12.99,6.929 M 18.76,8.587 C 19.52,8.597 20.03,7.926 20.11,7.483 21.37,0.4059 22.21,0.4087 23.61,7.483 23.75,8.196 24.51,8.674 25.23,8.587 L 31.04,8.587 C 31.86,8.45 32.12,7.742 32.45,7.483 M 70.33,8.97 72.48,2.277 80.62,2.277 82.77,8.969 M 54.81,8.97 57.08,2.14 64.07,8.811 M 36.43,8.401 38.95,2.467 42.17,8.401 47.92,8.401 M 89.47,8.918 89.47,2.351 92.22,2.351 92.22,8.672 98.19,8.672 98.19,2.06"></path>
    <path id="BitmapOscAWave" stroke="#222" fill="none" d="M 88.65,9.308 88.65,2.019 90.59,2.019 90.59,8.813 100.5,8.813 M 71.04,9.326 71.04,2.019 74.62,2.019 74.62,8.813 82.8,8.813 M 53.27,6.146 53.27,2.486 59.5,2.486 59.5,8.656 65.42,8.656 65.42,5.211 M 36.37,9.357 36.37,2.953 48.05,9.123 M 19.39,8.578 25.58,2.759 31.81,8.617 M 2.23,5.581 C 4.229,1.593 6.461,0.2852 8.489,5.581 10.52,10.88 12.78,9.373 14.75,5.581"></path>
    <path id="BitmapOscShpAWave" stroke="#222" fill="none" d="M 87.43,5.777 90.56,5.777 90.56,1.978 93.46,1.978 93.46,8.755 96.44,8.755 96.44,5.702 99.42,5.702 M 36.27,5.925 C 38.28,5.008 39.72,5.669 42.62,2.255 L 42.62,8.681 C 44.98,5.515 46.34,5.957 48.34,5.456 M 19.46,5.581 C 21.46,1.593 25.4,0.2852 27.43,5.581 29.53,9.689 30.01,9.373 31.98,5.581 M 53.27,6.146 53.27,2.486 C 55.55,4.798 57.62,4.742 59.5,2.486 L 59.5,8.432 C 61.95,6.285 63.76,7.04 65.42,8.432 L 65.42,5.211 M 70.36,8.354 73.53,2.76 82.78,8.394 M 2.23,5.581 C 3.753,0.7916 5.379,1.32 8.489,5.581 11.6,9.842 13.14,8.699 14.75,5.581"></path>
    <path id="BitmapOscBWave" stroke="#222" fill="none" d="M 70.5,8.979 70.5,2.127 76.1,6.781 76.1,3.021 82.86,8.681 M 2.23,5.581 C 4.229,1.593 6.461,0.2852 8.489,5.581 10.52,10.88 12.78,9.373 14.75,5.581 M 19.39,8.578 25.58,2.759 31.81,8.617 M 36.37,9.357 36.37,2.953 48.05,9.123 M 53.27,6.146 53.27,2.486 59.5,2.486 59.5,8.656 65.42,8.656 65.42,5.211"></path>
    <path id="Bitmapff1" stroke="none" fill="#222" fill-rule="evenodd" d="m 17.900389,11.195313 0,0.804687 4,0 0,-0.804687 z m 1.930115,1.455081 c -1.000223,0 -2.003357,0.838615 -2.003357,2.515844 0,2.643071 2.02099,3.411706 3.191395,2.306191 l 0.698846,0.698846 0.256243,-0.465897 -0.652256,-0.628961 c 0.304171,-0.459578 0.512487,-1.086904 0.512487,-1.910179 0,-1.677229 -1.003135,-2.515844 -2.003358,-2.515844 z m 1.456436,2.554548 c 0,2.889217 -2.90996,2.889217 -2.90996,0 0,-2.600295 2.90996,-2.600295 2.90996,0 z M 19.65625,1.96875 c -1.341797,0 -2.6875,1.125 -2.6875,3.375 0,3.5456734 2.711154,4.5767961 4.28125,3.09375 l 0.9375,0.9375 0.34375,-0.625 -0.875,-0.84375 c 0.408045,-0.6165227 0.6875,-1.4580792 0.6875,-2.5625 0,-2.25 -1.345703,-3.375 -2.6875,-3.375 z m 1.953806,3.4269206 c 0,3.8758781 -3.903706,3.8758781 -3.903706,0 0,-3.488291 3.903706,-3.488291 3.903706,0 z M 8.78125,2.8300781 l 0,5.2421875 1.709543,0 C 13,7 13,4 10.490793,2.8300781 z M 8,2 8,9 10.609375,9 C 14,8 14,3 10.609375,2 z M 6,1 24,1 24,19 6,19 6,17.817383 9.0253906,15.462891 6,13.208008 z m -6,4 5,0 0,-5 20,0 0,5 11,0 0,1 -11,0 0,9 11,0 0,1 -11,0 0,4 -20,0 0,-4 -5,0 0,-1 5,0 0,-9 -5,0 z"></path>
    <path id="Bitmapff2" stroke="none" fill="#222" fill-rule="evenodd" d="M 7.768,7.08 8.701,7.07 C 8.768,7.49 9.052,7.83 9.434,8.02 10.15,8.39 11.06,8.4 11.78,8.05 12.26,7.79 12.55,7.13 12.21,6.66 11.77,6.04 10.94,6.01 10.27,5.82 9.48,5.64 8.547,5.38 8.171,4.59 7.788,3.74 8.218,2.61 9.119,2.3 10.06,1.88 11.21,1.95 12.11,2.45 12.63,2.78 12.99,3.07 13,3.69 L 12.04,3.7 C 11.81,3.15 11.23,2.81 10.64,2.84 10.03,2.78 9.267,2.91 8.966,3.52 8.75,4.01 9.087,4.6 9.598,4.71 10.6,5.06 11.75,5.07 12.62,5.75 13.55,6.48 13.34,8.1 12.33,8.66 11.38,9.27 10.13,9.24 9.102,8.84 8.325,8.48 7.754,7.95 7.768,7.08 z M 17.9,11.2 17.9,12 21.9,12 21.9,11.2 z M 19.83,12.65 C 18.83,12.65 17.83,13.49 17.83,15.17 17.83,17.81 19.85,18.58 21.02,17.47 L 21.72,18.17 21.97,17.71 21.32,17.08 C 21.63,16.62 21.83,15.99 21.83,15.17 21.83,13.49 20.83,12.65 19.83,12.65 z M 21.29,15.2 C 21.29,18.09 18.38,18.09 18.38,15.2 18.38,12.6 21.29,12.6 21.29,15.2 z M 19.66,1.97 C 18.31,1.97 16.97,3.09 16.97,5.34 16.97,8.89 19.68,9.92 21.25,8.44 L 22.19,9.38 22.53,8.75 21.66,7.91 C 22.06,7.29 22.34,6.45 22.34,5.34 22.34,3.09 21,1.97 19.66,1.97 z M 21.61,5.4 C 21.61,9.27 17.71,9.27 17.71,5.4 17.71,1.91 21.61,1.91 21.61,5.4 z M 6,1 24,1 24,19 6,19 6,17.82 9.025,15.46 6,13.21 z M 0,5 5,5 5,0 25,0 25,5 36,5 36,6 25,6 25,15 36,15 36,16 25,16 25,20 5,20 5,16 0,16 0,15 5,15 5,6 0,6 z"></path>
    <path id="Bitmappwr" stroke="#222" fill="none" d="M 7.022,2.097 C 9.036,2.656 10.23,4.813 9.696,6.913 9.16,9.013 7.093,10.26 5.079,9.702 3.066,9.142 1.869,6.986 2.405,4.886 2.757,3.511 3.793,2.44 5.115,2.087 M0.5,0.5 l11,0 0,11 -11,0z m 5.551,1.192 0,4.167 0,0"></path>
    <path id="Bitmapsharp" stroke="none" fill="#222" d="M2,2 l0,7.5 6,0 0,-7.5z"></path>
    <path id="Bitmapbox" stroke="#222" fill="#none" d="M0,6 l5,0 M16,6 l5,0 M5,0.5l11,0 0,10.5 -11,0z"></path>
    <path id="BitmapCurve" stroke="#222" fill="#088" d="M 10,31.72 2,39.72 18,39.72 z M 10,21.72 C 8,27.72 6,29 2,29.72 L 18,29.72 C 14,29 12,27.72 10,21.72 z M 10,11.72 2,19.72 18,19.72 C 14,19 11,17.72 10,11.72 z M 10,1.66 C 5.63,2.66 2.015,4.66 2,9.66 L 18,9.66 C 14,9 11,7.66 10,1.66 z"></path>
    <path id="BitmapSeqLp" stroke="none" fill="#222" fill-rule="evenodd" d="m 13.01,14.14 0,1.32 -11.666,0 0,0.75 11.666,0 0,1.19 3.22,-1.29 0,2 0.7,0 0,-4.65 -0.72,0 0,2 z M 7.484,1.656 l 0,1.219 -4,0 c -2.818,0 -2.818,5.25 0,5.25 l 11.466,0 c 2.82,0 2.82,-5.25 0,-5.25 l -4.41,0 z m -3.5,1.859 3.5,0 0,1.204 3.156,-1.204 3.81,0 c 2.57,0 2.57,3.978 0,3.978 l -10.466,0 c -2.575,0 -2.575,-3.978 0,-3.978 z"></path>
    <path id="BitmapOutputMode" stroke="none" fill="#000" d="m 7,66 -3,-3 2.219,0 0,-2 1.562,0 0,2 2.219,0 z m 0,-15.98 -3,3 2.219,0 0,2 1.562,0 0,-2 2.219,0 z m 0,-12.04 -3,-3 2.219,0 0,-2 1.562,0 0,2 2.219,0 z M 7,22 l -3,3 2.219,0 0,2 1.562,0 0,-2 2.219,0 z m 0,0 -3,-3 2.219,0 0,-2 1.562,0 0,2 2.219,0 -3,3 z m -0.781,-6 0,-5.03 1.562,0 0,5.03 -1.562,0 z M 7,0 4,3 l 2.219,0 0,2 1.562,0 0,-2 L 10,3 7,0 z m -0.781,6 0,5.03 1.562,0 0,-5.03 -1.562,0 z"></path>

    <path id="ModeLfoC" stroke="#222" fill="none" d="M 3.402,130.7 3.402,138.8 C 3.649,140.9 7.995,140.8 8.259,138.8 L 8.259,131.9 C 8.203,130.2 10.22,130.3 10.29,131.9 L 10.29,138.8 C 10.33,140.8 14.01,140.8 14.18,138.8 L 14.18,131.9 C 14.61,130.2 18.29,130.2 18.59,131.9 L 18.59,140 M 3.429,112.7 3.429,122.7 8.269,122.7 8.269,113 10.29,113 10.29,122.7 14.17,122.7 14.17,113 18.56,113 18.56,123.2 M 4.486,100.3 C 6.04,90.79 8.358,92.57 10.55,100.1 11.48,103.4 12.88,101.5 13.39,100.1 14.37,96.75 15.44,96.53 18.25,103.5 M 4.423,83.99 4.423,82.13 7.498,82.13 7.498,76.42 10.67,76.42 10.67,82.82 13.76,82.82 13.76,79.59 16.82,79.59 16.82,85.19 18.73,85.19 M 5.331,62.83 5.331,58.03 11.26,58.03 11.26,68.07 17.4,68.07 17.4,63.13 M 6.025,50.53 6.025,39.71 17.33,50.92 M 5.352,32.92 11.16,21.76 17.23,32.99 M 4.381,8.594 C 6.331,2.712 8.443,0.4046 11.2,8.594 13.8,15.81 15.43,16.44 17.54,8.594"></path>
    <path id="ModeWave2" stroke="#222" fill="none" d="M 11.94,93.31 C 14.01,93.39 14.05,98.22 11.85,98.12 9.76,98.25 9.65,93.44 11.94,93.31 z M 7.714,94.47 8.43,93.83 8.43,98.48 M 2.733,99.3 2.733,93.38 5.06,93.38 5.06,105.5 19,105.5 19,99.12 M 18.89,75.34 15.93,75.34 15.93,76.95 17.28,76.95 C 19.49,77.19 19.42,79.42 17.28,79.78 L 15.47,79.78 M 10.63,76.31 C 11.99,74.28 14.69,75.76 13.43,77.21 L 11.08,79.79 14.23,79.79 M 2.733,81.35 2.733,75.38 7.547,75.38 7.547,87.48 19,87.48 19,81.12 M 2.733,62.96 2.733,56.99 11.06,56.99 11.06,69.09 19,69.09 19,62.73 M 2.733,51.01 2.733,38.91 19.65,50.75 M 2.342,33.05 11.06,20.82 19.52,33.18 M 2.602,9.108 C 5.274,-0.6052 8.172,1.162 11.19,9.108 13.73,15.3 16.38,16.76 19.26,9.108"></path>
    <path id="ModeShpB" stroke="#222" fill="none" d="M 2.683,135.4 7.079,135.4 7.079,130 11.15,130 11.15,139.6 15.28,139.6 15.28,135.2 19.49,135.2 M 3.169,118.1 3.169,113.2 11.5,113.2 11.5,121.4 19.42,121.4 19.42,116.9 M 3.485,103.6 3.485,94.26 11.1,100.7 11.1,95.47 20.31,103.2 M 2.654,85.83 7.058,78.06 19.98,85.89 M 3.53,63.07 3.53,58.51 C 6.37,61.39 8.948,61.31 11.29,58.51 L 11.29,65.91 C 14.34,63.24 16.59,64.18 18.66,65.91 L 18.66,61.9 M 2.435,45.1 C 5.251,43.81 7.268,44.74 11.34,39.96 L 11.34,48.97 C 14.64,44.53 16.55,45.14 19.35,44.44 M 2.963,26.96 C 5.56,21.79 10.68,20.09 13.31,26.96 16.03,32.3 16.66,31.9 19.21,26.96 M 2.388,9.258 C 4.452,2.754 6.666,3.472 10.9,9.258 15.12,15.04 17.22,13.49 19.4,9.258"></path>
    <path id="ModeFF" stroke="none" fill="#222" fill-rule="evenodd" d="M 7.768,-17.8 8.701,-17.81 C 8.768,-17.39 9.052,-17.05 9.434,-16.86 10.15,-16.49 11.06,-16.48 11.78,-16.83 12.26,-17.09 12.55,-17.75 12.21,-18.22 11.77,-18.84 10.94,-18.87 10.27,-19.06 9.48,-19.24 8.547,-19.5 8.171,-20.29 7.788,-21.14 8.218,-22.27 9.119,-22.58 10.06,-23 11.21,-22.93 12.11,-22.43 12.63,-22.1 12.99,-21.81 13,-21.19 L 12.04,-21.18 C 11.81,-21.73 11.23,-22.07 10.64,-22.04 10.03,-22.1 9.267,-21.97 8.966,-21.36 8.75,-20.87 9.087,-20.28 9.598,-20.17 10.6,-19.82 11.75,-19.81 12.62,-19.13 13.55,-18.4 13.34,-16.78 12.33,-16.22 11.38,-15.61 10.13,-15.64 9.102,-16.04 8.325,-16.4 7.754,-16.93 7.768,-17.8 z M 17.9,-13.68 17.9,-12.88 21.9,-12.88 21.9,-13.68 z M 19.83,-12.23 C 18.83,-12.23 17.83,-11.39 17.83,-9.709 17.83,-7.069 19.85,-6.299 21.02,-7.409 L 21.72,-6.709 21.97,-7.169 21.32,-7.799 C 21.63,-8.259 21.83,-8.889 21.83,-9.709 21.83,-11.39 20.83,-12.23 19.83,-12.23 z M 21.29,-9.679 C 21.29,-6.789 18.38,-6.789 18.38,-9.679 18.38,-12.28 21.29,-12.28 21.29,-9.679 z M 19.66,-22.91 C 18.31,-22.91 16.97,-21.79 16.97,-19.54 16.97,-15.99 19.68,-14.96 21.25,-16.44 L 22.19,-15.5 22.53,-16.13 21.66,-16.97 C 22.06,-17.59 22.34,-18.43 22.34,-19.54 22.34,-21.79 21,-22.91 19.66,-22.91 z M 21.61,-19.48 C 21.61,-15.61 17.71,-15.61 17.71,-19.48 17.71,-22.97 21.61,-22.97 21.61,-19.48 z M 6,-23.88 24,-23.88 24,-5.879 6,-5.879 6,-7.059 9.025,-9.419 6,-11.67 z M 0,-19.88 5,-19.88 5,-24.88 25,-24.88 25,-19.88 36,-19.88 36,-18.88 25,-18.88 25,-9.879 36,-9.879 36,-8.879 25,-8.879 25,-4.879 5,-4.879 5,-8.879 0,-8.879 0,-9.879 5,-9.879 5,-18.88 0,-18.88 z M 17.92,11.32 17.92,12.12 21.92,12.12 21.92,11.32 z M 19.85,12.77 C 18.85,12.77 17.85,13.61 17.85,15.29 17.85,17.93 19.87,18.7 21.04,17.59 L 21.74,18.29 22,17.83 21.34,17.2 C 21.65,16.74 21.86,16.11 21.86,15.29 21.86,13.61 20.85,12.77 19.85,12.77 z M 21.31,15.33 C 21.31,18.21 18.4,18.21 18.4,15.33 18.4,12.72 21.31,12.72 21.31,15.33 z M 19.68,2.091 c -1.341797,0 -2.6875,1.125 -2.6875,3.375 0,3.5456734 2.711154,4.5767961 4.28125,3.09375 l 0.9375,0.9375 0.34375,-0.625 -0.875,-0.84375 c 0.408045,-0.6165227 0.6875,-1.4580792 0.6875,-2.5625 0,-2.25 -1.345703,-3.375 -2.6875,-3.375 z m 1.953806,3.4269206 c 0,3.8758781 -3.903706,3.8758781 -3.903706,0 0,-3.488291 3.903706,-3.488291 3.903706,0 z M 8.8125,2.951172 l 0,5.2421875 1.709543,0 C 13.03125,7 13.03125,4 10.522093,2.951172 z M 8.03125,2.121094 8.03125,9.050781 10.640625,9.050781 C 14.03125,8.050781 14.03125,3.050781 10.640625,2.121094 z M 6.03125,1.121094 24.03125,1.121094 24.03125,19.121094 6.03125,19.121094 6.03125,17.938477 9.0566406,15.583985 6.03125,13.329102 z m -6,4 5,0 0,-5 20,0 0,5 11,0 0,1 -11,0 0,9 11,0 0,1 -11,0 0,4 -20,0 0,-4 -5,0 0,-1 5,0 0,-9 -5,0 z"></path>
    <path id="ModeDelay" stroke="#222" fill="none" d="M0,61.52 7.47,61.52 7.47,54.41 15.79,54.41 15.79,61.43 20.2,61.43 M -0.089,51.52 3.47,51.52 3.47,44.41 11.62,44.41 11.62,51.43 20.2,51.43 M -0.089,40.62 3.559,40.62 3.559,33.51 18.06,33.51 18.06,40.53 20.2,40.53 M -0.089,30.62 3.47,30.62 3.47,23.51 11.62,23.51 11.62,30.53 20.2,30.53 M -0.089,19.25 9.47,19.25 9.47,12.14 18.06,12.14 18.06,19.16 20.2,19.16 M -0.089,9.254 3.47,9.254 3.47,2.136 18.06,2.136 18.06,9.165 20.2,9.165"></path>
    <path id="ModePulse" stroke="#222" fill="none" d="M -0.089,9.254 5.872,9.254 5.872,2.136 20.06,2.136 M -0.089,19.25 5.826,19.25 5.826,12.14 14.42,12.14 14.42,19.16 20.2,19.16 M 0.0892,23.51 5.887,23.51 5.887,30.53 20.2,30.53 M -0.089,40.62 5.826,40.62 5.826,33.51 14.42,33.51 14.42,40.53 20.2,40.53"></path>
    <path id="ModeGate" stroke="none" fill="#222" fill-rule="evenodd" d="M 22.97,118.9 22.97,111.9 26.07,111.9 C 26.69,111.9 27.17,112 27.49,112.1 27.81,112.2 28.07,112.4 28.27,112.7 28.46,113.1 28.56,113.4 28.56,113.8 28.56,114.3 28.4,114.7 28.08,115.1 27.76,115.4 27.26,115.6 26.59,115.7 26.83,115.8 27.02,115.9 27.15,116 27.42,116.3 27.67,116.6 27.91,117 L 29.13,118.9 27.97,118.9 27.04,117.4 C 26.77,117 26.55,116.7 26.37,116.5 26.2,116.2 26.04,116.1 25.9,116 25.77,115.9 25.63,115.8 25.48,115.8 25.38,115.8 25.21,115.8 24.97,115.8 L 23.89,115.8 23.89,118.9 z M 23.89,115 25.88,115 C 26.31,115 26.64,114.9 26.87,114.8 27.11,114.8 27.29,114.6 27.42,114.4 27.54,114.2 27.6,114 27.6,113.8 27.6,113.5 27.48,113.2 27.24,113 27,112.8 26.63,112.7 26.11,112.7 L 23.89,112.7 z M 15.08,115.5 C 15.08,114.3 15.39,113.4 16.01,112.8 16.64,112.1 17.44,111.8 18.43,111.8 19.07,111.8 19.65,111.9 20.17,112.2 20.69,112.5 21.09,113 21.36,113.5 21.63,114.1 21.77,114.7 21.77,115.4 21.77,116.1 21.62,116.7 21.34,117.3 21.05,117.9 20.65,118.3 20.12,118.6 19.6,118.9 19.03,119 18.42,119 17.76,119 17.18,118.8 16.66,118.5 16.14,118.2 15.75,117.8 15.48,117.2 15.21,116.7 15.08,116.1 15.08,115.5 z M 16.03,115.5 C 16.03,116.3 16.26,117 16.71,117.5 17.17,118 17.73,118.2 18.42,118.2 19.11,118.2 19.69,118 20.14,117.5 20.59,117 20.81,116.3 20.81,115.4 20.81,114.8 20.72,114.3 20.52,113.9 20.33,113.5 20.05,113.1 19.68,112.9 19.31,112.7 18.89,112.6 18.43,112.6 17.78,112.6 17.21,112.8 16.74,113.2 16.27,113.7 16.03,114.4 16.03,115.5 z M 8.292,118.9 8.292,111.9 9.241,111.9 12.91,117.4 12.91,111.9 13.8,111.9 13.8,118.9 12.85,118.9 9.179,113.4 9.179,118.9 z M 1.066,118.9 3.77,115.2 1.385,111.9 2.487,111.9 3.756,113.7 C 4.02,114.1 4.207,114.3 4.319,114.5 4.474,114.3 4.659,114 4.872,113.7 L 6.279,111.9 7.285,111.9 4.829,115.2 7.476,118.9 6.331,118.9 4.571,116.4 C 4.473,116.2 4.371,116.1 4.266,115.9 4.11,116.2 3.999,116.3 3.932,116.4 L 2.177,118.9 z M 19.44,97.64 C 19.44,95.31 19.44,92.97 19.44,90.64 20.7,90.64 21.95,90.64 23.21,90.64 23.21,92.97 23.21,95.31 23.21,97.64 21.95,97.64 20.7,97.64 19.44,97.64 z M 19.44,88.41 C 19.44,86.08 19.44,83.74 19.44,81.41 20.7,81.41 21.95,81.41 23.21,81.41 23.21,83.74 23.21,86.08 23.21,88.41 21.95,88.41 20.7,88.41 19.44,88.41 z M 19.44,79.15 C 19.44,76.82 19.44,74.48 19.44,72.15 20.7,72.15 21.95,72.15 23.21,72.15 23.21,74.48 23.21,76.82 23.21,79.15 21.95,79.15 20.7,79.15 19.44,79.15 z M 19.44,69.91 C 19.44,67.58 19.44,65.24 19.44,62.91 20.7,62.91 21.95,62.91 23.21,62.91 23.21,65.24 23.21,67.58 23.21,69.91 21.95,69.91 20.7,69.91 19.44,69.91 z M 19.44,60.68 C 19.44,58.35 19.44,56.01 19.44,53.68 20.7,53.68 21.95,53.68 23.21,53.68 23.21,56.01 23.21,58.35 23.21,60.68 21.95,60.68 20.7,60.68 19.44,60.68 z M 19.44,51.45 C 19.44,49.12 19.44,46.78 19.44,44.45 20.7,44.45 21.95,44.45 23.21,44.45 23.21,46.78 23.21,49.12 23.21,51.45 21.95,51.45 20.7,51.45 19.44,51.45 z M 19.44,42.22 C 19.44,39.89 19.44,37.55 19.44,35.22 20.7,35.22 21.95,35.22 23.21,35.22 23.21,37.55 23.21,39.89 23.21,42.22 21.95,42.22 20.7,42.22 19.44,42.22 z M 19.44,32.99 C 19.44,30.66 19.44,28.32 19.44,25.99 20.7,25.99 21.95,25.99 23.21,25.99 23.21,28.32 23.21,30.66 23.21,32.99 21.95,32.99 20.7,32.99 19.44,32.99 z M 19.44,23.76 C 19.44,21.43 19.44,19.09 19.44,16.76 20.7,16.76 21.95,16.76 23.21,16.76 23.21,19.09 23.21,21.43 23.21,23.76 21.95,23.76 20.7,23.76 19.44,23.76 z M 19.44,14.53 C 19.44,12.2 19.44,9.86 19.44,7.53 20.7,7.53 21.95,7.53 23.21,7.53 23.21,9.86 23.21,12.2 23.21,14.53 21.95,14.53 20.7,14.53 19.44,14.53 z M 19.44,5.29 C 19.44,2.96 19.44,0.62 19.44,-1.71 20.7,-1.71 21.95,-1.71 23.21,-1.71 23.21,0.62 23.21,2.96 23.21,5.29 21.95,5.29 20.7,5.29 19.44,5.29 z M 0.25,121.28 C 0.25,118.95 0.25,116.61 0.25,114.28 1.51,114.28 2.76,114.28 4.02,114.28 4.02,116.61 4.02,118.95 4.02,121.28 2.76,121.28 1.51,121.28 0.25,121.28 z M 0.25,112.05 C 0.25,109.72 0.25,107.38 0.25,105.05 1.51,105.05 2.76,105.05 4.02,105.05 4.02,107.38 4.02,109.72 4.02,112.05 2.76,112.05 1.51,112.05 0.25,112.05 z M 0.25,102.81 C 0.25,100.48 0.25,98.14 0.25,95.81 1.51,95.81 2.76,95.81 4.02,95.81 4.02,98.14 4.02,100.48 4.02,102.81 2.76,102.81 1.51,102.81 0.25,102.81 z M 0.25,93.58 C 0.25,91.25 0.25,88.91 0.25,86.58 1.51,86.58 2.76,86.58 4.02,86.58 4.02,88.91 4.02,91.25 4.02,93.58 2.76,93.58 1.51,93.58 0.25,93.58 z M 0.25,84.35 C 0.25,82.02 0.25,79.68 0.25,77.35 1.51,77.35 2.76,77.35 4.02,77.35 4.02,79.68 4.02,82.02 4.02,84.35 2.76,84.35 1.51,84.35 0.25,84.35 z M 0.25,75.12 C 0.25,72.79 0.25,70.45 0.25,68.12 1.51,68.12 2.76,68.12 4.02,68.12 4.02,70.45 4.02,72.79 4.02,75.12 2.76,75.12 1.51,75.12 0.25,75.12 z M 0.25,65.89 C 0.25,63.56 0.25,61.22 0.25,58.89 1.51,58.89 2.76,58.89 4.02,58.89 4.02,61.22 4.02,63.56 4.02,65.89 2.76,65.89 1.51,65.89 0.25,65.89 z M 0.25,56.65 C 0.25,54.32 0.25,51.98 0.25,49.65 1.51,49.65 2.76,49.65 4.02,49.65 4.02,51.98 4.02,54.32 4.02,56.65 2.76,56.65 1.51,56.65 0.25,56.65 z M 0.25,47.42 C 0.25,45.09 0.25,42.75 0.25,40.42 1.51,40.42 2.76,40.42 4.02,40.42 4.02,42.75 4.02,45.09 4.02,47.42 2.76,47.42 1.51,47.42 0.25,47.42 z M 0.25,38.19 C 0.25,35.86 0.25,33.52 0.25,31.19 1.51,31.19 2.76,31.19 4.02,31.19 4.02,33.52 4.02,35.86 4.02,38.19 2.76,38.19 1.51,38.19 0.25,38.19 z M 0.25,28.96 C 0.25,26.63 0.25,24.29 0.25,21.96 1.51,21.96 2.76,21.96 4.02,21.96 4.02,24.29 4.02,26.63 4.02,28.96 2.76,28.96 1.51,28.96 0.25,28.96 z M 0.25,19.72 C 0.25,17.39 0.25,15.05 0.25,12.72 1.51,12.72 2.76,12.72 4.02,12.72 4.02,15.05 4.02,17.39 4.02,19.72 2.76,19.72 1.51,19.72 0.25,19.72 z M 0.25,10.49 C 0.25,8.16 0.25,5.82 0.25,3.49 1.51,3.49 2.76,3.49 4.02,3.49 4.02,5.82 4.02,8.16 4.02,10.49 2.76,10.49 1.51,10.49 0.25,10.49 z M 0.25,1.26 C 0.25,-1.07 0.25,-3.41 0.25,-5.74 1.51,-5.74 2.76,-5.74 4.02,-5.74 4.02,-3.41 4.02,-1.07 4.02,1.26 2.76,1.26 1.51,1.26 0.25,1.26 z"/>

    <g id="check">
      <path stroke="#666" d="M0,0 l10,0 0,10 -10,0 0,-10"></path>
    </g>
    <g id="onoff">
      <path stroke="#222" d="M 7.022,2.097 C 9.036,2.656 10.23,4.813 9.696,6.913 9.16,9.013 7.093,10.26 5.079,9.702 3.066,9.142 1.869,6.986 2.405,4.886 2.757,3.511 3.793,2.44 5.115,2.087 M 0.5,0.5 l 11,0 0,11 -11,0z m 5.551,1.192 0,4.167 0,0"></path>
    </g>
    <g id="input">
      <circle r="5" cx="6" cy="5" stroke="#333"></circle>
      <circle r="3" cx="6" cy="5" fill="black"></circle>
    </g>
    <g id="output">
      <path stroke="#333" d="m1,0 l10,0 0,10 -10,0z"></path>
      <circle r="3" cx="6" cy="5" fill="black"></circle>
    </g>
    <g id="levelshift" stroke="#333">
      <rect stroke="#222" fill="#CCC" x="0" y="-0.5" width="14" height="12"></rect>
      <rect stroke="none" fill="#666" x="2.5" y="0" width="9" height="11"></rect>
    </g>
    <g id="KnobSlider" stroke="#333">
      <path stoke="#333" fill="#CCC" d="M0,0 l10,0 0,62 -10,0 0,-62 M0,46 l10,0 M0,54 l10,0"></path>
      <path stoke="none" fill="#333" d="M2.5,51 l5,0 -2.5,-3 z M2.5,57 l5,0 -2.5,3 z"></path>
    </g>
    <g id="KnobSpin" stroke="#333">
      <path stoke="#333" fill="#CCC" d="M0,0 l10,0 0,10 -10,0z M0,20 l10,0 0,-10 -10,0z"></path>
      <path stoke="none" fill="#333" d="M2.5,6.5 l5,0 -2.5,-3 z M2.5,14 l5,0 -2.5,3 z"></path>
    </g>
    <g id="KnobSpinH" stroke="#333">
      <path stoke="#333" fill="#CCC" d="M0,0 l10,0 0,10 -10,0z M10,10 l10,0 0,-10 -10,0z"></path>
      <path stoke="none" fill="#333" d="M6,2.5 l0,5 -2.5,-2.5 z M14,2.5 l0,5 2.5,-2.5 z"></path>
    </g>
    <g id="KnobSmall" stroke="#333">
      <line x1="0.5" y1="17.5" x2="2.5" y2="15.5"></line>
      <line x1="18.5" y1="17.5" x2="16.5" y2="15.5"></line>
      <circle r="9" cx="9.5" cy="9.5" fill="url(#g120)"></circle>
    </g>
    <g id="KnobMedium" stroke="#333">
      <line x1="1" y1="19" x2="3" y2="17"></line>
      <line x1="20" y1="19" x2="18" y2="17"></line>
      <circle r="10" cx="10.5" cy="10.5" fill="url(#g120)"></circle>
    </g>
    <g id="KnobReset" stroke="#333">
      <path fill="green" stroke="black" d="m7,2 l6,0 -3,4 z"></path>
      <line x1="1" y1="25" x2="3" y2="23"></line>
      <line x1="20" y1="25" x2="18" y2="23"></line>
      <circle r="10" cx="10.5" cy="16.5" fill="url(#g120)"></circle>
    </g>
    <g id="KnobBig" stroke="#333">
      <line x1="1" y1="21" x2="3" y2="19"></line>
      <line x1="22" y1="21" x2="20" y2="19"></line>
      <circle r="11" cx="11.5" cy="11.5" fill="url(#g120)"></circle>
    </g>
  `;

  return defs;
}

export function renderSingleModule(moduleDef, paramMap = {}, moduleColor = null) {
  // Create a module instance with default values for standalone rendering
  const pcnt = moduleDef.params?.length || 0;
  const moduleInstance = {
    type: moduleDef.id,
    horiz: 0,
    vert: 0,
    colour: moduleColor !== null ? moduleColor : (moduleDef.defaultColor || 0),
    uname: null,
    lv: pcnt > 0 ? Array(pcnt).fill(0).map((_, i) => {
      const paramType = moduleDef.params?.[i]?.type;
      const p = paramMap[paramType] || {};
      return p.def ?? 64;
    }) : [],
    modes: moduleDef.modes || [],
  };

  // Create standalone SVG container
  const h = moduleDef.height * 16;
  const svg = document.createElementNS(XMLNS, 'svg');
  svg.setAttributeNS(null, 'width', '256');
  svg.setAttributeNS(null, 'height', h.toString());
  svg.setAttributeNS(null, 'font-size', '9');
  svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', XLINK_NS);

  // Create defs with bitmap templates
  const defs = createSVGTemplateDefs();
  defs.id = 'module-defs-' + moduleDef.id;
  svg.appendChild(defs);

  // Use the same rendering path as addModuleTemplate for consistency
  const group = document.createElementNS(XMLNS, 'g');
  group.setAttribute('class', 'module');
  group.setAttribute('transform', 'translate(0,0)');

  // Create module template
  let template = createModuleTemplate(moduleDef, defs);
  const templateId = template.id;

  // Use template
  const fillColor = getModuleColor(moduleInstance.colour);
  const u = document.createElementNS(XMLNS, 'use');
  u.setAttributeNS(XLINK_NS, 'xlink:href', `#${templateId}`);
  u.setAttributeNS(null, 'fill', fillColor);
  u.setAttributeNS(null, 'color', fillColor);
  group.appendChild(u);

  // Add module name
  const textAttrs = {
    fill: '#000',
    x: 10,
    y: 10,
    'text-anchor': 'start',
    textContent: moduleDef.shortnm || 'Module',
  };
  group.appendChild(svgNSGet('text', textAttrs));

  // Setup controls with default values - same as patch rendering
  group.lv = moduleInstance.lv;
  group.modes = moduleInstance.modes;
  group.modid = moduleDef.id;
  group.moduleDef = moduleDef;

  setupModuleControls(group, moduleDef, paramMap);

  svg.appendChild(group);
  return svg;
}

export { CABLE_COLORS };
