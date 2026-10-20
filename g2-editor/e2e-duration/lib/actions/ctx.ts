import { errors, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { evaluateWithRetry } from '../../../e2e/fixtures/electron';
import type { G2Snapshot } from '../cli';
import { sleep } from '../cli';
import type { EventLog } from '../eventLog';
import type { ModuleQueue } from './moduleQueue';

export const SLOTS = ['A', 'B', 'C', 'D'];
export type Area = 'va' | 'fx';

/** A module this test added; structural edits only ever touch these. */
export interface OwnModule {
	idx: number;
	area: Area;
	type: number;
	short: string;
}

export interface ActionCtx {
	page: Page;
	app: ElectronApplication;
	log: EventLog;
	snap: G2Snapshot;
	/** Current G2 mode ('Patch' | 'Performance'); updated by the mode toggle. */
	mode: string;
	/** Deterministic random in [0,1). */
	rnd: () => number;
	own: Map<string, OwnModule[]>;
	modules: ModuleQueue;
}

export interface ActionDef {
	name: string;
	weight: number;
	/** Cheap precondition on ctx state only (no DOM reads). */
	enabled?: (c: ActionCtx) => boolean;
	/** Action that can make `enabled` true (coverage runs it when this one is still uncovered). */
	enabledBy?: string;
	/** May run inside a fast burst (short, no dialogs, no loads). */
	burst?: boolean;
	/** Returns a short note for the log ("skipped: …" when a precondition is missing); throws on failure. */
	run: (c: ActionCtx, fast?: boolean) => Promise<string | void>;
}

export const int = (c: ActionCtx, n: number) => Math.floor(c.rnd() * n);
export const pick = <T>(c: ActionCtx, a: readonly T[]): T => a[int(c, a.length)];
export const UI_TIMEOUT_MS = 3000;

export const cliRun = (page: Page, args: string[]) => page.evaluate((a) => (window as any).cli.run(a) as Promise<string>, args);

export const menuAction = (c: ActionCtx, name: string) =>
	evaluateWithRetry(
		c.app,
		({ BrowserWindow }, n) => {
			BrowserWindow.getAllWindows()[0]?.webContents.send('menu:action', n);
		},
		name,
	);

export async function focusedSlot(page: Page): Promise<string> {
	const id = await page.locator('[data-testid^="slot-"].btn-active').first().getAttribute('data-testid');
	return SLOTS[Number(id?.split('-')[1] ?? 0)];
}

export const moduleIdxs = (page: Page, area: Area): Promise<number[]> =>
	page.evaluate((a) => Array.from(document.querySelectorAll(`[data-testid="canvas-${a}"] [data-module-idx]`)).map((e) => Number(e.getAttribute('data-module-idx'))), area);

export const moduleLocator = (page: Page, m: Pick<OwnModule, 'area' | 'idx'>): Locator => page.locator(`[data-testid="canvas-${m.area}"] [data-module-idx="${m.idx}"]`);

/** Shows the canvas of `area` (area-1 = voice, area-0 = FX). Clicking the already-active button toggles it off, so only click when needed. */
export async function showArea(c: ActionCtx, area: Area): Promise<void> {
	const canvas = c.page.locator(`[data-testid="canvas-${area}"]`);
	// Split view can squeeze a pane to a sliver (FX ~10 px, 2026-10-07): it is "visible" but nothing in it is
	// clickable. Clicking the area's button (not active while split) shows it alone.
	if ((await canvas.isVisible()) && ((await canvas.boundingBox())?.height ?? 0) > 100) return;
	const btn = c.page.locator(`[data-testid="area-${area === 'va' ? 1 : 0}"]`);
	if (!((await btn.getAttribute('class', { timeout: UI_TIMEOUT_MS })) ?? '').includes('btn-active')) await btn.click({ timeout: UI_TIMEOUT_MS });
	await canvas.waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
}

/** Own modules of the focused slot that are still on the canvas (a reload may have dropped some). */
export async function liveOwn(c: ActionCtx): Promise<{ slot: string; mods: OwnModule[] }> {
	const slot = await focusedSlot(c.page);
	const mods: OwnModule[] = [];
	for (const m of c.own.get(slot) ?? []) if ((await moduleLocator(c.page, m).count()) > 0) mods.push(m);
	c.own.set(slot, mods);
	return { slot, mods };
}

/** Like liveOwn, but when the focused slot has no own modules and another slot does, focuses that slot first. */
export async function focusOwn(c: ActionCtx): Promise<{ slot: string; mods: OwnModule[] }> {
	const here = await liveOwn(c);
	if (here.mods.length > 0) return here;
	const other = SLOTS.find((s) => s !== here.slot && (c.own.get(s)?.length ?? 0) > 0);
	if (!other) return here;
	await c.page.locator(`[data-testid="slot-${SLOTS.indexOf(other)}"]`).click({ timeout: UI_TIMEOUT_MS });
	await sleep(1500);
	return liveOwn(c);
}

/** A random own module (optionally only those `filter` accepts), with its canvas shown. */
export async function pickOwn(c: ActionCtx, filter: (m: OwnModule) => boolean = () => true): Promise<OwnModule | null> {
	const mods = (await focusOwn(c)).mods.filter(filter);
	if (mods.length === 0) return null;
	const m = pick(c, mods);
	await showArea(c, m.area);
	return m;
}

/** Click a module's title bar (selects it). */
export async function selectModule(c: ActionCtx, m: OwnModule, modifiers: { meta?: boolean; shift?: boolean } = {}): Promise<void> {
	const handle = moduleLocator(c.page, m).locator('[data-drag-handle]');
	await handle.scrollIntoViewIfNeeded({ timeout: UI_TIMEOUT_MS });
	const box = await handle.boundingBox({ timeout: UI_TIMEOUT_MS });
	if (!box) throw new Error(`no drag handle for module ${m.short}#${m.idx}`);
	if (modifiers.meta) await c.page.keyboard.down('Meta');
	if (modifiers.shift) await c.page.keyboard.down('Shift');
	await c.page.mouse.click(box.x + Math.min(64, box.width / 2), box.y + box.height / 2);
	if (modifiers.shift) await c.page.keyboard.up('Shift');
	if (modifiers.meta) await c.page.keyboard.up('Meta');
	await sleep(100);
}

export async function deleteOwn(c: ActionCtx, slot: string, m: OwnModule): Promise<void> {
	await showArea(c, m.area);
	await selectModule(c, m);
	await menuAction(c, 'delete');
	await sleep(300);
	c.own.set(
		slot,
		(c.own.get(slot) ?? []).filter((o) => o !== m),
	);
}

/** Removes all own modules of the focused slot. */
export async function teardown(c: ActionCtx): Promise<string> {
	const { slot, mods } = await liveOwn(c);
	for (const m of mods) await deleteOwn(c, slot, m);
	c.own.delete(slot);
	return `removed ${mods.length} test modules from slot ${slot}`;
}

/** Highest of cycles/memory per area from the toolbar meters (CPU.vue order: VA cycles, VA memory, FX cycles, FX memory); null when the toolbar isn't rendered. */
export async function resourcePeaks(page: Page): Promise<Record<Area, number> | null> {
	const v = await page.evaluate(() => Array.from(document.querySelectorAll('[data-percent]')).map((e) => Number(e.getAttribute('data-percent'))));
	return v.length >= 4 ? { va: Math.max(v[0], v[1]), fx: Math.max(v[2], v[3]) } : null;
}

/** Runs `f`; a UI element that vanished or never appeared (slot reload, remount) becomes a skip instead of a failure. */
export async function orSkip(what: string, f: () => Promise<string | void>): Promise<string | void> {
	try {
		return await f();
	} catch (e) {
		if (e instanceof errors.TimeoutError) return `skipped: ${what} (timeout: ${e.message.split('\n')[0].slice(0, 120)})`;
		if (String(e).includes('Element is not attached to the DOM')) return `skipped: ${what} (element detached)`;
		if (e instanceof NotClickable) return `skipped: ${what} (${e.message})`;
		throw e;
	}
}

/** Waits for the context menu to close, pressing Escape if an action left it open. Also the Quick Add popup a double click on empty canvas opens. */
export async function closeMenus(page: Page): Promise<void> {
	const open = async () =>
		(await page.locator('[data-testid="context-menu"]').count()) > 0 || (await page.getByRole('dialog').count()) > 0 || (await page.locator('input[placeholder="Add module..."]').count()) > 0;
	for (let i = 0; i < 3 && (await open()); i++) {
		await page.keyboard.press('Escape');
		await sleep(150);
	}
}

const menus = (page: Page) => page.locator('[data-testid="context-menu"]');

/** A point (or element) the harness can't click: clipped by its pane or covered. orSkip makes it a skip with the reason. */
export class NotClickable extends Error {}

/**
 * A point where `target` itself is hit (works on SVG <g>): the centre when that's on it, else the first point of a
 * grid over its box. The box can be much larger than what shows: a multi-frame mode bitmap's box spans the whole
 * sprite sheet (ModuleMode.vue), and clicking its centre missed the icon (setMode, 2026-10-07).
 */
export async function hitPoint(target: Locator): Promise<{ x: number; y: number }> {
	await target.scrollIntoViewIfNeeded({ timeout: UI_TIMEOUT_MS });
	const p = await target.evaluate(
		(el) => {
			const b = el.getBoundingClientRect();
			const pts = [[0.5, 0.5]];
			for (let j = 1; j < 10; j++) for (let i = 1; i < 6; i++) pts.push([i / 6, j / 10]);
			for (const [fx, fy] of pts) {
				const x = b.left + b.width * fx;
				const y = b.top + b.height * fy;
				const hit = document.elementFromPoint(x, y);
				if (hit && el.contains(hit)) return { x, y };
			}
			return null;
		},
		undefined,
		{ timeout: UI_TIMEOUT_MS },
	);
	if (!p) throw new NotClickable('target clipped or covered');
	return p;
}

/** Right-clicks `target` (see hitPoint) and waits for the menu. */
export async function openMenu(page: Page, target: Locator): Promise<void> {
	const r = await hitPoint(target);
	await page.mouse.click(r.x, r.y, { button: 'right' });
	await menus(page).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
}

/** Opens a module's context menu by dispatching `contextmenu` on its title: a real right-click's mousedown would start a module drag. */
export async function openModuleMenu(page: Page, m: OwnModule): Promise<void> {
	const title = moduleLocator(page, m).locator('[data-drag-handle]');
	await title.scrollIntoViewIfNeeded({ timeout: UI_TIMEOUT_MS });
	// The real pointer, left wherever the last action put it, could rest on a submenu item of the new menu and open
	// it, and the items are looked up in the deepest menu (2026-10-07: "Replace Module" open, "Rename…" not found).
	await page.mouse.move(1, 1);
	await title.evaluate(
		(el) => {
			const b = el.getBoundingClientRect();
			el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: b.left + b.width / 3, clientY: b.top + b.height / 2 }));
		},
		undefined,
		{ timeout: UI_TIMEOUT_MS },
	);
	await menus(page).first().waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
}

