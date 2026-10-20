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

// The degraded-uprate toast's Save stores back to the slot's origin; selecting a synth patch must
// record that origin itself instead of waiting for the device's per-slot bank/patch report.
describe('handlePatchSelect — synth patch', () => {
	it('records the selected bank/location as the slot origin', async () => {
		const { useDeviceStore, DeviceStatus } = await import('@/store/device');
		const { stripFileHeader } = await import('@/parser/nmg2PatchParser');
		const bytes = loadFixtureBytes('EmptyPatch.pch2');
		const patchJson = JSON.stringify({ slot: 'B', name: 'Pad', data: stripFileHeader(bytes) });
		(window as any).cli.run = vi.fn(async (cmd: string[]) => (cmd[0] === 'get-patch' ? patchJson : undefined));
		const device = useDeviceStore();
		device.status = DeviceStatus.Connected;
		useUiStore().setSlotInFocus('B');

		await usePatchFile().handlePatchSelect({ type: 'synth', bank: 4, location: 12 });

		expect((window as any).cli.run).toHaveBeenCalledWith(['select-patch', 'B', '4', '12']);
		expect(device.storedLocation.B).toEqual({ bank: 4, location: 12 });
	});
});

describe('handlePerformanceSynthSelect', () => {
	it('records the selected bank/location as the performance origin', async () => {
		const { useDeviceStore, DeviceStatus } = await import('@/store/device');
		const device = useDeviceStore();
		device.status = DeviceStatus.Connected;

		await usePatchFile().handlePerformanceSynthSelect(3, 7);

		expect((window as any).cli.run).toHaveBeenCalledWith(['select-perf', '3', '7']);
		expect(device.storedLocation.perf).toEqual({ bank: 3, location: 7 });
	});
});
