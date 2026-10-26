import { execFileSync } from 'child_process';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { waitFor } from '../e2e-duration/lib/cli';
import { type Editor, startEditor } from './g2';

// The Synth menu's items as [label, enabled] (separators left out).
async function synthMenu(g: Editor): Promise<[string, boolean][]> {
	return g.ctx.app.evaluate(({ Menu }) => {
		const synth = Menu.getApplicationMenu()?.items.find((i) => i.label === 'Synth');
		return (synth?.submenu?.items ?? []).filter((i) => i.type !== 'separator').map((i) => [i.label, i.enabled] as [string, boolean]);
	});
}

// Labels of the disabled items: none while connected (every Synth item needs a connection; Save in Synth
// also a current patch, which a connected editor has).
const disabled = (menu: [string, boolean][]) => menu.filter(([, enabled]) => !enabled).map(([label]) => label);

// Waits until the menu shows Bank Upload (enabled only when connected) as `enabled`; returns the menu.
async function synthMenuWhen(g: Editor, enabled: boolean): Promise<[string, boolean][]> {
	await waitFor(async () => (await synthMenu(g)).find(([l]) => l.startsWith('Bank Upload'))?.[1] === enabled, 10_000, 250);
	return synthMenu(g);
}

describe.skipIf(!inject('g2') || process.platform !== 'darwin')('Synth menu on a connected G2 (macOS application menu)', () => {
	let g: Editor | undefined;

	beforeAll(async () => {
		g = await startEditor();
		// Headless: the OS sends no focus event. Emit the one a real focused window gets; none follow.
		await g.ctx.app.evaluate(({ app, BrowserWindow }) => {
			app.emit('browser-window-focus', {}, BrowserWindow.getAllWindows()[0]);
		});
	});

	afterAll(async () => {
		await g?.close();
	});

	// Daemon exit + reconnect used to clear the main process's active session id for good: the menu then
	// showed the not-connected default (all Synth items dimmed) until the window was refocused.
	it('Synth items are enabled again after the daemon exits and the editor reconnects', async () => {
		expect(disabled(await synthMenuWhen(g!, true))).toEqual([]);

		// Only this editor's daemon (a child of Electron main), not one on another G2; graceful exit, no SIGKILL (that can silence the G2)
		execFileSync('pkill', ['-TERM', '-P', String(g!.ctx.app.process().pid), '-f', 'g2-cli.* daemon']);
		const status = async () => (await g!.ctx.page.locator('[data-testid="connection-status"]').innerText()).trim().toLowerCase();
		expect(await waitFor(async () => (await status()) !== 'connected', 30_000, 250)).toBe(true);
		expect(disabled(await synthMenuWhen(g!, false))).not.toEqual([]);

		await g!.ctx.page.locator('[data-testid="connection-status"]').click();
		expect(await g!.runner.waitConnected(60_000)).toBe(true);
		expect(disabled(await synthMenuWhen(g!, true))).toEqual([]);
	});
});
