import { defineConfig } from 'vitest/config';
import path from 'path';

// Hardware suite (`npm run test:g2`): needs a G2 on the Shelly plug and a built app. Separate from vitest.config.ts so `npm test` stays offline.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['test-g2/**/*.g2.test.ts'],
		globalSetup: 'test-g2/globalSetup.ts',
		fileParallelism: false,
		testTimeout: 300_000,
		hookTimeout: 300_000,
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});
