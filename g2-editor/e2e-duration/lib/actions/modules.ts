import { dropModuleOnCanvas } from '../../../e2e/helpers';
import { isValidInArea } from '../../../src/renderer/nmg2mods';
import type { ModuleDefinition } from '../../../src/types';
import { sleep, waitFor } from '../cli';
import {
	type ActionCtx,
	type ActionDef,
	type Area,
	type OwnModule,
	clickItem,
	deleteOwn,
	fillDialog,
	focusedSlot,
	hoverItem,
	int,
	focusOwn,
	liveOwn,
	menuLabels,
	moduleIdxs,
	moduleLocator,
	openModuleMenu,
	orSkip,
	pick,
	pickOwn,
	resourcePeaks,
	itemDisabled,
	showArea,
	teardown,
	UI_TIMEOUT_MS,
} from './ctx';
import { initSlot } from './patch';

// Own modules go far right of the patch (cols 12-15) so collision push-down doesn't rearrange the user's modules.
const OWN_COL0 = 12;
const OWN_COLS = 4;
const MAX_OWN_PER_SLOT = 8;
const RESOURCE_LIMIT = 90;
// An add can wait behind a daemon rearm (all-slot snapshot) before the editor shows it.
const ADD_TIMEOUT_MS = 6000;

/** Waits until exactly `n` new module indices show up in `area`; returns them (or whatever appeared by the timeout). */
export async function waitNewIdxs(c: ActionCtx, area: Area, before: number[], n: number): Promise<number[]> {
	let added: number[] = [];
	await waitFor(async () => (added = (await moduleIdxs(c.page, area)).filter((i) => !before.includes(i))).length >= n, ADD_TIMEOUT_MS, 200);
	return added;
}

export const hasOwn = (c: ActionCtx) => [...c.own.values()].some((l) => l.length > 0);

/** Drops `def` far right on `area` of the focused slot and records it as an own module. A "skipped: …" note when the slot reloaded meanwhile; throws when it never shows up. */
export async function addOwnModule(c: ActionCtx, def: ModuleDefinition, area: Area): Promise<OwnModule | string> {
	const slot = await focusedSlot(c.page);
	const before = await moduleIdxs(c.page, area);
	await dropModuleOnCanvas(c.page, def.id, OWN_COL0 + int(c, OWN_COLS), int(c, 40), area);
	const fresh = await waitNewIdxs(c, area, before, 1);
	const diag = `${def.short} in slot ${slot} ${area}, before [${before}], new [${fresh}]`;
	if (fresh.length > 1) return `skipped: slot reloaded (${diag})`;
	if (fresh.length === 0) throw new Error(`added module not on canvas: ${diag}`);
	const own: OwnModule = { idx: fresh[0], area, type: def.id, short: def.short };
	c.own.set(slot, [...(c.own.get(slot) ?? []), own]);
	c.modules.added(def);
	c.log.log('module', { type: def.id, short: def.short, area, slot });
	return own;
}

/** A random own module of a type `accept` takes; when the focused slot has none, adds one in the voice area, or in FX when VA is full. */
export async function pickOrAddOwn(c: ActionCtx, accept: (type: number) => boolean): Promise<OwnModule | string> {
	const m = await pickOwn(c, (o) => accept(o.type));
	if (m) return m;
	if ((await liveOwn(c)).mods.length >= MAX_OWN_PER_SLOT) return `skipped: no matching own module and the cap of ${MAX_OWN_PER_SLOT} is reached`;
	const peaks = await resourcePeaks(c.page);
	// Bank patches often fill VA (~99 %, 2026-10-07), which skipped most mode/label actions.
	const defsIn = (a: Area) => c.modules.all.filter((d) => accept(d.id) && isValidInArea(d.id, a === 'va' ? 'voice' : 'fx'));
	const area = (['va', 'fx'] as const).find((a) => (!peaks || peaks[a] < RESOURCE_LIMIT) && defsIn(a).length > 0);
	if (!area) return `skipped: no matching own module and no room for one${peaks ? ` (${peaks.va}% VA / ${peaks.fx}% FX)` : ''}`;
	await showArea(c, area);
	return addOwnModule(c, pick(c, defsIn(area)), area);
}

