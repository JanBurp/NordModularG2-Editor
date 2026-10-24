// `npm run test:duration -- [options]`: maps CLI flags onto the env vars read by e2e-duration/duration.spec.ts, builds, runs.
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const OPTIONS = {
	hours: ['DURATION_HOURS', 'run length in hours (default 4)'],
	minutes: ['DURATION_HOURS', 'run length in minutes, instead of --hours'],
	interval: ['ACTION_INTERVAL_S', 'mean pause between actions in seconds, jittered 0.5-1.5x (default 6)'],
	'burst-p': ['BURST_P', 'chance per step of a burst of fast actions (default 1/6)'],
	'burst-max': ['BURST_MAX', 'most actions in one burst (default 15, at least 5)'],
	'coverage-min': ['COVERAGE_MIN', 'minutes in which every action and module type must have run once (default 30)'],
	seed: ['SEED', 'replay a run\'s random sequence (printed in the report)'],
};

const { values } = parseArgs({
	options: {
		...Object.fromEntries(Object.keys(OPTIONS).map((k) => [k, { type: 'string' }])),
		headed: { type: 'boolean' },
		help: { type: 'boolean' },
	},
});

if (values.help) {
	console.log('Usage: npm run test:duration -- [options]\n');
	for (const [k, [, desc]] of Object.entries(OPTIONS)) console.log(`  --${k.padEnd(13)} ${desc}`);
	console.log(`  --${'headed'.padEnd(13)} show the editor window; don't click or type in it while it runs`);
	process.exit(0);
}

const env = { ...process.env };
for (const [k, [name]] of Object.entries(OPTIONS)) {
	if (values[k] === undefined) continue;
	const n = Number(values[k]);
	if (!Number.isFinite(n)) throw new Error(`--${k}: not a number: ${values[k]}`);
	env[name] = String(k === 'minutes' ? n / 60 : n);
}
if (values.headed) env.DURATION_HEADED = '1';

for (const cmd of [['electron-vite', 'build'], ['playwright', 'test', '-c', 'e2e-duration/playwright.duration.config.ts']]) {
	const { status } = spawnSync('npx', cmd, { stdio: 'inherit', env });
	if (status !== 0) process.exit(status ?? 1);
}
