import type { Page } from '@playwright/test';
import { PatchParser } from '../../src/parser/nmg2PatchParser';
import { makeCableKey } from '../../src/renderer/cableRenderer';
import { getModule } from '../../src/renderer/nmg2mods';
import type { Patch } from '../../src/types/patch';
import { sleep } from './cli';
import { type Area, cliRun, focusedSlot } from './actions/ctx';

/** What one area holds: modules as "idx:short", cables as makeCableKey, params as "idx modes=…" / "idx v<n>=…"; sorted. */
export interface AreaState {
	modules: string[];
	cables: string[];
	params: string[];
}

const NUM_VARIATIONS = 8;

/** A module's modes and per-variation param values as comparable lines. */
function paramLines(index: number, modes: number[], values: (v: number) => number[] | undefined): string[] {
	const out = [`${index} modes=${modes.join(',')}`];
	for (let v = 0; v < NUM_VARIATIONS; v++) out.push(`${index} v${v + 1}=${(values(v) ?? []).join(',')}`);
	return out;
}
export type SlotState = Record<Area, AreaState>;

const AREA_IDX: Record<Area, 0 | 1> = { fx: 0, va: 1 };

/** The device's view, from a `get-patch` reply. All cables: the editor keeps cables of a hidden colour in the DOM (CSS-hidden). */
export function deviceState(getPatchOutput: string): SlotState {
	const { name, data } = JSON.parse(getPatchOutput) as { name: string; data: string };
	const name8 = new TextEncoder().encode(name);
	const bytes = new Uint8Array(name8.length + 3 + data.length / 2);
	bytes.set(name8);
	bytes.set([0x00, 0x17, 0x00], name8.length);
	for (let i = 0; i < data.length / 2; i++) bytes[name8.length + 3 + i] = parseInt(data.slice(i * 2, i * 2 + 2), 16);
	const patch = new PatchParser(bytes.buffer).parse() as Patch;
	const state = (a: Area): AreaState => {
		const area = patch.areas[AREA_IDX[a]];
		return {
			modules: area.modules.map((m) => `${m.index}:${getModule(m.type)?.short ?? m.type}`).sort(),
			cables: area.cableList.map(makeCableKey).sort(),
			params: area.modules.flatMap((m) => paramLines(m.index, m.modes, (v) => m.lv.slice(v * m.pcnt, (v + 1) * m.pcnt))).sort(),
		};
	};
	return { va: state('va'), fx: state('fx') };
}

/** The editor's view: what its canvases render, plus the slot's modes and param values from its store. */
export async function renderedState(page: Page, slot: string): Promise<SlotState> {
	const raw = await page.evaluate((slot) => {
		const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia;
		const entry = pinia._s.get('slots').slots[slot];
		const state = (a: string, areaIdx: number, key: string) => {
			const canvas = document.querySelector(`[data-testid="canvas-${a}"]`);
			const modules = Array.from(canvas?.querySelectorAll('[data-module-idx]') ?? []).map((e) => `${e.getAttribute('data-module-idx')}:${e.getAttribute('data-module-short')}`);
			const cables = Array.from(canvas?.querySelectorAll('.svgcableborder[data-cable-key]') ?? []).map((e) => e.getAttribute('data-cable-key')!);
			const mods = (entry.patch?.areas[areaIdx].modules ?? []).map((m: any) => ({
				index: m.index as number,
				modes: [...m.modes] as number[],
				values: (entry.variations ?? []).map((vs: any) => (vs?.[key]?.[m.index] ? [...vs[key][m.index]] : undefined)) as (number[] | undefined)[],
			}));
			return { modules: [...new Set(modules)].sort(), cables: [...new Set(cables)].sort(), mods };
		};
		return { va: state('va', 1, 'voice'), fx: state('fx', 0, 'fx') };
	}, slot);
	const area = (a: Area): AreaState => ({
		modules: raw[a].modules,
		cables: raw[a].cables,
		params: raw[a].mods.flatMap((m: { index: number; modes: number[]; values: (number[] | undefined)[] }) => paramLines(m.index, m.modes, (v) => m.values[v])).sort(),
	});
	return { va: area('va'), fx: area('fx') };
}

/** A cable's two ends in a fixed order: an input-to-input cable may be stored either way round. */
const sameEnds = (key: string) => {
	const [sm, sc, dm, dc] = key.split('-');
	return [`${sm}-${sc}`, `${dm}-${dc}`].sort().join('-');
};

const few = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')} (+${xs.length - 4} more)` : xs.join(', '));

/** Differences as readable lines, empty when both agree. */
export function diffStates(editor: SlotState, device: SlotState): string[] {
	const out: string[] = [];
	for (const a of ['va', 'fx'] as const) {
		for (const k of ['modules', 'cables', 'params'] as const) {
			const norm = k === 'cables' ? sameEnds : (x: string) => x;
			const e = new Set(editor[a][k].map(norm));
			const d = new Set(device[a][k].map(norm));
			const onlyEditor = [...e].filter((x) => !d.has(x));
			const onlyDevice = [...d].filter((x) => !e.has(x));
			if (onlyEditor.length) out.push(`${a} ${k} only in editor: ${few(onlyEditor)}`);
			if (onlyDevice.length) out.push(`${a} ${k} only on G2: ${few(onlyDevice)}`);
		}
	}
	return out;
}

/**
 * Compares the focused slot as the editor shows it with the G2's own copy. A silently dropped or garbled
 * write passes every other check, so this is the only place it shows. A difference is re-checked once
 * after a pause: the editor can lag a reload that is still under way.
 */
export async function checkConsistency(page: Page): Promise<{ slot: string; diffs: string[] }> {
	const slot = await focusedSlot(page);
	let diffs: string[] = [];
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt) await sleep(3000);
		const device = deviceState(await cliRun(page, ['get-patch', slot]));
		diffs = diffStates(await renderedState(page, slot), device);
		if (diffs.length === 0 || (await focusedSlot(page)) !== slot) return { slot, diffs: [] };
	}
	return { slot, diffs };
}
