import { describe, expect, it } from 'vitest';
import { confirmedNewDevices } from '../deviceScan';

describe('confirmedNewDevices', () => {
	it('confirms a device only on its second scan in a row', () => {
		expect(confirmedNewDevices([], ['1:4'])).toEqual([]);
		expect(confirmedNewDevices(['1:4'], ['1:4'])).toEqual(['1:4']);
	});

	it('ignores an address seen once, e.g. a rebooting G2 before its daemon follows it', () => {
		expect(confirmedNewDevices(['1:4'], ['1:5'])).toEqual([]);
		expect(confirmedNewDevices(['1:5'], [])).toEqual([]);
	});
});