/** A menu item in the deepest open (sub)menu. */
/** Whether a menu item is shown disabled (ContextMenu.vue: class cursor-not-allowed). */
export const itemDisabled = async (page: Page, label: string): Promise<boolean> =>
	((await menuItem(page, label).getAttribute('class', { timeout: UI_TIMEOUT_MS })) ?? '').includes('cursor-not-allowed');

export const menuItem = (page: Page, label: string | RegExp): Locator =>
	menus(page)
		.last()
		.getByRole('menuitem', { name: label, exact: typeof label === 'string' });

/** Labels of the deepest open (sub)menu. */
export const menuLabels = async (page: Page): Promise<string[]> =>
	(await menus(page).last().getByRole('menuitem').allInnerTexts()).map((t) => t.trim()).filter(Boolean);

export async function hoverItem(page: Page, label: string | RegExp): Promise<void> {
	await menuItem(page, label).hover({ timeout: UI_TIMEOUT_MS });
	await sleep(200);
}

export async function clickItem(page: Page, label: string | RegExp): Promise<void> {
	await menuItem(page, label).click({ timeout: UI_TIMEOUT_MS });
	await sleep(150);
}

/** Fills the single input of the dialog titled `title` and confirms with Enter. */
export async function fillDialog(page: Page, title: string, value: string): Promise<void> {
	const dialog = page.getByRole('dialog', { name: title });
	await dialog.waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
	const input = dialog.locator('input, select').first();
	if ((await input.evaluate((el) => el.tagName)) === 'SELECT') await input.selectOption({ index: Number(value) }, { timeout: UI_TIMEOUT_MS });
	else await input.fill(value, { timeout: UI_TIMEOUT_MS });
	await input.press('Enter', { timeout: UI_TIMEOUT_MS });
	await dialog.waitFor({ state: 'hidden', timeout: UI_TIMEOUT_MS });
}

