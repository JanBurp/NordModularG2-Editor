import { defineConfig } from '@playwright/test';

// Specs that use the real OS clipboard: they run one at a time, as parallel copies overwrite each other's.
const CLIPBOARD_SPECS = ['paste-params.spec.ts', 'multi-device.spec.ts'];

export default defineConfig({
	testDir: './e2e',
	timeout: 60_000,
	retries: 0,
	// Each test starts its own Electron, so tests (not only files) can run in parallel.
	fullyParallel: true,
	workers: '80%', // CPU-bound beyond this (10 cores: 8 ≈ 39 s, 10 no faster)
	reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
	use: {
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},
	// The clipboard project first: its one worker then runs next to the others instead of after them.
	projects: [
		{ name: 'clipboard', testMatch: CLIPBOARD_SPECS, workers: 1 },
		{ name: 'e2e', testIgnore: CLIPBOARD_SPECS },
	],
});
