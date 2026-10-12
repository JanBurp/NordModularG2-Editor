import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '@/store/settings';

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { electronAPI: { updateRecentFiles: vi.fn() } };
});

describe('addRecentFile', () => {
	it('adds a new entry to the front of the list', () => {
		const store = useSettingsStore();
		store.addRecentFile('/a.pch2', 'patch');
		store.addRecentFile('/b.prf2', 'performance');
		expect(store.recentFiles).toEqual([
			{ path: '/b.prf2', kind: 'performance' },
			{ path: '/a.pch2', kind: 'patch' },
		]);
	});

	it('re-opening an existing path moves it to the front instead of duplicating it', () => {
		const store = useSettingsStore();
		store.addRecentFile('/a.pch2', 'patch');
		store.addRecentFile('/b.pch2', 'patch');
		store.addRecentFile('/a.pch2', 'patch');
		expect(store.recentFiles).toEqual([
			{ path: '/a.pch2', kind: 'patch' },
			{ path: '/b.pch2', kind: 'patch' },
		]);
	});

	it('truncates to the 20 most recent entries', () => {
		const store = useSettingsStore();
		for (let i = 0; i < 25; i++) store.addRecentFile(`/${i}.pch2`, 'patch');
		expect(store.recentFiles).toHaveLength(20);
		expect(store.recentFiles[0].path).toBe('/24.pch2');
		expect(store.recentFiles.at(-1)!.path).toBe('/5.pch2');
	});

	it('notifies the main process menu of the updated list', () => {
		const store = useSettingsStore();
		store.addRecentFile('/a.pch2', 'patch');
		expect(window.electronAPI!.updateRecentFiles).toHaveBeenCalledWith(store.recentFiles);
	});
});

describe('toggleVirtualKeyboard', () => {
	it('cycles hidden → Keyboard → Keyboard + Patch Adjuster → hidden', () => {
		const store = useSettingsStore();
		const state = () => [store.showVirtualKeyboard, store.showPatchAdjuster];
		expect(state()).toEqual([false, false]);
		store.toggleVirtualKeyboard();
		expect(state()).toEqual([true, false]);
		store.toggleVirtualKeyboard();
		expect(state()).toEqual([true, true]);
		store.toggleVirtualKeyboard();
		expect(state()).toEqual([false, false]);
	});
});
