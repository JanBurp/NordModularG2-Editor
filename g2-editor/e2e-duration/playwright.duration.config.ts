import { defineConfig } from '@playwright/test';

const HOURS = Number(process.env.DURATION_HOURS ?? 4);

// Separate from playwright.config.ts so `npm run test:e2e` never picks this (hardware, hours-long) test up.
export default defineConfig({
	testDir: '.',
	testMatch: 'duration.spec.ts',
	// run time + startup, recovery ladders and the final report
	timeout: HOURS * 3600_000 + 60 * 60_000,
	workers: 1,
	retries: 0,
	reporter: [['list']],
});
