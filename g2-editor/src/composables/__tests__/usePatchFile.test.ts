import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { usePatchFile } from '../usePatchFile';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';

function loadFixtureBytes(name: string): number[] {
	const dirname = fileURLToPath(new URL('.', import.meta.url));
	const buf = fs.readFileSync(path.join(dirname, '../../../../test-patches', name));
	return Array.from(buf);
}

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = {
		cli: { run: vi.fn().mockResolvedValue(undefined) },
		electronAPI: {
			patches: { initLoadPath: vi.fn(), load: vi.fn() },
		},
	};
});

describe('loadInitPatch — Init 1/Init 2 toolbar buttons', () => {
	it('resolves the init path via patches.initLoadPath and loads it into the focused slot', async () => {
		const data = loadFixtureBytes('EmptyPatch.pch2');
		(window as any).electronAPI.patches.initLoadPath.mockResolvedValue('/fake/userData/patches/init-1.pch2');
		(window as any).electronAPI.patches.load.mockResolvedValue({ success: true, data });
		useUiStore().setSlotInFocus('B');

		await usePatchFile().loadInitPatch(1);

		expect((window as any).electronAPI.patches.initLoadPath).toHaveBeenCalledWith(1);
		expect((window as any).electronAPI.patches.load).toHaveBeenCalledWith('/fake/userData/patches/init-1.pch2');
		expect(useSlotsStore().slots['B'].patch).not.toBeNull();
	});

	it('falls back to the bundled EmptyPatch.pch2 path returned by initLoadPath when no snapshot was saved', async () => {
		const data = loadFixtureBytes('EmptyPatch.pch2');
		(window as any).electronAPI.patches.initLoadPath.mockResolvedValue('/app/resources/patches/EmptyPatch.pch2');
		(window as any).electronAPI.patches.load.mockResolvedValue({ success: true, data });

		await usePatchFile().loadInitPatch(2);

		expect((window as any).electronAPI.patches.load).toHaveBeenCalledWith('/app/resources/patches/EmptyPatch.pch2');
	});

	it('no-ops when window.electronAPI is unavailable (non-Electron environment)', async () => {
		(globalThis as any).window = { cli: { run: vi.fn() } };

		await expect(usePatchFile().loadInitPatch(1)).resolves.toBeUndefined();
	});
});