/** A random param element of an own module, or null when it has none. */
export async function pickParam(c: ActionCtx, m: OwnModule): Promise<{ el: Locator; index: number } | null> {
	const params = moduleLocator(c.page, m).locator('[data-param-index]');
	const n = await params.count();
	if (n === 0) return null;
	const el = params.nth(int(c, n));
	return { el, index: Number(await el.getAttribute('data-param-index', { timeout: UI_TIMEOUT_MS })) };
}

/** Makes `target` visible by sending the (toggling) menu action at most `tries` times; false if it never shows. */
export async function ensureShown(c: ActionCtx, target: Locator, action: string, tries = 1): Promise<boolean> {
	for (let i = 0; ; i++) {
		if (await target.first().isVisible()) return true;
		if (i >= tries) return false;
		await menuAction(c, action);
		await sleep(400);
	}
}

/** The Extended Toolbar (morph dials, New/Init, CPU meters); cycles hidden → classic → compact. */
export const ensureExtendedToolbar = (c: ActionCtx) => ensureShown(c, c.page.locator('[data-percent]'), 'toggle-extended-toolbar', 2);

/** Waits for a loading overlay (patch load, upload, mode change) to go away. */
export async function waitIdle(page: Page, timeoutMs = 20_000): Promise<void> {
	await sleep(300);
	await page
		.locator('div.fixed.inset-0.z-50')
		.first()
		.waitFor({ state: 'hidden', timeout: timeoutMs })
		.catch(() => undefined);
}
