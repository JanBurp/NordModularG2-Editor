import { describe, expect, it } from 'vitest';
import { parseDragPayload, serializeDragPayload } from '@/utils/dragPayload';

function dropEvent(raw: string | null): DragEvent {
	return { dataTransfer: raw === null ? null : { getData: () => raw } } as unknown as DragEvent;
}

describe('parseDragPayload', () => {
	it('reads a knob-slot payload', () => {
		expect(parseDragPayload(dropEvent(serializeDragPayload({ type: 'knob-slot', slotIndex: 7 })))).toEqual({ type: 'knob-slot', slotIndex: 7 });
	});

	it('reads a CC payload', () => {
		expect(parseDragPayload(dropEvent(serializeDragPayload({ type: 'cc', cc: 42 })))).toEqual({ type: 'cc', cc: 42 });
	});

	// The module-palette drag puts a bare module id in text/plain, and foreign drags put anything at
	// all — neither may be mistaken for one of ours.
	it('returns null for a foreign, malformed or absent payload', () => {
		expect(parseDragPayload(dropEvent('12'))).toBeNull();
		expect(parseDragPayload(dropEvent('{"type":"module"}'))).toBeNull();
		expect(parseDragPayload(dropEvent('{not json'))).toBeNull();
		expect(parseDragPayload(dropEvent(''))).toBeNull();
		expect(parseDragPayload(dropEvent(null))).toBeNull();
	});
});
