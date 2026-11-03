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

// A file in an older format is converted by the parser: the G2 gets the converted data, and the
// first save says it wrote the current format.
describe('old file formats', () => {
	async function loadFromDisk(file: string) {
		const { useDeviceStore, DeviceStatus } = await import('@/store/device');
		useDeviceStore().status = DeviceStatus.Connected;
		(window as any).electronAPI.patches.load.mockResolvedValue({ success: true, data: loadFixtureBytes(file) });
		(window as any).electronAPI.savePatch = vi.fn().mockResolvedValue(undefined);
		await usePatchFile().handlePatchSelect({ type: 'disk', filepath: `/p/${file}` });
		return (window as any).cli.run.mock.calls.map((c: unknown[]) => (c[0] as string[])[0]) as string[];
	}
	const toastTexts = async () => (await import('../useToast')).useToast().toasts.map((t) => t.message);

	it('uploads a v19 patch as converted data and toasts once on save', async () => {
		(await import('../useToast')).useToast().toasts.splice(0);
		const cmds = await loadFromDisk('Analogue NL2.pch2');
		expect(cmds).toContain('upload-patch-data');
		expect(cmds).not.toContain('upload-patch');
		const store = useSlotsStore();
		await store.saveSlot('A');
		await store.saveSlot('A');
		expect((await toastTexts()).filter((m) => m.includes('converted from format 19'))).toHaveLength(1);
	});

	it('uploads a current-format patch file as it is, without a toast on save', async () => {
		(await import('../useToast')).useToast().toasts.splice(0);
		const cmds = await loadFromDisk('EmptyPatch.pch2');
		expect(cmds).toContain('upload-patch');
		await useSlotsStore().saveSlot('A');
		expect((await toastTexts()).some((m) => m.includes('converted from format'))).toBe(false);
	});

	it('uploads a v19 performance as converted data and toasts on save', async () => {
		(await import('../useToast')).useToast().toasts.splice(0);
		const cmds = await loadFromDisk('MorphingDrumDemo.prf2');
		expect(cmds).toContain('upload-perf-data');
		expect(cmds).not.toContain('upload-perf');
		await useSlotsStore().savePerformance('/p/out.prf2');
		expect((await toastTexts()).filter((m) => m.includes('converted from format 19'))).toHaveLength(1);
	});
});

// A synth select replaces what came from a file: Save must not overwrite that file or toast about it.
describe('synth select forgets the file a slot came from', () => {
	it('clears the file path and the old-format marker on a synth patch select', async () => {
		const { useDeviceStore, DeviceStatus } = await import('@/store/device');
		const { stripFileHeader } = await import('@/parser/nmg2PatchParser');
		useDeviceStore().status = DeviceStatus.Connected;
		(window as any).electronAPI.patches.load.mockResolvedValue({ success: true, data: loadFixtureBytes('Analogue NL2.pch2') });
		await usePatchFile().handlePatchSelect({ type: 'disk', filepath: '/p/Analogue NL2.pch2' });
		const store = useSlotsStore();
		expect(store.slotFilePaths.A).toBe('/p/Analogue NL2.pch2');
		expect(store.slotOldFileVersions.A).toBe(19);

		const patchJson = JSON.stringify({ slot: 'A', name: 'Pad', data: stripFileHeader(loadFixtureBytes('EmptyPatch.pch2')) });
		(window as any).cli.run = vi.fn(async (cmd: string[]) => (cmd[0] === 'get-patch' ? patchJson : undefined));
		await usePatchFile().handlePatchSelect({ type: 'synth', bank: 1, location: 1 });

		expect(store.slotFilePaths.A).toBe('');
		expect(store.slotOldFileVersions.A).toBeNull();
	});

	it('clears the performance and slot files on a synth performance select', async () => {
		const { useDeviceStore, DeviceStatus } = await import('@/store/device');
		useDeviceStore().status = DeviceStatus.Connected;
		const store = useSlotsStore();
		store.$patch({ performanceFilePath: '/p/x.prf2', performanceOldFileVersion: 19 });
		store.slotFilePaths.B = '/p/b.pch2';
		store.slotOldFileVersions.B = 22;

		await usePatchFile().handlePerformanceSynthSelect(1, 1);

		expect(store.performanceFilePath).toBe('');
		expect(store.performanceOldFileVersion).toBeNull();
		expect(store.slotFilePaths.B).toBe('');
		expect(store.slotOldFileVersions.B).toBeNull();
	});
});
