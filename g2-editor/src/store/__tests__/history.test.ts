import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useHistoryStore } from '@/store/history';
import type { HistoryEntry } from '@/store/history';

function entry(): HistoryEntry {
	return { undo: vi.fn().mockResolvedValue(undefined), redo: vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
	setActivePinia(createPinia());
	vi.useFakeTimers();
});

describe('record / canUndo / canRedo', () => {
	it('pushes to past and reports canUndo', () => {
		const store = useHistoryStore();
		expect(store.canUndo('A')).toBe(false);
		store.record('A', entry());
		expect(store.canUndo('A')).toBe(true);
		expect(store.canRedo('A')).toBe(false);
	});

	it('clears future on new record', () => {
		const store = useHistoryStore();
		store.record('A', entry());
		store.popUndo('A'); // moves entry to future
		expect(store.canRedo('A')).toBe(true);
		store.record('A', entry()); // new action clears future
		expect(store.canRedo('A')).toBe(false);
	});

	it('caps past at MAX_HISTORY (50)', () => {
		const store = useHistoryStore();
		for (let i = 0; i < 55; i++) store.record('A', entry());
		// Access internal state via raw slot to verify cap
		expect(store.slots['A'].past.length).toBe(50);
	});

	it('is independent per slot', () => {
		const store = useHistoryStore();
		store.record('A', entry());
		expect(store.canUndo('A')).toBe(true);
		expect(store.canUndo('B')).toBe(false);
	});
});

describe('popUndo / popRedo', () => {
	it('popUndo returns last entry and moves it to future', () => {
		const store = useHistoryStore();
		const e = entry();
		store.record('A', e);
		const popped = store.popUndo('A');
		expect(popped).toStrictEqual(e);
		expect(store.canUndo('A')).toBe(false);
		expect(store.canRedo('A')).toBe(true);
	});

	it('popUndo returns null when stack is empty', () => {
		const store = useHistoryStore();
		expect(store.popUndo('A')).toBeNull();
	});

	it('popRedo returns first future entry and moves it back to past', () => {
		const store = useHistoryStore();
		const e = entry();
		store.record('A', e);
		store.popUndo('A');
		const redone = store.popRedo('A');
		expect(redone).toStrictEqual(e);
		expect(store.canUndo('A')).toBe(true);
		expect(store.canRedo('A')).toBe(false);
	});

	it('popRedo returns null when future is empty', () => {
		const store = useHistoryStore();
		expect(store.popRedo('A')).toBeNull();
	});

	it('preserves LIFO order across multiple entries', () => {
		const store = useHistoryStore();
		const e1 = entry(), e2 = entry(), e3 = entry();
		store.record('A', e1);
		store.record('A', e2);
		store.record('A', e3);
		expect(store.popUndo('A')).toStrictEqual(e3);
		expect(store.popUndo('A')).toStrictEqual(e2);
		expect(store.popUndo('A')).toStrictEqual(e1);
	});
});

describe('lock / unlock / isLocked', () => {
	it('starts unlocked', () => {
		expect(useHistoryStore().isLocked('A')).toBe(false);
	});

	it('lock and unlock toggle correctly', () => {
		const store = useHistoryStore();
		store.lock('A');
		expect(store.isLocked('A')).toBe(true);
		store.unlock('A');
		expect(store.isLocked('A')).toBe(false);
	});
});

describe('clearHistory', () => {
	it('resets past, future, and lock state', () => {
		const store = useHistoryStore();
		store.record('A', entry());
		store.record('A', entry());
		store.popUndo('A');
		store.lock('A');
		store.clearHistory('A');
		expect(store.canUndo('A')).toBe(false);
		expect(store.canRedo('A')).toBe(false);
		expect(store.isLocked('A')).toBe(false);
	});
});

describe('coalescing', () => {
	it('first call with coalesceKey pushes one entry to past', () => {
		const store = useHistoryStore();
		const box = { initial: 0, latest: 5 };
		store.record('A', entry(), 'myKey', box);
		expect(store.slots['A'].past.length).toBe(1);
	});

	it('second call within window does NOT push a duplicate entry', () => {
		const store = useHistoryStore();
		const box1 = { initial: 0, latest: 5 };
		const box2 = { initial: 0, latest: 10 };
		store.record('A', entry(), 'myKey', box1);
		store.record('A', entry(), 'myKey', box2);
		expect(store.slots['A'].past.length).toBe(1);
	});

	it('second call updates box.latest on the stored entry so redo uses the final value', () => {
		const store = useHistoryStore();
		const box = { initial: 0, latest: 5 };
		store.record('A', entry(), 'myKey', box);
		// Simulate a subsequent change updating latest
		const box2 = { initial: 0, latest: 42 };
		store.record('A', entry(), 'myKey', box2);
		// The coalescing map's box.latest should now be 42
		expect(store.slots['A'].coalescing.get('myKey')?.box.latest).toBe(42);
	});

	it('after COALESCE_MS expires, a new call with the same key pushes a fresh entry', () => {
		const store = useHistoryStore();
		store.record('A', entry(), 'myKey', { initial: 0, latest: 5 });
		vi.advanceTimersByTime(1001); // expire coalesce window
		store.record('A', entry(), 'myKey', { initial: 5, latest: 10 });
		expect(store.slots['A'].past.length).toBe(2);
	});
});