export const MODULE_ACTIONS: ActionDef[] = [
	{
		// Every user-addable type in turn (ModuleQueue), 1-3 per call, VA or FX.
		name: 'addModules',
		weight: 6,
		run: async (c) => {
			const slot = await focusedSlot(c.page);
			const own = (await liveOwn(c)).mods.length;
			if (own >= MAX_OWN_PER_SLOT) return `${await teardown(c)} (cap of ${MAX_OWN_PER_SLOT} reached)`;
			// Real bank patches often use 75-100 % of the voice area's DSP: add where there is headroom.
			const peaks = await resourcePeaks(c.page);
			const room = (['va', 'fx'] as const).filter((a) => !peaks || peaks[a] < RESOURCE_LIMIT);
			if (room.length === 0) {
				if (own > 0) return `${await teardown(c)} (resources at ${peaks!.va}% / ${peaks!.fx}%)`;
				// Coverage can't wait for a full bank patch to be replaced by chance.
				if (c.modules.remaining > 0) return `${await initSlot(c, 'New')} (slot was at ${peaks!.va}% VA / ${peaks!.fx}% FX)`;
				return `skipped: slot ${slot} at ${peaks!.va}% VA / ${peaks!.fx}% FX`;
			}
			const area: Area = room.length === 1 ? room[0] : c.rnd() < 0.7 ? 'va' : 'fx';
			await showArea(c, area);
			const added: string[] = [];
			for (let k = 1 + int(c, 3); k > 0; k--) {
				const def = c.modules.next((d) => isValidInArea(d.id, area === 'va' ? 'voice' : 'fx')); // the editor refuses Fx-In in VA
				if (!def) break;
				const own = await addOwnModule(c, def, area);
				if (typeof own === 'string') return own;
				added.push(def.short);
			}
			return `added ${added.join('+')} to slot ${slot} ${area}`;
		},
	},
	{
		name: 'deleteOwnModule',
		weight: 1,
		enabled: hasOwn,
		run: async (c) => {
			const { slot, mods } = await focusOwn(c);
			if (mods.length === 0) return 'skipped: no own module in this slot';
			const m = pick(c, mods);
			await deleteOwn(c, slot, m);
			await sleep(300);
			return `deleted ${m.short}#${m.idx}`;
		},
	},
	{
		name: 'duplicateModule',
		weight: 1,
		enabled: hasOwn,
		run: async (c) => {
			const m = await pickOwn(c);
			if (!m) return 'skipped: no own module in this slot';
			const slot = await focusedSlot(c.page);
			const before = await moduleIdxs(c.page, m.area);
			await dragTitle(c, m, 0, 6 + int(c, 6), 'Meta');
			const fresh = await waitNewIdxs(c, m.area, before, 1);
			if (fresh.length !== 1) throw new Error(`duplicate of ${m.short}#${m.idx}: expected 1 new module, found [${fresh}]`);
			c.own.set(slot, [...(c.own.get(slot) ?? []), { ...m, idx: fresh[0] }]);
			return `duplicated ${m.short}#${m.idx} as #${fresh[0]}`;
		},
	},
	{
		name: 'replaceModule',
		weight: 1,
		enabled: hasOwn,
		run: async (c) =>
			orSkip('replace menu', async () => {
				const m = await pickOwn(c);
				if (!m) return 'skipped: no own module in this slot';
				await openModuleMenu(c.page, m);
				if (await itemDisabled(c.page, 'Replace Module')) return `skipped: no replace candidates for ${m.short}`;
				await hoverItem(c.page, 'Replace Module');
				const candidates = (await menuLabels(c.page)).filter((l) => l !== 'Replace Module');
				if (candidates.length === 0) return `skipped: no replace candidates for ${m.short}`;
				const label = pick(c, candidates);
				await clickItem(c.page, label);
				await sleep(500);
				const short = await moduleLocator(c.page, m).getAttribute('data-module-short', { timeout: UI_TIMEOUT_MS });
				const def = c.modules.all.find((d) => d.short === short);
				if (def) {
					m.type = def.id;
					m.short = def.short;
					c.modules.added(def);
					c.log.log('module', { type: def.id, short: def.short, area: m.area, via: 'replace' });
				}
				return `replaced #${m.idx} with "${label}" (${short})`;
			}),
	},
	{
		name: 'renameModule',
		weight: 1,
		enabled: hasOwn,
		run: async (c) =>
			orSkip('rename dialog', async () => {
				const m = await pickOwn(c);
				if (!m) return 'skipped: no own module in this slot';
				const name = `T${m.short}`.slice(0, 7) + int(c, 100);
				await openModuleMenu(c.page, m);
				await clickItem(c.page, 'Rename…');
				await fillDialog(c.page, 'Rename Module', name);
				return `renamed #${m.idx} to ${name}`;
			}),
	},
	{
		name: 'setModuleColor',
		weight: 1,
		enabled: hasOwn,
		run: async (c) =>
			orSkip('color menu', async () => {
				const m = await pickOwn(c);
				if (!m) return 'skipped: no own module in this slot';
				await openModuleMenu(c.page, m);
				if (await itemDisabled(c.page, 'Set Color')) return 'skipped: Set Color disabled';
				await hoverItem(c.page, 'Set Color');
				const swatches = c.page.locator('[data-testid="context-menu"]').last().locator('li.grid > button');
				const k = int(c, await swatches.count());
				await swatches.nth(k).click({ timeout: UI_TIMEOUT_MS });
				return `colour ${k} on #${m.idx}`;
			}),
	},
	{
		name: 'moveModule',
		weight: 2,
		enabled: hasOwn,
		run: async (c) => {
			const m = await pickOwn(c);
			if (!m) return 'skipped: no own module in this slot';
			const from = await gridPos(c, m);
			const { dCol, dRow } = await dragTitle(c, m, int(c, 3) - 1, int(c, 9) - 4);
			// The editor clamps the target to col/row 0 and puts the dragged module there, pushing others down.
			const to = { col: Math.max(0, from.col + dCol), row: Math.max(0, from.row + dRow) };
			if (to.col === from.col && to.row === from.row) return `skipped: ${m.short}#${m.idx} drag ${dCol},${dRow} is no move`;
			let at = from;
			if (!(await waitFor(async () => ((at = await gridPos(c, m)), at.col === to.col && at.row === to.row), ADD_TIMEOUT_MS, 200)))
				throw new Error(`move of ${m.short}#${m.idx} by ${dCol},${dRow}: expected ${to.col},${to.row}, at ${at.col},${at.row}`);
			return `moved ${m.short}#${m.idx} by ${dCol},${dRow}`;
		},
	},
];

