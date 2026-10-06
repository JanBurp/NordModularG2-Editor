import { sleep } from '../cli';
import { type ActionCtx, type ActionDef, type Area, type OwnModule, clickItem, focusOwn, hoverItem, int, liveOwn, openMenu, orSkip, pick, showArea } from './ctx';
import { hasOwn } from './modules';

const CABLE_COLORS = ['Red', 'Blue', 'Yellow', 'Orange', 'Green', 'Purple', 'White'];

interface OwnCable {
	key: string;
	area: Area;
	dmod: number;
	dcon: number;
}

type JackCounts = Record<number, { inputs: number; outputs: number }>;

/** Input/output jack counts per module index, read from the canvas: a module's type can change (replace, undo) behind the harness's back. */
const jackCounts = (c: ActionCtx, area: Area): Promise<JackCounts> =>
	c.page.evaluate((area) => {
		const out: JackCounts = {};
		for (const m of Array.from(document.querySelectorAll(`[data-testid="canvas-${area}"] [data-module-idx]`)))
			out[Number(m.getAttribute('data-module-idx'))] = {
				inputs: m.querySelectorAll('[data-jack^="input-"]').length,
				outputs: m.querySelectorAll('[data-jack^="output-"]').length,
			};
		return out;
	}, area);

const jackSel = (area: Area, idx: number, jack: string) => `[data-testid="canvas-${area}"] [data-module-idx="${idx}"] [data-jack="${jack}"]`;

/** Cables in the focused slot with at least one end on an own module. */
async function ownCables(c: ActionCtx): Promise<OwnCable[]> {
	const { mods } = await focusOwn(c);
	const out: OwnCable[] = [];
	for (const area of ['va', 'fx'] as const) {
		const idxs = mods.filter((m) => m.area === area).map((m) => m.idx);
		if (idxs.length === 0) continue;
		const found = await c.page.evaluate(
			({ area, idxs }) =>
				Array.from(document.querySelectorAll(`[data-testid="canvas-${area}"] .svgcableborder[data-cable-key]`))
					.filter((e) => idxs.includes(Number(e.getAttribute('data-smod'))) || idxs.includes(Number(e.getAttribute('data-dmod'))))
					.map((e) => ({ key: e.getAttribute('data-cable-key')!, dmod: Number(e.getAttribute('data-dmod')), dcon: Number(e.getAttribute('data-dcon')) })),
			{ area, idxs },
		);
		out.push(...found.map((f) => ({ ...f, area })));
	}
	return out;
}

const cableCount = (c: ActionCtx, area: Area) => c.page.locator(`[data-testid="canvas-${area}"] .svgcableborder[data-cable-key]`).count();

/** Same event sequence as e2e/helpers createCable, addressed by module index; also does input→input (nest). */
async function dragJack(c: ActionCtx, from: string, to: string): Promise<void> {
	await c.page.evaluate(
		({ from, to }) => {
			const src = document.querySelector(from);
			const dst = document.querySelector(to);
			if (!src || !dst) throw new Error(`jack not found: ${src ? to : from}`);
			src.dispatchEvent(new MouseEvent('mousedown', { bubbles: false, cancelable: true }));
			const r = dst.getBoundingClientRect();
			const x = r.left + r.width / 2;
			const y = r.top + r.height / 2;
			window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + 4, clientY: y + 4 }));
			window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
			window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
		},
		{ from, to },
	);
	await sleep(300);
}

/** A random own cable; when there is none yet, tries to make one first. */
async function pickCable(c: ActionCtx): Promise<OwnCable | null> {
	let cables = await ownCables(c);
	if (cables.length === 0) {
		await CABLE_ACTIONS[0].run(c);
		cables = await ownCables(c);
	}
	if (cables.length === 0) return null;
	const cable = pick(c, cables);
	await showArea(c, cable.area);
	return cable;
}

/** The destination jack of a cable (always an input). */
const cableJack = (c: ActionCtx, cable: OwnCable) => c.page.locator(jackSel(cable.area, cable.dmod, `input-${cable.dcon}`));

const jackMenu = (label: string): ActionDef['run'] => async (c) =>
	orSkip('jack menu', async () => {
		const cable = await pickCable(c);
		if (!cable) return 'skipped: no own cable';
		await openMenu(c.page, cableJack(c, cable));
		await clickItem(c.page, label);
		return `${label} on input ${cable.dcon} of #${cable.dmod}`;
	});

