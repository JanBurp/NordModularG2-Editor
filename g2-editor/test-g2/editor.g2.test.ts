import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ACTIONS } from '../e2e-duration/lib/actions/index';
import { cliRun, focusedSlot, menuAction, teardown } from '../e2e-duration/lib/actions/ctx';
import { snapshotG2 } from '../e2e-duration/lib/cli';
import { checkConsistency, deviceState, type SlotState } from '../e2e-duration/lib/consistency';
import { PatchParser } from '@/parser/nmg2PatchParser';
import { action, backupPerf, type Editor, g2Mode, lastAction, type Mode, perfFlags, restorePerf, setMode, type SlotFlags, startEditor } from './g2';

// Long enough that the Runner's unlocker stays active.
const coverage = () => ({ from: Date.now(), until: Date.now() + 60 * 60_000 });

// Run by the other tests here.
const USED = new Set(['addModules', 'addCable', 'tweakParam', 'moveModule', 'togglePerfMode', 'slotActiveKey']);

/**
 * Runs every not-yet-run action that is enabled in the current mode once (adding test modules first when an
 * action needs some), each followed by an editor/G2 consistency check. Returns the problems, empty when all is well.
 */
async function runRemaining(g: Editor, done: Set<string>): Promise<string[]> {
	const { runner, ctx, log } = g;
	const problems: string[] = [];
	for (const a of ACTIONS) {
		if (USED.has(a.name) || done.has(a.name)) continue;
		if (a.enabled && !a.enabled(ctx)) await runner.runOne(action('addModules'));
		if (a.enabled && !a.enabled(ctx)) continue;
		done.add(a.name);
		await runner.runOne(a);
		const ev = lastAction(log);
		if (!ev?.ok) problems.push(`${a.name}: failed (${ev?.note ?? 'no log'})`);
		else if (String(ev.note ?? '').startsWith('skipped')) problems.push(`${a.name}: ${ev.note}`);
		const { diffs } = await checkConsistency(ctx.page);
		if (diffs.length) problems.push(`${a.name}: editor and G2 differ: ${diffs.join('; ')}`);
	}
	return problems;
}

// The menu action toggles: open only when closed. Close = Escape until gone (the first one may only
// clear the selection, which dragging also sets).
async function openOrganizer(ctx: Editor['ctx']) {
	if (!(await ctx.page.locator('[data-testid="bank-organizer"]').isVisible())) await menuAction(ctx, 'toggle-bank-organizer');
	await ctx.page.locator('[data-testid="bank-organizer"]').waitFor();
}
async function closeOrganizer(page: Editor['ctx']['page']) {
	for (let i = 0; i < 3 && (await page.locator('[data-testid="bank-organizer"]').isVisible()); i++) await page.keyboard.press('Escape');
}

const structure = (s: SlotState) => ({ va: [s.va.modules, s.va.cables], fx: [s.fx.modules, s.fx.cables] });

