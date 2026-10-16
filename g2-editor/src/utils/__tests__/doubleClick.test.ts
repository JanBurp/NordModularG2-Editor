import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDoubleClickDetector } from '@/utils/doubleClick';

describe('createDoubleClickDetector', () => {
	let now = 1000;
	vi.spyOn(performance, 'now').mockImplementation(() => now);
	afterEach(() => {
		now = 1000;
	});

	it('detects a second click within the interval, then starts over', () => {
		const isDouble = createDoubleClickDetector(400);
		expect(isDouble()).toBe(false);
		now += 300;
		expect(isDouble()).toBe(true);
		now += 100;
		expect(isDouble()).toBe(false);
	});

	it('ignores a second click after the interval', () => {
		const isDouble = createDoubleClickDetector(400);
		expect(isDouble()).toBe(false);
		now += 500;
		expect(isDouble()).toBe(false);
	});

	it('requires the same key', () => {
		const isDouble = createDoubleClickDetector(400);
		expect(isDouble('a')).toBe(false);
		now += 100;
		expect(isDouble('b')).toBe(false);
		now += 100;
		expect(isDouble('b')).toBe(true);
	});
});