export const CABLE_ACTIONS: ActionDef[] = [
	{
		// Random own output → own input (cable colour follows the output), sometimes input → input (white nest).
		name: 'addCable',
		weight: 3,
		enabled: hasOwn,
		run: async (c) => {
			const { mods } = await focusOwn(c);
			if (mods.length === 0) return 'skipped: no own module';
			const area = pick(c, mods).area;
			await showArea(c, area);
			const jacks = await jackCounts(c, area);
			const inArea = mods.filter((m) => m.area === area);
			const withIns = inArea.filter((m) => (jacks[m.idx]?.inputs ?? 0) > 0);
			const nest = c.rnd() < 0.2;
			const sources = nest ? withIns : inArea.filter((m) => (jacks[m.idx]?.outputs ?? 0) > 0);
			if (sources.length === 0 || withIns.length === 0) return 'skipped: no own module with matching jacks';
			const src: OwnModule = pick(c, sources);
			const dst: OwnModule = pick(c, withIns);
			const srcJack = nest ? `input-${int(c, jacks[src.idx].inputs)}` : `output-${int(c, jacks[src.idx].outputs)}`;
			const dstJack = `input-${int(c, jacks[dst.idx].inputs)}`;
			if (src.idx === dst.idx && srcJack === dstJack) return 'skipped: same jack';
			const before = await cableCount(c, area);
			await dragJack(c, jackSel(area, src.idx, srcJack), jackSel(area, dst.idx, dstJack));
			const after = await cableCount(c, area);
			// The editor may legally refuse (e.g. input already in a nest driven by an output).
			return `${src.short}#${src.idx}.${srcJack} → ${dst.short}#${dst.idx}.${dstJack}: ${after > before ? 'added' : 'not added'}`;
		},
	},
	{
		name: 'setCableColor',
		weight: 1,
		burst: true,
		enabled: hasOwn,
		run: async (c) =>
			orSkip('jack menu', async () => {
				const cable = await pickCable(c);
				if (!cable) return 'skipped: no own cable';
				const color = pick(c, CABLE_COLORS);
				await openMenu(c.page, cableJack(c, cable));
				await hoverItem(c.page, 'Set Cable Color');
				await clickItem(c.page, color);
				return `cable to #${cable.dmod} ${color}`;
			}),
	},
	{ name: 'breakCable', weight: 1, enabled: hasOwn, run: jackMenu('Break') },
	{ name: 'deleteConnectedCables', weight: 1, enabled: hasOwn, run: jackMenu('Delete connected') },
	{
		// Meta-drag the cable's input end onto another own input, or into empty space (deletes it).
		name: 'moveCableEnd',
		weight: 1,
		enabled: hasOwn,
		run: async (c) => {
			const cable = await pickCable(c);
			if (!cable) return 'skipped: no own cable';
			const { mods } = await liveOwn(c);
			const jacks = await jackCounts(c, cable.area);
			const targets = mods.filter((m) => m.area === cable.area && (jacks[m.idx]?.inputs ?? 0) > 0);
			const target = c.rnd() < 0.3 || targets.length === 0 ? null : pick(c, targets);
			const to = target ? jackSel(cable.area, target.idx, `input-${int(c, jacks[target.idx].inputs)}`) : null;
			await c.page.evaluate(
				({ key, grab, to }) => {
					const hit = document.querySelector(`.cable-hit[data-cable-key="${key}"]`);
					const g = document.querySelector(grab);
					if (!hit || !g) throw new Error(`cable ${key} not found`);
					const gr = g.getBoundingClientRect();
					const gx = gr.left + gr.width / 2;
					const gy = gr.top + gr.height / 2;
					const t = to ? document.querySelector(to) : null;
					const tr = t?.getBoundingClientRect();
					const tx = tr ? tr.left + tr.width / 2 : 40;
					const ty = tr ? tr.top + tr.height / 2 : 500;
					const mods = { ctrlKey: true, metaKey: true };
					hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: false, cancelable: true, ...mods, clientX: gx, clientY: gy }));
					window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, ...mods, clientX: (gx + tx) / 2, clientY: (gy + ty) / 2 }));
					window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, ...mods, clientX: tx, clientY: ty }));
					(t ?? window).dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, ...mods, clientX: tx, clientY: ty }));
				},
				{ key: cable.key, grab: jackSel(cable.area, cable.dmod, `input-${cable.dcon}`), to },
			);
			await sleep(300);
			return target ? `moved cable end to ${target.short}#${target.idx}` : 'dropped cable end in empty space (delete)';
		},
	},
];