/** Grid cell of a module, from its canvas transform (Module.vue: translate(horiz * 256, vert * 16)). */
async function gridPos(c: ActionCtx, m: OwnModule): Promise<{ col: number; row: number }> {
	const t = (await moduleLocator(c.page, m).getAttribute('transform', { timeout: UI_TIMEOUT_MS })) ?? '';
	const [x, y] = (t.match(/-?[\d.]+/g) ?? []).map(Number);
	if (x === undefined || y === undefined) throw new Error(`no transform on ${m.short}#${m.idx}: "${t}"`);
	return { col: Math.round(x / 256), row: Math.round(y / 16) };
}

/**
 * Drags a module by its title bar by whole grid cells (256 x 16 px at zoom 1), clamped to the visible canvas:
 * a release outside the window is a cross-window drop (useModuleDrag.ts), which does nothing without a second G2 window.
 * Returns the cells actually dragged after clamping.
 */
export async function dragTitle(c: ActionCtx, m: OwnModule, dCol: number, dRow: number, modifier?: 'Meta'): Promise<{ dCol: number; dRow: number }> {
	const handle = moduleLocator(c.page, m).locator('[data-drag-handle]');
	await handle.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }), undefined, { timeout: UI_TIMEOUT_MS });
	const box = await handle.boundingBox({ timeout: UI_TIMEOUT_MS });
	const view = await c.page.locator(`[data-testid="canvas-${m.area}"]`).boundingBox({ timeout: UI_TIMEOUT_MS });
	if (!box || !view) throw new Error(`no drag handle for ${m.short}#${m.idx}`);
	const x = box.x + Math.min(64, box.width / 2);
	const y = box.y + box.height / 2;
	const margin = 20; // clear of the scrollbars
	const toX = Math.min(Math.max(x + dCol * 256, view.x + margin), view.x + view.width - margin);
	const toY = Math.min(Math.max(y + dRow * 16, view.y + margin), view.y + view.height - margin);
	await c.page.mouse.move(x, y);
	await c.page.mouse.down();
	await c.page.mouse.move((x + toX) / 2, (y + toY) / 2, { steps: 4 });
	await c.page.mouse.move(toX, toY, { steps: 4 });
	// Duplicate reads the modifier from the mouseup.
	if (modifier) await c.page.keyboard.down(modifier);
	await c.page.mouse.up();
	if (modifier) await c.page.keyboard.up(modifier);
	await sleep(300);
	return { dCol: Math.round((toX - x) / 256), dRow: Math.round((toY - y) / 16) };
}
