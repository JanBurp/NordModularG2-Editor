import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { cliRun } from '../e2e-duration/lib/actions/ctx';
import { PatchParser } from '@/parser/nmg2PatchParser';
import { convertedNote } from '@/parser/currentFormatFile';
import { closeOrganizer, type Editor, openOrganizer, startEditor } from './g2';

// Slow (`npm run test:g2:slow`): send-bank writes or clears all 128 locations of the bank, which takes minutes.

const PATCHES = path.resolve(__dirname, '../../test-patches');
// Scratch bank, the same one the CLI's slow bank tests and editor.g2.test.ts overwrite.
const BANK = '32';

// A file's parsed content, for comparing what the G2 stored with what was meant.
const parsed = (file: string) =>
	JSON.parse(JSON.stringify(new PatchParser(new Uint8Array(fs.readFileSync(file)).buffer).parse(), (k, v) => (k === 'paramaterDataOfs' ? undefined : v)));

describe.skipIf(!inject('g2'))('Bank Download on a connected G2', () => {
	let g: Editor | undefined;

	beforeAll(async () => {
		g = await startEditor();
	});

	afterAll(async () => {
		await g?.close();
	});

	it('sends an old-format file converted (from a hidden copy of the folder) next to a current one', { timeout: 20 * 60_000 }, async () => {
		const { ctx } = g!;
		const page = ctx.page;
		const src = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-bank-src-'));
		const readBack = path.join(os.tmpdir(), 'g2-bank-readback.pch2');
		const storageDir = path.join(await ctx.app.evaluate(({ app }) => app.getPath('userData')), 'bank-storage');
		try {
			// A folder source gets locations 1, 2, … in name order; the file name is the patch name.
			fs.copyFileSync(path.join(PATCHES, 'Analogue NL2.pch2'), path.join(src, '1 Old.pch2')); // format 19
			fs.copyFileSync(path.join(PATCHES, 'EmptyPatch.pch2'), path.join(src, '2 Lead.pch2')); // current
			const original = fs.readFileSync(path.join(src, '1 Old.pch2'));
			expect(original[original.indexOf(0) + 1]).toBe(19);
			await ctx.app.evaluate(({ ipcMain }, folder) => {
				ipcMain.removeHandler('bank:select-folder');
				ipcMain.handle('bank:select-folder', async () => ({ success: true, folder }));
			}, src);

			await openOrganizer(ctx);
			await page.locator('[data-testid="bank-grid-left"]').locator('select').selectOption(BANK);
			await page.locator('[data-testid="bank-download-left"]').click();
			const dialog = page.getByRole('dialog');
			await dialog.getByRole('button', { name: 'Folder', exact: true }).click();
			await dialog.getByRole('button', { name: 'Browse...' }).click();
			await expect.poll(() => dialog.locator('input').inputValue()).toBe(src);
			await dialog.getByRole('button', { name: 'Download', exact: true }).click();

			// Shown for 5 s when send-bank is done, before the names reload and the success toast.
			await page.getByText(convertedNote(1)).waitFor({ timeout: 15 * 60_000 });
			await page.getByText(`Bank downloaded to G2 bank ${BANK} successfully`).waitFor({ timeout: 60_000 });

			const at = async (loc: number) => JSON.parse(await cliRun(page, ['get-location', 'patch', BANK, String(loc), readBack]));
			expect((await at(1)).name).toBe('1 Old');
			const stored = fs.readFileSync(readBack);
			expect(stored[stored.indexOf(0) + 1]).toBe(23);
			expect(parsed(readBack)).toEqual(parsed(path.join(PATCHES, 'converted', 'Analogue NL2.pch2')));
			expect((await at(2)).name).toBe('2 Lead');
			expect(parsed(readBack)).toEqual(parsed(path.join(src, '2 Lead.pch2')));
			expect(fs.readdirSync(storageDir).filter((f) => f.startsWith('.tmp-'))).toEqual([]);
			expect(fs.readFileSync(path.join(src, '1 Old.pch2'))).toEqual(original);
		} finally {
			await closeOrganizer(page);
			for (const loc of ['1', '2']) await cliRun(page, ['clear-patch', 'patch', BANK, loc]);
			fs.rmSync(src, { recursive: true, force: true });
		}
	});
});
