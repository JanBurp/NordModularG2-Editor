import { describe, expect, it } from 'vitest';
import { parseLedBytes, parseVolumeBytes, type LedEntry } from '@/store/led';

// Lists are built VA-first then FX (see buildLedListForSlot), so the byte streams
// must be consumed in that same order. These tests lock that ordering in.

describe('parseVolumeBytes', () => {
	it('maps each [unknown, value] pair to the strip entry in list order, VA before FX', () => {
		const stripList: LedEntry[] = [
			{ area: 'va', moduleIndex: 3, key: 'ledArray-0' },
			{ area: 'va', moduleIndex: 5, key: 'ledArray-0' },
			{ area: 'fx', moduleIndex: 1, key: 'vu-0' },
		];
		const data = [0, 7, 0, 2, 0, 9];
		const result = parseVolumeBytes(stripList, data);
		expect(result.get('va-3-ledArray-0')).toBe(7);
		expect(result.get('va-5-ledArray-0')).toBe(2);
		expect(result.get('fx-1-vu-0')).toBe(9);
	});

	it('stops when the strip list is exhausted (ignores trailing bytes)', () => {
		const stripList: LedEntry[] = [{ area: 'va', moduleIndex: 0, key: 'ledArray-0' }];
		const result = parseVolumeBytes(stripList, [0, 4, 0, 8]);
		expect(result.get('va-0-ledArray-0')).toBe(4);
		expect(result.size).toBe(1);
	});
});

describe('parseLedBytes', () => {
	it('skips the leading byte and unpacks 2 bits per LED (4 per byte) in list order', () => {
		const ledList: LedEntry[] = [
			{ area: 'va', moduleIndex: 2, key: 'led-0' },
			{ area: 'fx', moduleIndex: 4, key: 'led-0' },
			{ area: 'fx', moduleIndex: 4, key: 'led-1' },
		];
		// leading byte ignored; byte 0b00_01_00_01: led0=1 (on), led1=0, led2=1 (on)
		const result = parseLedBytes(ledList, [0xff, 0b00010001]);
		expect(result.get('va-2-led-0')).toBe(true);
		expect(result.get('fx-4-led-0')).toBe(false);
		expect(result.get('fx-4-led-1')).toBe(true);
	});

	it('treats only value 1 as on', () => {
		const ledList: LedEntry[] = [{ area: 'va', moduleIndex: 0, key: 'led-0' }];
		// value 2 -> off
		expect(parseLedBytes(ledList, [0x00, 0b00000010]).get('va-0-led-0')).toBe(false);
		// value 1 -> on
		expect(parseLedBytes(ledList, [0x00, 0b00000001]).get('va-0-led-0')).toBe(true);
	});

	it('returns empty for too-short data', () => {
		const ledList: LedEntry[] = [{ area: 'va', moduleIndex: 0, key: 'led-0' }];
		expect(parseLedBytes(ledList, [0x00]).size).toBe(0);
	});
});
