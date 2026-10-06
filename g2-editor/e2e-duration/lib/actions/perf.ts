import { sleep } from '../cli';
import { type ActionCtx, type ActionDef, ensureShown, fillDialog, int, orSkip, pick, SLOTS, UI_TIMEOUT_MS, waitIdle } from './ctx';
import { openSection } from './patch';

const RESTORE_AFTER_MS = 1500;
const isPerf = (c: ActionCtx) => c.mode === 'Performance';

/** Changes something, waits, puts it back. */
async function roundTrip(change: () => Promise<void>, restore: () => Promise<void>): Promise<void> {
	await change();
	await sleep(RESTORE_AFTER_MS);
	await restore();
}

export const PERF_ACTIONS: ActionDef[] = [
	{
		name: 'switchSlot',
		weight: 3,
		burst: true,
		run: async (c, fast) => {
			const i = int(c, 4);
			await c.page.locator(`[data-testid="slot-${i}"]`).click();
			await sleep(fast ? 50 : 1500);
			return `slot ${SLOTS[i]}`;
		},
	},
	{
		// Shift-click toggles a slot's Active, Meta-click its Key; both toggled back.
		name: 'slotActiveKey',
		weight: 1,
		enabled: isPerf,
		run: async (c) => {
			const i = int(c, 4);
			const shift = c.rnd() < 0.5;
			const btn = c.page.locator(`[data-testid="slot-${i}"]`);
			const mod = shift ? 'Shift' : 'Meta';
			await roundTrip(
				() => btn.click({ modifiers: [mod], timeout: UI_TIMEOUT_MS }),
				() => btn.click({ modifiers: [mod], timeout: UI_TIMEOUT_MS }),
			);
			return `slot ${SLOTS[i]} ${shift ? 'active' : 'key'} toggled and back`;
		},
	},
	{
		// BPM, clock run, perf name, or a Performance Settings checkbox (KB split, slot active/key/hold); always restored.
		name: 'perfSettings',
		weight: 2,
		run: async (c) =>
			orSkip('performance settings', async () => {
				const what = pick(c, isPerf(c) ? ['bpm', 'run', 'name', 'checkbox'] : ['bpm', 'run', 'checkbox']);
				if (what === 'bpm') {
					const el = c.page.locator('span.text.w-13.cursor-pointer').first();
					const old = (await el.innerText({ timeout: UI_TIMEOUT_MS })).trim();
					const bpm = String(60 + int(c, 120));
					await roundTrip(
						async () => (await el.click({ timeout: UI_TIMEOUT_MS }), fillDialog(c.page, 'Set BPM', bpm)),
						async () => (await el.click({ timeout: UI_TIMEOUT_MS }), fillDialog(c.page, 'Set BPM', old)),
					);
					return `BPM ${old} → ${bpm} → ${old}`;
				}
				if (what === 'run') {
					const run = c.page.locator('button:text-is("Run")').first();
					await roundTrip(
						() => run.click({ timeout: UI_TIMEOUT_MS }),
						() => run.click({ timeout: UI_TIMEOUT_MS }),
					);
					return 'clock run toggled and back';
				}
				if (what === 'name') {
					const el = c.page.locator('span.text.w-36.cursor-pointer').first();
					const old = (await el.innerText({ timeout: UI_TIMEOUT_MS })).trim();
					const name = `Perf${int(c, 1000)}`;
					await roundTrip(
						async () => (await el.click({ timeout: UI_TIMEOUT_MS }), fillDialog(c.page, 'Rename Performance', name)),
						async () => (await el.click({ timeout: UI_TIMEOUT_MS }), fillDialog(c.page, 'Rename Performance', old)),
					);
					return `perf name → ${name} → "${old}"`;
				}
				const section = await openSection(c, 'Performance Settings', 'open-performance-settings');
				if (!section) return 'skipped: performance settings not shown';
				const boxes = section.locator('[role=checkbox]');
				const n = await boxes.count();
				if (n === 0) return 'skipped: no checkboxes';
				const k = int(c, n);
				await roundTrip(
					() => boxes.nth(k).click({ timeout: UI_TIMEOUT_MS }),
					() => boxes.nth(k).click({ timeout: UI_TIMEOUT_MS }),
				);
				return `performance checkbox ${k} toggled and back`;
			}),
	},
	{
		// Replaces all 4 slots on the G2, so own modules are forgotten.
		name: 'togglePerfMode',
		weight: 1,
		run: async (c) =>
			orSkip('perf button', async () => {
				const btn = c.page.locator('button:text-is("Perf")').first();
				await btn.click({ timeout: UI_TIMEOUT_MS });
				c.own.clear();
				await waitIdle(c.page, 30_000);
				await sleep(3000);
				c.mode = (await btn.getAttribute('class', { timeout: UI_TIMEOUT_MS }))?.includes('btn-active') ? 'Performance' : 'Patch';
				return `mode now ${c.mode}`;
			}),
	},
	{
		// Short notes on the virtual keyboard (play-note); Drone/Repeat are switched off first so nothing keeps sounding.
		name: 'playNotes',
		weight: 1,
		burst: true,
		run: async (c, fast) =>
			orSkip('virtual keyboard', async () => {
				const kb = c.page.locator('[data-testid="virtual-keyboard"]');
				if (!(await ensureShown(c, kb, 'toggle-keyboard'))) return 'skipped: virtual keyboard not shown';
				for (const name of ['Drone', 'Repeat']) {
					const b = c.page.locator(`button.btn-active:text-is("${name}")`);
					if ((await b.count()) > 0) await b.first().click({ timeout: UI_TIMEOUT_MS });
				}
				const keys = kb.locator('div.absolute.top-0.rounded-b-sm');
				const n = await keys.count();
				if (n === 0) return 'skipped: no keys';
				const notes = 1 + int(c, 4);
				for (let i = 0; i < notes; i++) {
					const b = await keys.nth(int(c, n)).boundingBox({ timeout: UI_TIMEOUT_MS });
					if (!b) continue;
					await c.page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.8);
					await c.page.mouse.down();
					await sleep((fast ? 60 : 150) + int(c, 250));
					await c.page.mouse.up();
				}
				return `${notes} notes`;
			}),
	},
];
