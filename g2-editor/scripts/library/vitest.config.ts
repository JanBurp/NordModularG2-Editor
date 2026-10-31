import base from '../../vitest.config';

// Library generator (make-library.test.ts): kept out of `npm test`, run with
// `G2_LIBRARY_SRC=<sources> G2_LIBRARY_OUT=<library folder> npx vitest run -c scripts/library/vitest.config.ts`.
export default { ...base, test: { ...base.test, include: ['scripts/library/**/*.test.ts'] } };
