import { describe, it, expect } from 'vitest';
import { baseName, parentDir } from '../path';

describe('baseName', () => {
	it('handles both separator styles', () => {
		expect(baseName('/Users/x/Bass')).toBe('Bass');
		expect(baseName('C:\\Users\\x\\Bass')).toBe('Bass');
	});
});

describe('parentDir', () => {
	it.each([
		['/Users/x/Bass', '/Users/x'],
		['/Users', '/'],
		['/Users/x/', '/Users'],
		['/', null],
		['C:\\Users\\x\\Bass', 'C:\\Users\\x'],
		['C:\\Users', 'C:\\'],
		['C:\\Users\\', 'C:\\'],
		['C:\\', null],
		['', null],
	])('%s → %s', (dir, parent) => {
		expect(parentDir(dir)).toBe(parent);
	});
});
