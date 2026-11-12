import { describe, expect, it } from 'vitest';
import { formatMeterLine, parseMeterLine, withMeterLine, type NotesMeter } from '../meterGraphNotes';

const meters: NotesMeter[] = [
	{ location: 1, moduleIndex: 3, ledNo: 0, hidden: false },
	{ location: 1, moduleIndex: 3, ledNo: 1, hidden: false },
	{ location: 0, moduleIndex: 2, ledNo: 0, hidden: true },
];
const LINE = '[metergraph: V3.1 V3.2 F2.1-]';

describe('formatMeterLine / parseMeterLine', () => {
	it('round-trips order and hidden flags, 1-based meter numbers', () => {
		expect(formatMeterLine(meters)).toBe(LINE);
		expect(parseMeterLine(LINE)).toEqual(meters);
		expect(parseMeterLine(`${LINE}\nmy notes`)).toEqual(meters);
	});

	it('is empty for no meters, null when the first line is not our tag', () => {
		expect(formatMeterLine([])).toBe('');
		expect(parseMeterLine('[metergraph:]')).toEqual([]);
		expect(parseMeterLine('')).toBeNull();
		expect(parseMeterLine('my notes')).toBeNull();
		expect(parseMeterLine(`my notes\n${LINE}`)).toBeNull();
		expect(parseMeterLine('[metergraph] idea')).toBeNull();
		expect(parseMeterLine('[metergraph: V1.1] more')).toBeNull();
		expect(parseMeterLine('[metergraph: V1.1 x]')).toBeNull();
	});
});

describe('withMeterLine never changes the user text', () => {
	const user = 'Lead patch\nmod wheel = vibrato';

	it('inserts the tag above existing text, which shifts down unchanged', () => {
		expect(withMeterLine(user, LINE)).toEqual({ text: `${LINE}\n${user}`, fits: true });
		expect(withMeterLine('', LINE)).toEqual({ text: LINE, fits: true });
	});

	it('replaces only its own old tag', () => {
		const old = `[metergraph: V1.1]\n${user}`;
		expect(withMeterLine(old, LINE).text).toBe(`${LINE}\n${user}`);
		expect(withMeterLine('[metergraph: V1.1]\r\nline1\r\nline2', LINE).text).toBe(`${LINE}\nline1\r\nline2`);
	});

	it('leaves look-alike lines alone and puts a new tag above them', () => {
		for (const text of ['[metergraph] idea', '[metergraph: V1.1] more', `notes\n${LINE}`, `trailing newline\n`]) {
			expect(withMeterLine(text, LINE).text).toBe(`${LINE}\n${text}`);
		}
	});

	it('removes only its tag when there are no meters', () => {
		expect(withMeterLine(`${LINE}\n${user}`, '').text).toBe(user);
		expect(withMeterLine(LINE, '').text).toBe('');
		expect(withMeterLine(user, '').text).toBe(user);
	});

	it('leaves the notes, old tag included, unchanged rather than letting the cap cut user text', () => {
		const full = 'x'.repeat(1000);
		expect(withMeterLine(full, LINE)).toEqual({ text: full, fits: false });
		expect(withMeterLine(`[metergraph: V1.1]\n${full}`, LINE)).toEqual({ text: `[metergraph: V1.1]\n${full}`, fits: false });
		expect(withMeterLine('short', LINE, 20)).toEqual({ text: 'short', fits: false });
	});
});