describe.skipIf(!inject('g2'))('editor on a connected G2', () => {
	let g: Editor | undefined;
	let origMode: Mode;
	let origFlags: SlotFlags;
	// Name of the backed-up performance; undefined once restored.
	let origPerf: string | undefined;
	// Actions runRemaining has run.
	const done = new Set<string>();

	beforeAll(async () => {
		origMode = await g2Mode();
		origFlags = await perfFlags();
		// The actions below load patches and edit all slots; nothing is stored to a bank.
		origPerf = await backupPerf();
		await setMode('Patch');
		expect((await snapshotG2()).mode).toBe('Patch');
		g = await startEditor();
		expect(g.ctx.mode).toBe('Patch');
	});

	afterAll(async () => {
		await g?.close();
		if (origPerf !== undefined) await restorePerf(origPerf);
		if (origMode && (await g2Mode()) !== origMode) await setMode(origMode);
	});

	it('connects and answers a probe', async () => {
		expect(await g!.runner.probe()).toBe(true);
	});

	// Scratch bank, the same one the CLI's slow bank tests overwrite; cleared again afterwards.
	it('Bank Organizer: swap, copy to storage and back by dragging, on the G2 itself', async () => {
		const { ctx } = g!;
		const page = ctx.page;
		const BANK = '32';
		const fixture = path.resolve(__dirname, '../../test-patches/EmptyPatch.pch2');
		const nameAt = async (loc: number) => {
			const r = JSON.parse(await cliRun(page, ['get-location', 'patch', BANK, String(loc), path.join(os.tmpdir(), 'g2-organizer-check.pch2')]));
			return r.empty ? null : r.name;
		};
		const until = async (check: () => Promise<boolean>) => {
			for (let i = 0; i < 60 && !(await check()); i++) await page.waitForTimeout(500);
			expect(await check()).toBe(true);
		};
		try {
			await cliRun(page, ['put-location', 'patch', BANK, '1', fixture, 'OrgA']);
			await cliRun(page, ['put-location', 'patch', BANK, '2', fixture, 'OrgB']);
			await cliRun(page, ['clear-patch', 'patch', BANK, '3']);
			await cliRun(page, ['reload-names']);

			await openOrganizer(ctx);
			const left = page.locator('[data-testid="bank-grid-left"]');
			await left.locator('select').selectOption(BANK);
			const cell = (loc: number) => left.locator(`[data-testid="bank-cell-${loc}"]`);
			await until(async () => (await cell(1).textContent())?.includes('OrgA') ?? false);

			await cell(1).dragTo(cell(2));
			await until(async () => (await nameAt(1)) === 'OrgB' && (await nameAt(2)) === 'OrgA');

			await cell(1).dragTo(page.locator('[data-testid="organizer-storage"]'));
			const chip = page.locator('[data-testid="storage-item"]', { hasText: 'OrgB' });
			await until(async () => (await chip.count()) === 1);
			expect(await nameAt(1)).toBe('OrgB'); // a copy: the source stays

			await chip.dragTo(cell(3));
			await until(async () => (await nameAt(3)) === 'OrgB');
			expect(await chip.count()).toBe(1); // a copy: the storage item stays
		} finally {
			await closeOrganizer(page); // first: a failing clear below must not leave it covering the canvas
			for (const loc of ['1', '2', '3']) await cliRun(page, ['clear-patch', 'patch', BANK, loc]);
			// Remove what this test put in Temporary Storage, so its folder is left as it was.
			const storageDir = path.join(await ctx.app.evaluate(({ app }) => app.getPath('userData')), 'bank-storage');
			for (const f of fs.existsSync(storageDir) ? fs.readdirSync(storageDir) : []) if (f.startsWith('OrgB__')) fs.rmSync(path.join(storageDir, f));
		}
	});

	// Scratch bank 32 again: a selection of two is moved onto an occupied location and fills the
	// free spots after it; a drop near the end that does not fit warns and changes nothing.
	it('Bank Organizer: moves a multi-selection into free spots, warns when it does not fit', async () => {
		const { ctx } = g!;
		const page = ctx.page;
		const BANK = '32';
		const fixture = path.resolve(__dirname, '../../test-patches/EmptyPatch.pch2');
		const used = [1, 2, 10, 11, 12, 127];
		const nameAt = async (loc: number) => {
			const r = JSON.parse(await cliRun(page, ['get-location', 'patch', BANK, String(loc), path.join(os.tmpdir(), 'g2-organizer-check.pch2')]));
			return r.empty ? null : r.name;
		};
		const until = async (check: () => Promise<boolean>) => {
			for (let i = 0; i < 60 && !(await check()); i++) await page.waitForTimeout(500);
			expect(await check()).toBe(true);
		};
		try {
			for (const loc of used) await cliRun(page, ['clear-patch', 'patch', BANK, String(loc)]);
			await cliRun(page, ['put-location', 'patch', BANK, '1', fixture, 'OrgA']);
			await cliRun(page, ['put-location', 'patch', BANK, '2', fixture, 'OrgB']);
			await cliRun(page, ['put-location', 'patch', BANK, '10', fixture, 'OrgX']);
			await cliRun(page, ['reload-names']);

			await openOrganizer(ctx);
			const left = page.locator('[data-testid="bank-grid-left"]');
			await left.locator('select').selectOption(BANK);
			const cell = (loc: number) => left.locator(`[data-testid="bank-cell-${loc}"]`);
			await until(async () => (await cell(10).textContent())?.includes('OrgX') ?? false);

			await cell(1).click();
			await cell(2).click({ modifiers: ['ControlOrMeta'] });
			await cell(1).dragTo(cell(10));
			await until(async () => (await nameAt(11)) === 'OrgA' && (await nameAt(12)) === 'OrgB');
			expect(await nameAt(10)).toBe('OrgX'); // occupied: skipped, not overwritten
			expect(await nameAt(1)).toBeNull(); // moved
			expect(await nameAt(2)).toBeNull();

			// Undo (menu = Cmd-Z) puts both back and empties the targets; Redo moves them again.
			await menuAction(ctx, 'undo');
			await until(async () => (await nameAt(1)) === 'OrgA' && (await nameAt(2)) === 'OrgB' && (await nameAt(11)) === null);
			expect(await nameAt(12)).toBeNull();
			await menuAction(ctx, 'redo');
			await until(async () => (await nameAt(11)) === 'OrgA' && (await nameAt(12)) === 'OrgB' && (await nameAt(1)) === null);

			// 11 and 12 onto 128: only 128 is free from there (127 is filled first).
			await cliRun(page, ['put-location', 'patch', BANK, '127', fixture, 'OrgY']);
			await cliRun(page, ['reload-names']);
			await until(async () => (await cell(127).textContent())?.includes('OrgY') ?? false);
			await cell(11).click();
			await cell(12).click({ modifiers: ['ControlOrMeta'] });
			await cell(11).dragTo(cell(128));
			const dialog = page.getByRole('dialog');
			await until(async () => (await dialog.count()) > 0 && ((await dialog.textContent()) ?? '').includes('Not enough room'));
			await page.getByRole('button', { name: 'OK' }).click();
			expect(await nameAt(11)).toBe('OrgA');
			expect(await nameAt(12)).toBe('OrgB');
			expect(await nameAt(128)).toBeNull();
		} finally {
			await closeOrganizer(page); // first: a failing clear below must not leave it covering the canvas
			for (const loc of [...used, 128]) await cliRun(page, ['clear-patch', 'patch', BANK, String(loc)]);
		}
	});

	// Scratch bank 32 again: the G2 has no set-category command, so the organizer rewrites the location.
	// Checked in the patch data read back from flash and in the G2's own bank list. Also Copy to Bank
	// and a single Delete (no confirmation), all through the context menu and undoable.
	it('Bank Organizer: changes categories, copies to a bank and deletes one location, on the G2 itself', async () => {
		const { ctx } = g!;
		const page = ctx.page;
		const BANK = '32';
		const fixture = path.resolve(__dirname, '../../test-patches/EmptyPatch.pch2'); // No Cat
		const tmp = path.join(os.tmpdir(), 'g2-organizer-check.pch2');
		const used = [1, 2, 3];
		const nameAt = async (loc: number) => {
			const r = JSON.parse(await cliRun(page, ['get-location', 'patch', BANK, String(loc), tmp]));
			return r.empty ? null : r.name;
		};
		// Category id in the patch data stored at `loc` (null when empty).
		const fileCategoryAt = async (loc: number) => {
			if ((await nameAt(loc)) === null) return null;
			return new PatchParser(new Uint8Array(fs.readFileSync(tmp)).buffer).parse().description?.category ?? null;
		};
		// Category slug the G2's own bank list reports for `loc`. The daemon has no `list`: reload-names
		// sends the list as a `names` event, which replaces the editor's entries. The editor's entry is
		// marked first, so its own (optimistic) category can't pass for the G2's.
		const listCategoryAt = async (loc: number) => {
			const entry = (mark: boolean) =>
				page.evaluate(
					([bank, location, mark]) => {
						const browser = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('browser');
						const e = browser.synthPatches.find((p: any) => p.bank === bank && p.location === location);
						if (e && mark) e.category = 'not-reloaded';
						return e?.category as string | undefined;
					},
					[Number(BANK), loc, mark] as const,
				);
			await entry(true);
			await cliRun(page, ['reload-names']);
			for (let i = 0; i < 20 && (await entry(false)) === 'not-reloaded'; i++) await page.waitForTimeout(500);
			return entry(false);
		};
		const until = async (check: () => Promise<boolean>) => {
			for (let i = 0; i < 60 && !(await check()); i++) await page.waitForTimeout(500);
			expect(await check()).toBe(true);
		};
		const contextMenu = async (loc: number, ...items: (string | RegExp)[]) => {
			await cell(loc).click({ button: 'right' });
			for (const [i, name] of items.entries()) {
				const item = page.getByRole('menuitem', { name, exact: typeof name === 'string' });
				await (i < items.length - 1 ? item.hover() : item.click());
			}
		};
		const left = page.locator('[data-testid="bank-grid-left"]');
		const cell = (loc: number) => left.locator(`[data-testid="bank-cell-${loc}"]`);
		try {
			for (const loc of used) await cliRun(page, ['clear-patch', 'patch', BANK, String(loc)]);
			await cliRun(page, ['put-location', 'patch', BANK, '1', fixture, 'OrgC']);
			await cliRun(page, ['put-location', 'patch', BANK, '2', fixture, 'OrgD']);
			await cliRun(page, ['reload-names']);

			await openOrganizer(ctx);
			await left.locator('select').selectOption(BANK);
			await until(async () => (await cell(2).textContent())?.includes('OrgD') ?? false);

			// One cell via its context menu.
			await contextMenu(1, 'Category', 'Bass');
			await until(async () => (await fileCategoryAt(1)) === 3);
			expect(await listCategoryAt(1)).toBe('bass');
			expect(await nameAt(1)).toBe('OrgC'); // the name stays

			// A selection of two via the top bar's category buttons.
			await cell(1).click();
			await cell(2).click({ modifiers: ['ControlOrMeta'] });
			await page.locator('[data-testid="organizer-categories"]').getByRole('button', { name: 'User 1' }).click();
			await until(async () => (await fileCategoryAt(1)) === 14 && (await fileCategoryAt(2)) === 14);
			expect(await listCategoryAt(2)).toBe('user_1');

			// Undo restores both previous versions.
			await menuAction(ctx, 'undo');
			await until(async () => (await fileCategoryAt(1)) === 3 && (await fileCategoryAt(2)) === 0);
			expect(await listCategoryAt(2)).toBe('no_cat');

			// Copy to Bank: the first empty location of the shown bank, category included. A plain click
			// first: the menu of a selected cell acts on the whole selection.
			await cell(1).click();
			await contextMenu(1, /^Copy to Bank 32 \(at 32-3\)/);
			await until(async () => (await nameAt(3)) === 'OrgC');
			expect(await fileCategoryAt(3)).toBe(3);
			expect(await nameAt(1)).toBe('OrgC'); // a copy: the source stays

			// One location is deleted without asking; Undo brings it back.
			await contextMenu(2, 'Delete');
			await until(async () => (await nameAt(2)) === null);
			expect(await page.getByRole('dialog').count()).toBe(0);
			await menuAction(ctx, 'undo');
			await until(async () => (await nameAt(2)) === 'OrgD');
		} finally {
			await closeOrganizer(page); // first: a failing clear below must not leave it covering the canvas
			for (const loc of used) await cliRun(page, ['clear-patch', 'patch', BANK, String(loc)]);
		}
	});

	it('adds modules and a cable, tweaks and moves, stays consistent and tears down cleanly', async () => {
		const { runner, ctx, log } = g!;
		const slot = await focusedSlot(ctx.page);
		const before = deviceState(await cliRun(ctx.page, ['get-patch', slot]));
		for (const name of ['addModules', 'addCable', 'tweakParam', 'moveModule']) {
			await runner.runOne(action(name));
			const ev = lastAction(log);
			expect(ev, name).toMatchObject({ name, ok: true });
			if (name === 'addModules') expect(String(ev!.note)).toMatch(/^added /);
		}
		expect((await checkConsistency(ctx.page)).diffs).toEqual([]);
		await teardown(ctx);
		const after = deviceState(await cliRun(ctx.page, ['get-patch', slot]));
		expect(structure(after)).toEqual(structure(before));
	});

	it('runs every other Patch-mode action once, each keeping editor and G2 consistent', { timeout: 30 * 60_000 }, async () => {
		expect(await runRemaining(g!, done)).toEqual([]);
		await teardown(g!.ctx);
	});

	it('coverage switches Patch → Performance to run slotActiveKey, which counts as covered', async () => {
		const { runner, ctx, log } = g!;
		for (const a of ACTIONS) if (a.name !== 'slotActiveKey') runner.covered.add(a.name);

		expect((await runner.step(coverage())).name).toBe('togglePerfMode');
		expect(lastAction(log)).toMatchObject({ name: 'togglePerfMode', ok: true });
		expect(ctx.mode).toBe('Performance');

		const flags = await perfFlags(ctx.page);
		expect((await runner.step(coverage())).name).toBe('slotActiveKey');
		const ev = lastAction(log);
		expect(ev).toMatchObject({ name: 'slotActiveKey', ok: true });
		expect(String(ev!.note)).not.toMatch(/^skipped/);
		expect(runner.covered.has('slotActiveKey')).toBe(true);

		expect(await runner.probe()).toBe(true);
		expect(await perfFlags(ctx.page)).toEqual(flags);
	});

	it('runs the Performance-only actions once, each keeping editor and G2 consistent', { timeout: 10 * 60_000 }, async () => {
		expect(g!.ctx.mode).toBe('Performance');
		expect(await runRemaining(g!, done)).toEqual([]);
		await teardown(g!.ctx);
		// Every action ran in one of the two modes.
		expect(ACTIONS.map((a) => a.name).filter((n) => !USED.has(n) && !done.has(n))).toEqual([]);
	});

	it('leaves the G2 as it found it', async () => {
		await g!.close();
		await restorePerf(origPerf!);
		origPerf = undefined;
		await setMode(origMode);
		expect(await g2Mode()).toBe(origMode);
		expect(await perfFlags()).toEqual(origFlags);
	});
});
