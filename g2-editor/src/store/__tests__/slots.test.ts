import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSlotsStore } from '@/store/slots';
import { useHistoryStore } from '@/store/history';
import { useDeviceStore, DeviceStatus } from '@/store/device';
import { MORPH_NAMES } from '@/types/patch';
import { runCliBatchSafe, runCliSafe } from '@/store/slotHelpers';

afterEach(() => vi.useRealTimers());

beforeEach(() => {
	setActivePinia(createPinia());
	(globalThis as any).window = { cli: { run: vi.fn().mockResolvedValue(undefined), runBatch: vi.fn().mockResolvedValue([]) } };
});

function makePatch(): any {
	return {
		description: { variation: 0 },
		areas: [
			{ modules: [], cableList: [] },
			{ modules: [], cableList: [] },
		],
	};
}

// Loads a real, parseable fixture as {name, rawHex} — needed wherever a test must reach
// _applyPatchOutput's full-reparse branch (a synthetic hex blob would throw as malformed).
async function loadFixture(): Promise<{ name: string; rawHex: string }> {
	const fs = await import('fs');
	const path = await import('path');
	const { fileURLToPath } = await import('url');
	const dirname = fileURLToPath(new URL('.', import.meta.url));
	const buf = fs.readFileSync(path.join(dirname, '../../../../test-patches/EmptyPatch.pch2'));
	const fileBytes = new Uint8Array(buf);
	let ofs = 0;
	while (ofs < fileBytes.length && fileBytes[ofs] !== 0) ofs++;
	const name = new TextDecoder().decode(fileBytes.slice(0, ofs));
	const rawHex = Array.from(fileBytes.slice(ofs + 3))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return { name, rawHex };
}

describe('_applyPatchOutput — malformed binary', () => {
	it('rejects empty data (null regex match)', async () => {
		const store = useSlotsStore();
		await expect(store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'test', data: '' }))).rejects.toThrow('Invalid patch hex for slot A');
	});

	it('rejects data that is too short for a valid patch', async () => {
		const store = useSlotsStore();
		// 2 hex chars = 1 byte — far too short for any valid pch2 structure
		await expect(store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'test', data: 'ab' }))).rejects.toThrow();
	});

	it('rejects when section bytes contain only zeros (corrupted header)', async () => {
		const store = useSlotsStore();
		// 40 zero bytes — valid hex format but invalid patch structure
		const zeroes = '00'.repeat(40);
		await expect(store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'test', data: zeroes }))).rejects.toThrow();
	});

	it('returns early without parsing when the hex matches what is already loaded', async () => {
		const store = useSlotsStore();
		// Seed the slot with a non-null patch and matching rawHex so the early-return path is taken
		const fakePatch = { description: { variation: 0 } } as any;
		store.slots['A'].rawHex = 'cafebabe';
		store.slots['A'].patch = fakePatch;
		const result = await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'cached', data: 'cafebabe' }));
		expect(result.rawHex).toBe('cafebabe');
		expect(result.name).toBe('cached');
	});
});

describe('breakJackConnection', () => {
	it('preserves userColour when splicing a star topology (driving output present)', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].cableList = [
			{ colour: 0, userColour: 0, smod: 0, scon: 0, dir: 1, dmod: 10, dcon: 0 }, // driving output -> module 10 input 0
			{ colour: 0, dir: 0, smod: 10, scon: 0, dmod: 11, dcon: 0 }, // neighbor 1
			{ colour: 0, dir: 0, smod: 10, scon: 0, dmod: 12, dcon: 0 }, // neighbor 2
		];
		store.slots['A'].patch = patch;

		await store.breakJackConnection(10, 0, 'input', 'voice');

		const spliced = patch.areas[1].cableList.filter((c: any) => c.smod === 0 && c.scon === 0);
		expect(spliced).toHaveLength(2);
		for (const c of spliced) expect(c.userColour).toBe(0);
	});

	it('preserves userColour when splicing with no driving source', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].cableList = [
			{ colour: 3, userColour: 3, dir: 0, smod: 10, scon: 0, dmod: 11, dcon: 0 },
			{ colour: 3, dir: 0, smod: 10, scon: 0, dmod: 12, dcon: 0 },
		];
		store.slots['A'].patch = patch;

		await store.breakJackConnection(10, 0, 'input', 'voice');

		const cables = patch.areas[1].cableList;
		expect(cables).toHaveLength(1);
		expect(cables[0].userColour).toBe(3);
	});
});

describe('paste', () => {
	it('preserves userColour on the pasted cable', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		const modInstance = (index: number) => ({ type: 1, index, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] });
		const entries = [
			{ src: modInstance(1), newId: 1, col: 0, row: 0 },
			{ src: modInstance(2), newId: 2, col: 3, row: 0 },
		];
		const cables = [{ newSmod: 1, newDmod: 2, colour: 1, userColour: 1, scon: 0, dcon: 0, dir: 1 }];

		await store.paste(entries as any, cables, 'voice');

		const pasted = patch.areas[1].cableList.find((c: any) => c.smod === 1 && c.dmod === 2);
		expect(pasted).toBeDefined();
		expect(pasted.userColour).toBe(1);
	});
});

describe('edited flag', () => {
	it('a mutating action marks the slot edited', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;
		expect(store.isSlotEdited('A')).toBe(false);

		await store.setModuleLabel(1, 'Foo', 'voice');

		expect(store.isSlotEdited('A')).toBe(true);
		expect(store.slots['A'].rawHex).toBeNull();
	});

	it('_applyPatchOutput clears the edited flag once a fresh parse completes', async () => {
		const { name, rawHex } = await loadFixture();

		const store = useSlotsStore();
		store.slots['A'].edited = true;
		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));

		expect(store.isSlotEdited('A')).toBe(false);
	});

	it('loadPatchFile resets the edited flag', () => {
		const store = useSlotsStore();
		store.slots['A'].edited = true;
		store.loadPatchFile('A', makePatch(), 'test');
		expect(store.isSlotEdited('A')).toBe(false);
	});

	it('loadPerformanceFile resets the edited flag for all 4 slots', () => {
		const store = useSlotsStore();
		for (const s of ['A', 'B', 'C', 'D'] as const) store.slots[s].edited = true;
		store.loadPerformanceFile([makePatch(), makePatch(), makePatch(), makePatch()], ['a', 'b', 'c', 'd'], 'perf', 'cafe');
		for (const s of ['A', 'B', 'C', 'D'] as const) expect(store.isSlotEdited(s)).toBe(false);
	});

	// Loads the fixture the way a hardware get-patch delivers it: section bytes with neither the
	// trailing CRC (2 bytes) nor the file-only empty notes section 0x6f 0x00 0x00 (3 bytes).
	async function loadHardwareStyleSlot(store: ReturnType<typeof useSlotsStore>): Promise<void> {
		const { rawHex } = await loadFixture();
		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'Fixture', data: rawHex.slice(0, -10) }));
	}

	// Asserts the saved bytes are [official text header][NUL][0x17][fileType][sections][CRC16 BE].
	function expectOfficialFileLayout(bytes: number[], type: string, fileType: number): void {
		const nul = bytes.indexOf(0);
		expect(new TextDecoder().decode(new Uint8Array(bytes.slice(0, nul)))).toBe(
			`Version=Nord Modular G2 File Format 1\r\nType=${type}\r\nVersion=23\r\nInfo=BUILD 320\r\n`,
		);
		expect(bytes.slice(nul + 1, nul + 3)).toEqual([0x17, fileType]);
		// The section train must end exactly 2 bytes before EOF: those 2 bytes are the CRC, not patch data.
		let pos = nul + 3;
		while (pos + 3 <= bytes.length) {
			const size = (bytes[pos + 1] << 8) | bytes[pos + 2];
			if (pos + 3 + size > bytes.length) break;
			pos += 3 + size;
		}
		expect(bytes.length - pos).toBe(2);
		// CRC-16/CCITT (poly 0x1021, init 0) over [0x17][fileType][sections].
		let crc = 0;
		for (const b of bytes.slice(nul + 1, -2)) {
			crc ^= b << 8;
			for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
		}
		expect((bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1]).toBe(crc);
	}

	it('saveSlot resets the edited flag after a successful save', async () => {
		const store = useSlotsStore();
		await loadHardwareStyleSlot(store);
		store.slots['A'].edited = true;
		(globalThis as any).window.electronAPI = { savePatch: vi.fn().mockResolvedValue(undefined) };

		await store.saveSlot('A', '/tmp/test.pch2');

		expect(store.isSlotEdited('A')).toBe(false);
	});

	it('saveSlot writes the official text header and a valid CRC even for an unedited hardware-loaded slot', async () => {
		const store = useSlotsStore();
		await loadHardwareStyleSlot(store);
		expect(store.slots['A'].edited).toBe(false);
		const savePatch = vi.fn().mockResolvedValue(undefined);
		(globalThis as any).window.electronAPI = { savePatch };

		await store.saveSlot('A', '/tmp/unedited.pch2');

		expect(savePatch).toHaveBeenCalledTimes(1);
		expectOfficialFileLayout(savePatch.mock.calls[0][1], 'Patch', 0x00);
	});

	it('savePerformance writes the official text header and a valid CRC', async () => {
		const fs = await import('fs');
		const path = await import('path');
		const { fileURLToPath } = await import('url');
		const { PatchParser, stripFileHeader } = await import('@/parser/nmg2PatchParser');
		const fixture = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../test-patches/EmptyPerf.prf2');
		const fileBytes = Array.from(fs.readFileSync(fixture));
		const prf2 = new PatchParser(new Uint8Array(fileBytes).buffer).parsePrf2()!;
		const store = useSlotsStore();
		store.loadPerformanceFile(prf2.patches, prf2.slotNames, 'EmptyPerf', stripFileHeader(fileBytes), undefined, prf2.globalParamPages);
		const savePatch = vi.fn().mockResolvedValue(undefined);
		(globalThis as any).window.electronAPI = { savePatch };

		await store.savePerformance('/tmp/perf.prf2');

		expect(savePatch).toHaveBeenCalledTimes(1);
		expectOfficialFileLayout(savePatch.mock.calls[0][1], 'Performance', 0x01);
	});

	it('savePerformance resets the edited flag for all 4 slots after a successful save', async () => {
		const store = useSlotsStore();
		for (const s of ['A', 'B', 'C', 'D'] as const) {
			store.slots[s].patch = makePatch();
			store.slots[s].edited = true;
		}
		store.performanceRawHex = '00'.repeat(20);
		(globalThis as any).window.electronAPI = { savePatch: vi.fn().mockResolvedValue(undefined) };
		vi.spyOn(await import('@/parser/nmg2PatchSerializer'), 'serializePerformance').mockReturnValue('00'.repeat(20));

		await store.savePerformance('/tmp/test.prf2');

		for (const s of ['A', 'B', 'C', 'D'] as const) expect(store.isSlotEdited(s)).toBe(false);
	});

	function toHex(bytes: number[]): string {
		return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	async function loadCapturedPerfFixture(): Promise<number[]> {
		const fs = await import('fs');
		const path = await import('path');
		const { fileURLToPath } = await import('url');
		const fixtures = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../test-patches');
		return Array.from(fs.readFileSync(path.join(fixtures, 'MorphingDrumDemo.prf2')));
	}

	it('savePerformance falls back to a live hardware fetch when no .prf2 was ever loaded (hardware-native perf mode)', async () => {
		const captured = await loadCapturedPerfFixture();
		const store = useSlotsStore();
		store.performanceRawHex = null; // nothing loaded from disk/browser this session
		const device = useDeviceStore();
		device.status = DeviceStatus.Connected;
		device.device = { mode: 'Performance' } as any;
		const cliRun = vi.fn().mockResolvedValue(JSON.stringify({ name: 'Live', size: captured.length, data: toHex(captured) }));
		(globalThis as any).window.cli.run = cliRun;
		(globalThis as any).window.electronAPI = { savePatch: vi.fn().mockResolvedValue(undefined) };

		await store.savePerformance('/tmp/live.prf2');

		expect(cliRun).toHaveBeenCalledWith(['get-perf-file-buf']);
		expect(store.performanceFilePath).toBe('/tmp/live.prf2');
	});

	it('savePerformance converts the captured performance bytes into file form (get-perf-file-buf returns USB form)', async () => {
		vi.restoreAllMocks(); // an earlier test in this block spies on serializePerformance
		const captured = await loadCapturedPerfFixture();

		const store = useSlotsStore();
		store.performanceRawHex = null;
		const device = useDeviceStore();
		device.status = DeviceStatus.Connected;
		device.device = { mode: 'Performance' } as any;
		(globalThis as any).window.cli.run = vi.fn().mockResolvedValue(JSON.stringify({ name: 'Live', size: captured.length, data: toHex(captured) }));
		const savePatch = vi.fn().mockResolvedValue(undefined);
		(globalThis as any).window.electronAPI = { savePatch };

		await store.savePerformance('/tmp/live.prf2');

		expect(savePatch).toHaveBeenCalledTimes(1);
		const [writtenPath, bytes] = savePatch.mock.calls[0];
		expect(writtenPath).toBe('/tmp/live.prf2');
		// The capture's own header survives byte for byte — only the sections are rewritten.
		const headerEnd = captured.indexOf(0) + 3;
		expect(bytes.slice(0, headerEnd)).toEqual(captured.slice(0, headerEnd));
		// Still a performance: first section 0x11, file-type byte 0x01.
		expect(bytes[headerEnd - 1]).toBe(0x01);
		expect(bytes[headerEnd]).toBe(0x11);
		// And it is genuinely re-encoded, not a copy of the bytes that were received.
		expect(bytes.length).not.toBe(captured.length);
	});

	it('savePerformance saves the raw captured bytes when they cannot be converted to file form', async () => {
		const store = useSlotsStore();
		store.performanceRawHex = null;
		const device = useDeviceStore();
		device.status = DeviceStatus.Connected;
		device.device = { mode: 'Performance' } as any;
		// Not a real .prf2 (no section markers) — parsePrf2() returns null, forcing the fallback.
		const garbage = new Array(40).fill(0);
		(globalThis as any).window.cli.run = vi.fn().mockResolvedValue(JSON.stringify({ name: 'Live', size: garbage.length, data: toHex(garbage) }));
		const savePatch = vi.fn().mockResolvedValue(undefined);
		(globalThis as any).window.electronAPI = { savePatch };
		// Conversion failure is the behaviour under test — expect and suppress its console.error.
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await store.savePerformance('/tmp/live.prf2');

		// Still gets a file, just the raw unconverted capture rather than silently dropping it.
		expect(savePatch).toHaveBeenCalledWith('/tmp/live.prf2', garbage);
		expect(store.performanceFilePath).toBe('/tmp/live.prf2');
		vi.restoreAllMocks();
	});

	it('savePerformance does nothing when performanceRawHex is null and the device is not live in Performance mode', async () => {
		const store = useSlotsStore();
		store.performanceRawHex = null;
		const device = useDeviceStore();
		device.status = DeviceStatus.Disconnected;
		const cliRun = vi.fn().mockResolvedValue(undefined);
		(globalThis as any).window.cli.run = cliRun;

		await store.savePerformance('/tmp/live.prf2');

		expect(cliRun).not.toHaveBeenCalled();
	});
});

describe('setMorphGroupLabel', () => {
	// The device's morph label block is fixed-size: all 8 groups (params 8-15), unnamed ones at their defaults.
	const morphCmd = (labels: string[]) => ['set-module-labels', 'A', 'patch', '1', ...labels.flatMap((l, i) => [String(8 + i), '1', l])];

	it('mutates patch.morphParamLabels, marks the slot dirty, and pushes the right CLI command', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.setMorphGroupLabel(0, 'Foo');

		expect(patch.morphParamLabels).toHaveLength(8);
		expect(patch.morphParamLabels![0]).toEqual({ paramIndex: 8, isString: true, paramLen: 8, labels: ['Foo'] });
		expect(store.isSlotEdited('A')).toBe(true);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(morphCmd(['Foo', ...MORPH_NAMES.slice(1)]));
	});

	it('sends all 8 groups in one command, keeping earlier renames (the device replaces the whole block)', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.setMorphGroupLabel(0, 'Mod');
		await store.setMorphGroupLabel(1, 'Wheel');
		await store.setMorphGroupLabel(3, 'Vel');

		expect((globalThis as any).window.cli.run).toHaveBeenLastCalledWith(morphCmd(['Mod', 'Wheel', MORPH_NAMES[2], 'Vel', ...MORPH_NAMES.slice(4)]));
	});

	it('updates the existing entry in place when the group is renamed again', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.setMorphGroupLabel(2, 'First');
		await store.setMorphGroupLabel(2, 'Second');

		expect(patch.morphParamLabels!.map((pl: any) => pl.labels[0])).toEqual([...MORPH_NAMES.slice(0, 2), 'Second', ...MORPH_NAMES.slice(3)]);
	});

	it('participates in undo/redo', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.setMorphGroupLabel(0, 'Foo');
		expect(patch.morphParamLabels?.find((pl: any) => pl.paramIndex === 8)?.labels[0]).toBe('Foo');

		await store.undo();
		expect(patch.morphParamLabels?.find((pl: any) => pl.paramIndex === 8)?.labels[0]).toBe('Wheel');

		await store.redo();
		expect(patch.morphParamLabels?.find((pl: any) => pl.paramIndex === 8)?.labels[0]).toBe('Foo');
	});
});

describe('pasteParams', () => {
	function moduleInstance(index: number, type: number, pcnt: number, modes: number[]): any {
		return { type, index, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt, lv: [], modes };
	}

	function withVariations(voiceValues: number[]): any[] {
		return Array.from({ length: 9 }, () => ({ fx: {}, voice: { 2: [...voiceValues] }, patch: {} }));
	}

	it('applies param and mode values to the target module, marks dirty, and pushes the matching CLI commands', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		const target = moduleInstance(2, 5, 2, [9]);
		patch.areas[1].modules = [target];
		store.slots['A'].patch = patch;
		store.slots['A'].variations = withVariations([0, 0]);

		await store.pasteParams([{ targetId: 2, paramValues: [10, 20], modeValues: [3] }], 0, 'voice');

		expect(store.slots['A'].variations![0].voice[2]).toEqual([10, 20]);
		expect(target.modes).toEqual([3]);
		expect(store.isSlotEdited('A')).toBe(true);
		expect((globalThis as any).window.cli.runBatch).toHaveBeenCalledWith([
			['set-param', 'A', 'va', '2', '0', '10', '0'],
			['set-param', 'A', 'va', '2', '1', '20', '0'],
			['set-module-mode', 'A', 'va', '2', '0', '3'],
		]);
	});

	it('participates in undo/redo as a single combined step', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		const target = moduleInstance(2, 5, 1, [0]);
		patch.areas[1].modules = [target];
		store.slots['A'].patch = patch;
		store.slots['A'].variations = withVariations([64]);

		await store.pasteParams([{ targetId: 2, paramValues: [100], modeValues: [1] }], 0, 'voice');
		expect(store.slots['A'].variations![0].voice[2]).toEqual([100]);
		expect(target.modes).toEqual([1]);

		await store.undo();
		expect(store.slots['A'].variations![0].voice[2]).toEqual([64]);
		expect(target.modes).toEqual([0]);

		await store.redo();
		expect(store.slots['A'].variations![0].voice[2]).toEqual([100]);
		expect(target.modes).toEqual([1]);
	});

	it('does nothing when given an empty pairs list', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();

		await store.pasteParams([], 0, 'voice');

		expect((globalThis as any).window.cli.runBatch).not.toHaveBeenCalled();
	});
});

describe('undo/redo coverage for text, name, and description fields', () => {
	it('setPatchText participates in undo/redo', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.text = 'hello';
		store.slots['A'].patch = patch;

		store.setPatchText('A', 'hello world');
		expect(patch.text).toBe('hello world');

		await store.undo();
		expect(patch.text).toBe('hello');

		await store.redo();
		expect(patch.text).toBe('hello world');
	});

	it('setPatchText targets the given slot regardless of which slot is focused (slot-switch race fix)', () => {
		const store = useSlotsStore();
		const patchA = makePatch();
		patchA.text = 'A original';
		const patchB = makePatch();
		patchB.text = 'B original';
		store.slots['A'].patch = patchA;
		store.slots['B'].patch = patchB;
		// uiStore.slotInFocus defaults to 'A', but we're explicitly targeting 'B' —
		// simulates a debounced commit firing after the user already switched away from B.
		store.setPatchText('B', 'B edited');

		expect(patchB.text).toBe('B edited');
		expect(patchA.text).toBe('A original');
		expect(store.slots['B'].textDirty).toBe(true);
		expect(store.slots['A'].textDirty).toBe(false);
	});

	it('setPatchName participates in undo/redo and marks the slot edited', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		store.slots['A'].name = 'Old Name';

		await store.setPatchName('New Name');
		expect(store.slots['A'].name).toBe('New Name');
		expect(store.isSlotEdited('A')).toBe(true);

		await store.undo();
		expect(store.slots['A'].name).toBe('Old Name');

		await store.redo();
		expect(store.slots['A'].name).toBe('New Name');
	});

	for (const field of ['category', 'monopoly', 'voices', 'height'] as const) {
		it(`setPatchDescriptionField('${field}') participates in undo/redo and marks the slot edited`, async () => {
			const store = useSlotsStore();
			const patch = makePatch();
			patch.description[field] = 1;
			store.slots['A'].patch = patch;

			store.setPatchDescriptionField(field, 42);
			expect(patch.description[field]).toBe(42);
			expect(store.isSlotEdited('A')).toBe(true);

			await store.undo();
			expect(patch.description[field]).toBe(1);

			await store.redo();
			expect(patch.description[field]).toBe(42);
		});
	}
});

describe('undo() clears the dirty flag once the stack is empty', () => {
	it('clears edited after undoing the only edit', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		store.slots['A'].name = 'Old';

		await store.setPatchName('New');
		expect(store.isSlotEdited('A')).toBe(true);

		await store.undo();
		expect(store.isSlotEdited('A')).toBe(false);
	});

	it('leaves edited set while earlier entries remain', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		store.slots['A'].name = 'Old';

		await store.setPatchName('Mid');
		await store.setPatchName('New');
		expect(store.isSlotEdited('A')).toBe(true);

		await store.undo(); // back to 'Mid' — one earlier entry (Old → Mid) still in the stack
		expect(store.slots['A'].name).toBe('Mid');
		expect(store.isSlotEdited('A')).toBe(true);
	});
});

describe('_applyPatchOutput / loadSlot — preserveHistory', () => {
	it('preserveHistory=true keeps undo history and the dirty flag (hardware-echo resync after our own edit)', async () => {
		const { name, rawHex } = await loadFixture();
		const store = useSlotsStore();
		const hist = useHistoryStore();

		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));
		// Simulate having just made a structural edit: dirty, one undo entry recorded, and the
		// edit's own _markSlotDirty already nulled rawHex — exactly the state a real add/move/
		// delete-module action leaves behind right before the hardware's version-change echo arrives.
		store.slots['A'].edited = true;
		hist.record('A', { undo: async () => {}, redo: async () => {} });
		store.slots['A'].rawHex = null;

		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }), true);

		expect(store.isSlotEdited('A')).toBe(true);
		expect(hist.canUndo('A')).toBe(true);
	});

	it('preserveHistory=false (default) clears undo history and the dirty flag (genuine fresh load)', async () => {
		const { name, rawHex } = await loadFixture();
		const store = useSlotsStore();
		const hist = useHistoryStore();

		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));
		store.slots['A'].edited = true;
		hist.record('A', { undo: async () => {}, redo: async () => {} });
		store.slots['A'].rawHex = null;

		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));

		expect(store.isSlotEdited('A')).toBe(false);
		expect(hist.canUndo('A')).toBe(false);
	});

	it('loadSlot forwards preserveHistory to _applyPatchOutput', async () => {
		const { name, rawHex } = await loadFixture();
		const store = useSlotsStore();
		const hist = useHistoryStore();
		(globalThis as any).window.cli.run = vi.fn().mockResolvedValue(JSON.stringify({ slot: 'A', name, data: rawHex }));

		await store.loadSlot('A');
		store.slots['A'].edited = true;
		hist.record('A', { undo: async () => {}, redo: async () => {} });
		store.slots['A'].rawHex = null;

		await store.loadSlot('A', true);

		expect(store.isSlotEdited('A')).toBe(true);
		expect(hist.canUndo('A')).toBe(true);
	});
});

// Offline mode (no daemon/device): window.cli.run/runBatch reject immediately. Before the fix,
// these actions pushed to hardware BEFORE calling hist.record — an unguarded rejection aborted
// the function early, so the edit never made it into the undo stack even though the local patch
// mutation had already happened.
describe('module add/move/delete record undo even when the CLI/hardware call fails (offline)', () => {
	function moduleStub(index: number) {
		return { index, type: 5, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] };
	}

	beforeEach(() => {
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('Daemon not running'));
		(globalThis as any).window.cli.runBatch = vi.fn().mockRejectedValue(new Error('Daemon not running'));
		// These tests deliberately exercise the "CLI failed" warning paths — expect and suppress them.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => vi.restoreAllMocks());

	it('addModule records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.addModule(5, 1, 0, 0, 'voice');

		expect(patch.areas[1].modules.some((m: any) => m.index === 1)).toBe(true);
		expect(store.isSlotEdited('A')).toBe(true);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('dropModuleWithCollision (drag-from-palette / QuickAddModule add) records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.dropModuleWithCollision(5, 0, 0, 'voice', patch.areas[1].modules);

		expect(patch.areas[1].modules).toHaveLength(1);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('moveModulesWithCollision records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [moduleStub(1)];
		store.slots['A'].patch = patch;

		await store.moveModulesWithCollision([1], 1, 0, 'voice', patch.areas[1].modules);

		expect(patch.areas[1].modules[0].horiz).toBe(1);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('deleteSelection records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [moduleStub(1)];
		store.slots['A'].patch = patch;

		await store.deleteSelection([1], [], 'voice', patch.areas[1].modules, patch.areas[1].cableList);

		expect(patch.areas[1].modules).toHaveLength(0);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('deleteModule records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [moduleStub(1)];
		store.slots['A'].patch = patch;

		await store.deleteModule(1, 'voice');

		expect(patch.areas[1].modules).toHaveLength(0);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});
});

describe('addModule default name suffix', () => {
	beforeEach(() => {
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('Daemon not running'));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => vi.restoreAllMocks());

	it('numbers same-type modules by count, ignoring unrelated instance IDs', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.addModule(26, 7, 0, 0, 'voice'); // LfoA (short "LfoA"), instance id 7
		await store.addModule(5, 12, 1, 0, 'voice'); // unrelated Invert module, instance id 12
		await store.addModule(26, 20, 2, 0, 'voice'); // second LfoA, instance id 20

		const modules = patch.areas[1].modules;
		expect(modules.find((m: any) => m.index === 7).uname).toBe('LfoA1');
		expect(modules.find((m: any) => m.index === 20).uname).toBe('LfoA2');
	});

	it('continues from the highest existing suffix, even across areas', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[0].modules = [{ type: 26, index: 1, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [], uname: 'LfoA5' }];
		store.slots['A'].patch = patch;

		await store.addModule(26, 2, 0, 0, 'voice');

		expect(patch.areas[1].modules[0].uname).toBe('LfoA6');
	});

	it('starts at 1 when no same-type module has a parseable suffix', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [{ type: 26, index: 1, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [], uname: 'Bass' }];
		store.slots['A'].patch = patch;

		await store.addModule(26, 2, 1, 0, 'voice');

		expect(patch.areas[1].modules[1].uname).toBe('LfoA1');
	});
});

// Uses the root beforeEach's resolved CLI mock — this block tests the module-swap mutation
// logic itself, not offline resilience (that's covered above), so the CLI call should succeed.
describe('replaceModule', () => {
	// FltClassic (92) -> FltLP (87): both are real nmg2mods.ts entries. FltClassic's In (red, jack
	// 0) has an equivalent on FltLP so its cable should survive; FltClassic's PitchVar (purple,
	// jack 1) has no equivalent on FltLP (which only has Pitch, not PitchVar) so its cable should
	// be dropped, mirroring the real editor's silent-drop-if-unmapped behaviour.
	const FLT_CLASSIC = 92;
	const FLT_LP = 87;

	function fltClassicStub(index: number) {
		return { index, type: FLT_CLASSIC, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] };
	}

	it('changes the module type while keeping the same index, and records one undo entry', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [fltClassicStub(1)];
		store.slots['A'].patch = patch;
		const pastDepth = () => (useHistoryStore() as any).slots.A.past.length;

		await store.replaceModule(1, FLT_LP, 'voice');

		expect(patch.areas[1].modules).toHaveLength(1);
		expect(patch.areas[1].modules[0].index).toBe(1);
		expect(patch.areas[1].modules[0].type).toBe(FLT_LP);
		expect(useHistoryStore().canUndo('A')).toBe(true);
		expect(pastDepth()).toBe(1); // one consolidated entry, not one per internal deleteModule/addModule step
	});

	it('keeps a cable on a jack that exists on the new module, drops one that does not', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [fltClassicStub(1)];
		patch.areas[1].cableList = [
			{ colour: 0, smod: 1, scon: 0, dir: 1, dmod: 9, dcon: 0 }, // FltClassic In (red) -> some other module
			{ colour: 0, smod: 1, scon: 1, dir: 1, dmod: 9, dcon: 1 }, // FltClassic PitchVar (purple) -> some other module
		];
		store.slots['A'].patch = patch;

		await store.replaceModule(1, FLT_LP, 'voice');

		const remainingCables = patch.areas[1].cableList.filter((c: any) => c.smod === 1 || c.dmod === 1);
		expect(remainingCables).toHaveLength(1);
		expect(remainingCables[0].scon).toBe(0); // FltLP's In is jack 0 too
	});

	it('sends del-cable before del-module, and add-cable in a frame after add-module', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [fltClassicStub(1)];
		patch.areas[1].cableList = [{ colour: 0, smod: 1, scon: 0, dir: 1, dmod: 9, dcon: 0 }];
		store.slots['A'].patch = patch;
		const runBatch = (globalThis as any).window.cli.runBatch as ReturnType<typeof vi.fn>;
		runBatch.mockClear();

		await store.replaceModule(1, FLT_LP, 'voice');

		const batches: string[][][] = runBatch.mock.calls.map((c: any[]) => c[0]);
		const names = batches.map((b) => b.map((cmd) => cmd[0]));
		expect(names[0]).toEqual(['del-cable', 'del-module']);
		const addModuleIdx = names.findIndex((b) => b.includes('add-module'));
		const addCableIdx = names.findIndex((b) => b.includes('add-cable'));
		expect(addModuleIdx).toBeGreaterThan(0);
		expect(addCableIdx).toBeGreaterThan(addModuleIdx);
		expect(names[addModuleIdx]).not.toContain('add-cable');
	});

	it('undo restores the original module type and cables', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [fltClassicStub(1)];
		patch.areas[1].cableList = [{ colour: 0, smod: 1, scon: 0, dir: 1, dmod: 9, dcon: 0 }];
		store.slots['A'].patch = patch;

		await store.replaceModule(1, FLT_LP, 'voice');
		expect(patch.areas[1].modules[0].type).toBe(FLT_LP);

		await store.undo();

		expect(patch.areas[1].modules[0].type).toBe(FLT_CLASSIC);
		expect(patch.areas[1].cableList.filter((c: any) => c.smod === 1 || c.dmod === 1)).toHaveLength(1);
	});

	it('pushes a module below down when the replacement is taller, and undo restores its position', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [
			{ index: 1, type: FLT_LP, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] },
			{ index: 2, type: FLT_LP, horiz: 0, vert: 2, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] },
		];
		store.slots['A'].patch = patch;

		// FltLP (height 2) -> FltClassic (height 4): the module directly below must move out of the way.
		await store.replaceModule(1, FLT_CLASSIC, 'voice');

		const below = patch.areas[1].modules.find((m: any) => m.index === 2);
		expect(below.vert).toBe(4);

		await store.undo();

		const belowAfterUndo = patch.areas[1].modules.find((m: any) => m.index === 2);
		expect(belowAfterUndo.vert).toBe(2);
	});
});

describe('cable add/color/delete record undo even when the CLI/hardware call fails (offline)', () => {
	beforeEach(() => {
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('Daemon not running'));
		(globalThis as any).window.cli.runBatch = vi.fn().mockRejectedValue(new Error('Daemon not running'));
		// These tests deliberately exercise the "CLI failed" warning paths — expect and suppress them.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => vi.restoreAllMocks());

	it('addCable records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.addCable(1, 1, 0, 2, 0, 0, 'voice', 1);

		expect(patch.areas[1].cableList).toHaveLength(1);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('setCableColor records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].cableList = [{ colour: 1, smod: 1, scon: 0, dir: 1, dmod: 2, dcon: 0 }];
		store.slots['A'].patch = patch;

		await store.setCableColor(2, 0, 'input', 5, 'voice');

		expect(patch.areas[1].cableList[0].colour).toBe(5);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it('deleteConnectedCables records undo despite a rejected CLI call', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].cableList = [{ colour: 1, smod: 1, scon: 0, dir: 1, dmod: 2, dcon: 0 }];
		store.slots['A'].patch = patch;

		await store.deleteConnectedCables(2, 0, 'input', 'voice');

		expect(patch.areas[1].cableList).toHaveLength(0);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});
});

// Deleting a still-morphed module corrupted the G2 until power-off (it then NACKed every add of
// module types 58-61), so the morph ranges must be zeroed on the device before the del-module.
describe('module delete zeroes its morph ranges on the device first', () => {
	function setup() {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [{ index: 1, type: 5, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] }];
		store.slots['A'].patch = patch;
		store.slots['A'].variations = [
			{ fx: {}, voice: {}, patch: { morphAssignments: [] } },
			{ fx: {}, voice: {}, patch: { morphAssignments: [{ groupIndex: 5, location: 1, moduleIndex: 1, paramIndex: 3, range: 127 }] } },
		] as any;
		useDeviceStore().status = DeviceStatus.Connected;
		const sent: string[][] = [];
		(globalThis as any).window.cli.run = vi.fn(async (cmd: string[]) => void sent.push(cmd));
		(globalThis as any).window.cli.runBatch = vi.fn(async (cmds: string[][]) => (sent.push(...cmds), []));
		return { store, patch, sent };
	}
	const zeroed = ['set-morph-range-batch', 'A', 'va', '1', '3', '0', '5', '1'];

	it('deleteModule', async () => {
		const { store, sent } = setup();
		await store.deleteModule(1, 'voice');
		expect(sent.findIndex((c) => c.join() === zeroed.join())).toBeGreaterThanOrEqual(0);
		expect(sent.findIndex((c) => c.join() === zeroed.join())).toBeLessThan(sent.findIndex((c) => c[0] === 'del-module'));
	});

	it('deleteSelection', async () => {
		const { store, patch, sent } = setup();
		await store.deleteSelection([1], [], 'voice', patch.areas[1].modules, patch.areas[1].cableList);
		expect(sent.findIndex((c) => c.join() === zeroed.join())).toBeGreaterThanOrEqual(0);
		expect(sent.findIndex((c) => c.join() === zeroed.join())).toBeLessThan(sent.findIndex((c) => c[0] === 'del-module'));
	});
});

// Deleting an audio source recolors the cables that remain (uprate lost); undo must recolor them back.
describe('delete undo restores colours of remaining cables', () => {
	const NOISE = 31; // red output
	const LEV_AMP = 81; // purple in, purple out
	const RED = 0,
		BLUE = 1;

	function setup() {
		const store = useSlotsStore();
		const patch = makePatch();
		const mod = (index: number, type: number) => ({ index, type, horiz: 0, vert: index, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] });
		patch.areas[1].modules = [mod(1, NOISE), mod(2, LEV_AMP), mod(3, LEV_AMP)];
		patch.areas[1].cableList = [
			{ colour: RED, smod: 1, scon: 0, dir: 1, dmod: 2, dcon: 0 },
			{ colour: RED, smod: 2, scon: 0, dir: 1, dmod: 3, dcon: 0 },
		];
		store.slots['A'].patch = patch;
		store._syncUprateAndColors('A', patch, 1);
		const remaining = () => patch.areas[1].cableList.find((c: any) => c.smod === 2 && c.dmod === 3);
		return { store, patch, remaining };
	}

	it('deleteSelection', async () => {
		const { store, patch, remaining } = setup();
		await store.deleteSelection([1], [], 'voice', patch.areas[1].modules, patch.areas[1].cableList);
		expect(remaining().colour).toBe(BLUE);
		await store.undo();
		expect(remaining().colour).toBe(RED);
		expect(patch.areas[1].modules.find((m: any) => m.index === 2).uprate).toBe(1);
	});

	it('deleteModule', async () => {
		const { store, patch, remaining } = setup();
		await store.deleteModule(1, 'voice');
		expect(remaining().colour).toBe(BLUE);
		await store.undo();
		expect(remaining().colour).toBe(RED);
		expect(patch.areas[1].modules.find((m: any) => m.index === 2).uprate).toBe(1);
	});
});

// The G2 ignores add-module's param values, so a re-created module must get a set-param for every
// value that differs from the hardware default — variation 0 included (replace/paste/undo drifted).
describe('re-created module sends its non-default params for every variation', () => {
	const ENV_ADDSR = 119; // hardware defaults [1, 0, 0, 54, 100, 54, 70, 14, 1, 0, 0]

	it('deleteModule undo', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		const lv = [1, 0, 0, 54, 127, 54, 70, 14, 1, 0, 0];
		patch.areas[1].modules = [{ index: 4, type: ENV_ADDSR, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 11, lv, modes: [] }];
		store.slots['A'].patch = patch;
		store.slots['A'].variations = [
			{ fx: {}, voice: { 4: [...lv] }, patch: { morphAssignments: [] } },
			{ fx: {}, voice: { 4: [...lv] }, patch: { morphAssignments: [] } },
		] as any;
		await store.deleteModule(4, 'voice');
		const runBatch = (globalThis as any).window.cli.runBatch as ReturnType<typeof vi.fn>;
		runBatch.mockClear();

		await store.undo();

		const sent: string[][] = runBatch.mock.calls.flatMap((c: any[]) => c[0]);
		const setParams = sent.filter((c) => c[0] === 'set-param').map((c) => c.slice(3).join(' '));
		expect(setParams).toEqual(['4 4 127 0', '4 4 127 1']);
	});
});

describe('undo after an echo reload replaced the patch object', () => {
	const FLT_CLASSIC = 92;
	const FLT_LP = 87;

	function stub(index: number, type = 5, vert = 0) {
		return { index, type, horiz: 0, vert, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] };
	}

	// Simulates _applyPatchOutput's echo reload: same content, new patch object.
	function reload(store: ReturnType<typeof useSlotsStore>) {
		const fresh = JSON.parse(JSON.stringify(store.slots['A'].patch));
		store.slots['A'].patch = fresh;
		return fresh;
	}

	it('deleteModule undo restores the module into the reloaded patch', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [stub(1)];
		store.slots['A'].patch = patch;

		await store.deleteModule(1, 'voice');
		const fresh = reload(store);
		await store.undo();

		expect(fresh.areas[1].modules.map((m: any) => m.index)).toEqual([1]);
		expect(patch.areas[1].modules).toHaveLength(0);
	});

	it('deleteModule drops its morph assignments and undo restores them', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [stub(1)];
		store.slots['A'].patch = patch;
		store.slots['A'].variations = [
			{ fx: {}, voice: { 1: [] }, patch: { morphAssignments: [{ groupIndex: 0, location: 1, moduleIndex: 1, paramIndex: 0, range: 5 }] } },
		] as any;

		await store.deleteModule(1, 'voice');
		expect(store.slots['A'].variations![0].patch.morphAssignments).toEqual([]);

		await store.undo();
		expect(store.slots['A'].variations![0].patch.morphAssignments).toHaveLength(1);
	});

	it('deleteSelection drops controllers + morph assignments and undo restores them (into the reloaded patch)', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [stub(1), stub(2, 5, 2)];
		store.slots['A'].patch = patch;
		store.slots['A'].controllers = [
			{ cc: 5, location: 1, moduleIndex: 1, paramIndex: 0 },
			{ cc: 6, location: 1, moduleIndex: 2, paramIndex: 0 },
		];
		store.slots['A'].variations = [
			{ fx: {}, voice: {}, patch: { morphAssignments: [{ groupIndex: 0, location: 1, moduleIndex: 1, paramIndex: 0, range: 5 }] } },
		] as any;

		await store.deleteSelection([1], [], 'voice', patch.areas[1].modules, patch.areas[1].cableList);
		expect(store.slots['A'].controllers.map((c) => c.cc)).toEqual([6]);
		expect(store.slots['A'].variations![0].patch.morphAssignments).toEqual([]);

		const fresh = reload(store);
		await store.undo();

		expect(fresh.areas[1].modules.map((m: any) => m.index).sort()).toEqual([1, 2]);
		expect(store.slots['A'].controllers.map((c) => c.cc).sort()).toEqual([5, 6]);
		expect(store.slots['A'].variations![0].patch.morphAssignments).toHaveLength(1);
		const batches = (globalThis as any).window.cli.runBatch.mock.calls.flatMap((c: any[]) => c[0]);
		expect(batches.some((cmd: string[]) => cmd[0] === 'assign-midicc-batch')).toBe(true);
	});

	it('replaceModule undo removes the replacement on the device first and restores into the reloaded patch', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [stub(1, FLT_CLASSIC)];
		store.slots['A'].patch = patch;

		await store.replaceModule(1, FLT_LP, 'voice');
		const fresh = reload(store);
		const runBatch = (globalThis as any).window.cli.runBatch as ReturnType<typeof vi.fn>;
		const run = (globalThis as any).window.cli.run as ReturnType<typeof vi.fn>;
		runBatch.mockClear();
		run.mockClear();

		await store.undo();

		expect(fresh.areas[1].modules).toHaveLength(1); // no duplicate index
		expect(fresh.areas[1].modules[0].type).toBe(FLT_CLASSIC);
		const order = [...runBatch.mock.calls.flatMap((c: any[]) => c[0]), ...run.mock.calls.map((c: any[]) => c[0])].map((cmd: string[]) => cmd[0]);
		expect(order.indexOf('del-module')).toBeGreaterThanOrEqual(0);
		expect(order.indexOf('del-module')).toBeLessThan(order.indexOf('add-module'));
	});

	it('addCable undo removes the cable from the reloaded patch', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();

		await store.addCable(1, 1, 0, 2, 0, 0, 'voice', 1);
		const fresh = reload(store);
		await store.undo();

		expect(fresh.areas[1].cableList).toHaveLength(0);
	});

	it('deleteConnectedCables undo re-adds the cable to the reloaded patch', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].cableList = [{ colour: 1, smod: 1, scon: 0, dir: 1, dmod: 2, dcon: 0 }];
		store.slots['A'].patch = patch;

		await store.deleteConnectedCables(2, 0, 'input', 'voice');
		const fresh = reload(store);
		await store.undo();

		expect(fresh.areas[1].cableList).toHaveLength(1);
	});

	it('setCableColor undo restores the colour in the reloaded patch', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].cableList = [{ colour: 1, smod: 1, scon: 0, dir: 1, dmod: 2, dcon: 0 }];
		store.slots['A'].patch = patch;

		await store.setCableColor(2, 0, 'input', 5, 'voice');
		const fresh = reload(store);
		await store.undo();

		expect(fresh.areas[1].cableList[0].colour).toBe(1);
	});

	it('breakJackConnection (_swapCables) undo restores the cables in the reloaded patch', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].cableList = [
			{ colour: 0, smod: 0, scon: 0, dir: 1, dmod: 10, dcon: 0 },
			{ colour: 0, smod: 10, scon: 0, dir: 0, dmod: 11, dcon: 0 },
		];
		store.slots['A'].patch = patch;

		await store.breakJackConnection(10, 0, 'input', 'voice');
		const fresh = reload(store);
		await store.undo();

		expect(fresh.areas[1].cableList).toHaveLength(2);
	});

	it('moveModulesWithCollision undo moves the module back in the reloaded patch', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [stub(1)];
		store.slots['A'].patch = patch;

		await store.moveModulesWithCollision([1], 1, 0, 'voice', patch.areas[1].modules);
		const fresh = reload(store);
		await store.undo();

		expect(fresh.areas[1].modules[0].horiz).toBe(0);
	});

	it('moveModulesWithCollision with unknown indices is a no-op and records nothing', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();

		expect(await store.moveModulesWithCollision([99], 1, 0, 'voice', [])).toBeNull();
		expect(useHistoryStore().canUndo('A')).toBe(false);
	});

	it('setParamLabel on a missing module records nothing', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();

		await store.setParamLabel(42, 0, 'x', 'voice');
		expect(useHistoryStore().canUndo('A')).toBe(false);
	});

	it('paste undo removes the pasted module from the reloaded patch', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();

		await store.paste([{ src: stub(0) as any, newId: 3, col: 0, row: 0 }], [], 'voice');
		const fresh = reload(store);
		await store.undo();

		expect(fresh.areas[1].modules).toHaveLength(0);
	});
});

describe('pushPatchToDevice', () => {
	function seedDirtyPatch() {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;
		// Simulates rawHex cached straight from hardware (get-patch/slot_data) — NO trailing CRC,
		// since g2_get_patch's patch_usb_to_pch2 strips it on read. templateRawHex is what a real
		// hardware load always sets alongside it.
		store.slots['A'].rawHex = '00'.repeat(20);
		store.slots['A'].templateRawHex = '00'.repeat(20);
		store.slots['A'].textDirty = true;
		return store;
	}

	it('pushes via upload-patch-data, always force-reserializing rather than trusting a cached rawHex that may lack the CRC upload-patch expects', async () => {
		const store = seedDirtyPatch();
		useDeviceStore().status = DeviceStatus.Connected;
		const runSpy = (globalThis as any).window.cli.run;
		const serializeSpy = vi.spyOn(await import('@/parser/nmg2PatchSerializer'), 'serializePatch').mockReturnValue('ab'.repeat(20) + 'cdef');

		const result = await store.pushPatchToDevice('A');

		expect(result).toBe(true);
		expect(serializeSpy).toHaveBeenCalled(); // re-serialized despite rawHex already being cached/non-null
		expect(store.slots['A'].rawHex).toBe('ab'.repeat(20) + 'cdef'); // cache updated with the CRC-safe result
		expect(store.slots['A'].textDirty).toBe(false);
		expect(runSpy).toHaveBeenCalledWith(['upload-patch-data', 'A', expect.any(Array)]);
	});

	it('no-ops when the slot is not dirty — never re-upload an untouched slot', async () => {
		const store = seedDirtyPatch();
		store.slots['A'].textDirty = false;
		useDeviceStore().status = DeviceStatus.Connected;

		const result = await store.pushPatchToDevice('A');

		expect(result).toBe(false);
		expect((globalThis as any).window.cli.run).not.toHaveBeenCalledWith(expect.arrayContaining(['upload-patch-data']));
	});

	it('no-ops (stays dirty) when not connected', async () => {
		const store = seedDirtyPatch();
		useDeviceStore().status = DeviceStatus.Disconnected;

		const result = await store.pushPatchToDevice('A');

		expect(result).toBe(false);
		expect(store.slots['A'].textDirty).toBe(true);
	});

	it('no-ops (stays dirty) when an upload is already in flight', async () => {
		const store = seedDirtyPatch();
		useDeviceStore().status = DeviceStatus.Connected;
		store.uploadingFromFile = true;

		const result = await store.pushPatchToDevice('A');

		expect(result).toBe(false);
		expect(store.slots['A'].textDirty).toBe(true);
	});
});

describe('downloadToSynthSlot — Download to Slot', () => {
	function seedPatch() {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;
		store.slots['A'].templateRawHex = '00'.repeat(20);
		store.slots['A'].name = 'My Patch';
		return store;
	}

	it('uploads the source slot patch into the target slot when connected, then reloads the target from hardware', async () => {
		vi.useFakeTimers();
		try {
			const store = seedPatch();
			useDeviceStore().status = DeviceStatus.Connected;
			const runSpy = (globalThis as any).window.cli.run;
			const loadSlotSpy = vi.spyOn(store, 'loadSlot');

			const resultPromise = store.downloadToSynthSlot('A', 'C');
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result).toBe(true);
			expect(runSpy).toHaveBeenCalledWith(['upload-patch-data', 'C', expect.any(Array)]);
			expect(loadSlotSpy).toHaveBeenCalledWith('C', true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not reload the target slot when the upload fails', async () => {
		const store = seedPatch();
		useDeviceStore().status = DeviceStatus.Connected;
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('USB error'));
		const loadSlotSpy = vi.spyOn(store, 'loadSlot');
		// Upload failure is the behaviour under test — expect and suppress its console.error.
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await store.downloadToSynthSlot('A', 'C');

		expect(result).toBe(false);
		expect(loadSlotSpy).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	});

	it('no-ops when not connected', async () => {
		const store = seedPatch();
		useDeviceStore().status = DeviceStatus.Disconnected;

		const result = await store.downloadToSynthSlot('A', 'B');

		expect(result).toBe(false);
	});

	it('no-ops when the source slot has no patch', async () => {
		const store = seedPatch();
		store.slots['A'].patch = null as any;
		useDeviceStore().status = DeviceStatus.Connected;

		const result = await store.downloadToSynthSlot('A', 'B');

		expect(result).toBe(false);
	});
});

describe('_reloadSlotAfterUpload — retry with backoff', () => {
	it('stops retrying as soon as loadSlot succeeds', async () => {
		vi.useFakeTimers();
		try {
			const store = useSlotsStore();
			const loadSlotSpy = vi
				.spyOn(store, 'loadSlot')
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({ name: 'x', rawHex: '', patch: makePatch() });

			const reloadPromise = store._reloadSlotAfterUpload('A');
			await vi.runAllTimersAsync();
			await reloadPromise;

			expect(loadSlotSpy).toHaveBeenCalledTimes(3);
		} finally {
			vi.useRealTimers();
		}
	});

	it('gives up after 3 failed attempts', async () => {
		vi.useFakeTimers();
		try {
			const store = useSlotsStore();
			const loadSlotSpy = vi.spyOn(store, 'loadSlot').mockResolvedValue(null);

			const reloadPromise = store._reloadSlotAfterUpload('A');
			await vi.runAllTimersAsync();
			await reloadPromise;

			expect(loadSlotSpy).toHaveBeenCalledTimes(3);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('downloadPerformanceToSynth — Performance Download', () => {
	it('uploads the local performance via upload-perf-data when connected, then reloads all 4 slots from hardware', async () => {
		vi.useFakeTimers();
		try {
			const store = useSlotsStore();
			for (const s of ['A', 'B', 'C', 'D'] as const) {
				store.slots[s].patch = makePatch();
				store.slots[s].variations = [];
			}
			store.performanceName = 'My Perf';
			store.performanceRawHex = '00'.repeat(80);
			useDeviceStore().status = DeviceStatus.Connected;
			// Mocked rather than a passthrough spy: the reload itself isn't under test here, and a
			// passthrough would hit the CLI stub's undefined response and fail to parse it as JSON.
			const loadSlotSpy = vi.spyOn(store, 'loadSlot').mockResolvedValue({ name: 'x', rawHex: '', patch: makePatch() } as any);

			const resultPromise = store.downloadPerformanceToSynth();
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result).toBe(true);
			expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['upload-perf-data', expect.any(Array)]);
			for (const s of ['A', 'B', 'C', 'D'] as const) {
				expect(loadSlotSpy).toHaveBeenCalledWith(s, true);
			}
		} finally {
			vi.useRealTimers();
		}
	});

	it('refuses without a .prf2 template when the slots have no templates to rebuild from', async () => {
		const store = useSlotsStore();
		for (const s of ['A', 'B', 'C', 'D'] as const) store.slots[s].patch = makePatch();
		useDeviceStore().status = DeviceStatus.Connected;

		const result = await store.downloadPerformanceToSynth();

		expect(result).toBe(false);
		expect((globalThis as any).window.cli.run).not.toHaveBeenCalledWith(expect.arrayContaining(['upload-perf-data']));
	});

	it('rebuilds a G2-loaded performance (no .prf2 template) from the slot templates and device perf settings', async () => {
		vi.useFakeTimers();
		try {
			const store = useSlotsStore();
			const device = useDeviceStore();
			for (const s of ['A', 'B', 'C', 'D'] as const) {
				store.slots[s].patch = makePatch();
				store.slots[s].variations = [];
				store.slots[s].templateRawHex = '6f0000'; // any section train will do for the assembly
			}
			device.status = DeviceStatus.Connected;
			device.device = {
				mode: 'Performance',
				performance: { name: 'From G2', focus: 'A', rangeEnable: false, bpm: 120, clockRunning: false },
				slots: [],
			} as any;
			vi.spyOn(store, 'loadSlot').mockResolvedValue({ name: 'x', rawHex: '', patch: makePatch() } as any);

			const resultPromise = store.downloadPerformanceToSynth();
			await vi.runAllTimersAsync();

			expect(await resultPromise).toBe(true);
			const call = (globalThis as any).window.cli.run.mock.calls.find((c: any[]) => c[0][0] === 'upload-perf-data');
			const data: number[] = call[0][1];
			const name = Array.from(new TextEncoder().encode('From G2'));
			expect(data.slice(0, name.length + 4)).toEqual([...name, 0x00, 0x17, 0x01, 0x11]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('refuses when not all slots contain a patch', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		store.performanceRawHex = '00'.repeat(80);
		useDeviceStore().status = DeviceStatus.Connected;

		const result = await store.downloadPerformanceToSynth();

		expect(result).toBe(false);
	});

	it('no-ops when disconnected', async () => {
		const store = useSlotsStore();
		for (const s of ['A', 'B', 'C', 'D'] as const) store.slots[s].patch = makePatch();
		store.performanceRawHex = '00'.repeat(80);
		useDeviceStore().status = DeviceStatus.Disconnected;

		const result = await store.downloadPerformanceToSynth();

		expect(result).toBe(false);
	});
});

describe('dumpOne — Dump One', () => {
	it('sends dump-patch for the focused slot when connected and a patch is loaded', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		useDeviceStore().status = DeviceStatus.Connected;

		const result = await store.dumpOne();

		expect(result).toBe(true);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['dump-patch', 'A']);
	});

	it('no-ops when not connected', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		useDeviceStore().status = DeviceStatus.Disconnected;

		const result = await store.dumpOne();

		expect(result).toBe(false);
		expect((globalThis as any).window.cli.run).not.toHaveBeenCalled();
	});

	it('no-ops when the focused slot has no patch', async () => {
		const store = useSlotsStore();
		useDeviceStore().status = DeviceStatus.Connected;

		const result = await store.dumpOne();

		expect(result).toBe(false);
		expect((globalThis as any).window.cli.run).not.toHaveBeenCalled();
	});

	it('returns false when the CLI call fails', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		useDeviceStore().status = DeviceStatus.Connected;
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('USB error'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await store.dumpOne();

		expect(result).toBe(false);
		vi.restoreAllMocks();
	});
});

describe('uploadBankFromDevice — Bank Upload (from G2)', () => {
	it('requests get-bank with a default name derived from type and bank when connected', async () => {
		const store = useSlotsStore();
		useDeviceStore().status = DeviceStatus.Connected;

		const result = await store.uploadBankFromDevice('patch', 3, '/tmp/dest');

		expect(result).toBe(true);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['get-bank', 'patch', '3', '/tmp/dest', 'PatchBank3']);
	});

	it('passes through an explicit filename instead of the default', async () => {
		const store = useSlotsStore();
		useDeviceStore().status = DeviceStatus.Connected;

		await store.uploadBankFromDevice('performance', 2, '/tmp/dest', 'MyBank');

		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith(['get-bank', 'performance', '2', '/tmp/dest', 'MyBank']);
	});

	it('no-ops when not connected', async () => {
		const store = useSlotsStore();
		useDeviceStore().status = DeviceStatus.Disconnected;

		const result = await store.uploadBankFromDevice('patch', 1, '/tmp/dest');

		expect(result).toBe(false);
		expect((globalThis as any).window.cli.run).not.toHaveBeenCalled();
	});

	it('returns false when the CLI call fails', async () => {
		const store = useSlotsStore();
		useDeviceStore().status = DeviceStatus.Connected;
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('USB error'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await store.uploadBankFromDevice('patch', 1, '/tmp/dest');

		expect(result).toBe(false);
		vi.restoreAllMocks();
	});
});

describe('downloadBankToDevice — Bank Download (to G2)', () => {
	function bankResult(overrides: Partial<Record<string, unknown>> = {}) {
		return { written: 2, cleared: 126, failed: 0, failures: [], aborted: false, ...overrides };
	}

	it('sends send-bank with the source path, then waits for names to reload, when connected', async () => {
		vi.useFakeTimers();
		try {
			const store = useSlotsStore();
			useDeviceStore().status = DeviceStatus.Connected;
			const runSpy = (globalThis as any).window.cli.run as ReturnType<typeof vi.fn>;
			runSpy.mockResolvedValue(JSON.stringify(bankResult()));

			const resultPromise = store.downloadBankToDevice({ type: 'folder', folderPath: '/tmp/src' }, 5, 'patch');
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result).toEqual(bankResult());
			expect(runSpy).toHaveBeenCalledWith(['send-bank', 'patch', 'folder', '/tmp/src', '5']);
			expect(runSpy).toHaveBeenCalledWith(['reload-names']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('sends the pchList filepath (not folderPath) for a pchList source', async () => {
		vi.useFakeTimers();
		try {
			const store = useSlotsStore();
			useDeviceStore().status = DeviceStatus.Connected;
			const runSpy = (globalThis as any).window.cli.run as ReturnType<typeof vi.fn>;
			runSpy.mockResolvedValue(JSON.stringify(bankResult()));

			const resultPromise = store.downloadBankToDevice({ type: 'pchList', filepath: '/tmp/src/Bank1.pchList' }, 1, 'performance');
			await vi.runAllTimersAsync();
			await resultPromise;

			expect(runSpy).toHaveBeenCalledWith(['send-bank', 'performance', 'pchList', '/tmp/src/Bank1.pchList', '1']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('no-ops when not connected', async () => {
		const store = useSlotsStore();
		useDeviceStore().status = DeviceStatus.Disconnected;

		const result = await store.downloadBankToDevice({ type: 'folder', folderPath: '/tmp/src' }, 1, 'patch');

		expect(result).toBeNull();
		expect((globalThis as any).window.cli.run).not.toHaveBeenCalled();
	});

	it('returns null when the CLI call fails', async () => {
		const store = useSlotsStore();
		useDeviceStore().status = DeviceStatus.Connected;
		(globalThis as any).window.cli.run = vi.fn().mockRejectedValue(new Error('USB error'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await store.downloadBankToDevice({ type: 'folder', folderPath: '/tmp/src' }, 1, 'patch');

		expect(result).toBeNull();
		vi.restoreAllMocks();
	});
});

describe('assignedVoicesForSlot', () => {
	it('returns the correct count for each slot label', () => {
		const store = useSlotsStore();
		store.slots.A.assignedVoices = 2;
		store.slots.B.assignedVoices = 3;
		store.slots.C.assignedVoices = 4;
		store.slots.D.assignedVoices = 5;
		expect(store.assignedVoicesForSlot('A')).toBe(2);
		expect(store.assignedVoicesForSlot('B')).toBe(3);
		expect(store.assignedVoicesForSlot('C')).toBe(4);
		expect(store.assignedVoicesForSlot('D')).toBe(5);
	});

	it('returns 0 for a slot with no voices assigned', () => {
		const store = useSlotsStore();
		expect(store.assignedVoicesForSlot('A')).toBe(0);
	});
});

describe('assignParamToPage / deassignParamPage', () => {
	beforeEach(() => {
		useDeviceStore().status = DeviceStatus.Connected;
	});

	it('assignParamToPage writes the record, marks the slot dirty, and records undo', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.assignParamToPage('A', 5, 1, 2, 0);

		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 5, location: 1, moduleIndex: 2, paramIndex: 0, isLed: 0 }]);
		expect(patch.paramPages).toEqual(store.slots['A'].paramPages);
		expect(store.isSlotEdited('A')).toBe(true);
		expect(useHistoryStore().canUndo('A')).toBe(true);
		expect((globalThis as any).window.cli.runBatch).toHaveBeenCalledWith([['assign-knob', 'A', 'va', '2', '0', '5', '0']]);
	});

	it('a level meter and a param with the same index are distinct assignments, and the meter carries isLed to the CLI', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 5, 1, 2, 0);
		await store.assignParamToPage('A', 6, 1, 2, 0, 1);

		expect(store.slots['A'].paramPages).toEqual([
			{ slotIndex: 5, location: 1, moduleIndex: 2, paramIndex: 0, isLed: 0 },
			{ slotIndex: 6, location: 1, moduleIndex: 2, paramIndex: 0, isLed: 1 },
		]);
		expect((globalThis as any).window.cli.runBatch).toHaveBeenLastCalledWith([['assign-knob', 'A', 'va', '2', '0', '6', '1']]);
	});

	it('assigning into an occupied slot evicts the old occupant', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 5, 0, 1, 0);

		await store.assignParamToPage('A', 5, 0, 2, 3);

		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 5, location: 0, moduleIndex: 2, paramIndex: 3, isLed: 0 }]);
	});

	it('assigning an already-assigned param moves it (old slotIndex cleared)', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 5, 0, 1, 0);

		await store.assignParamToPage('A', 9, 0, 1, 0);

		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 9, location: 0, moduleIndex: 1, paramIndex: 0, isLed: 0 }]);
		// The hardware doesn't auto-evict: the old knob is deassigned first, then the new one assigned.
		expect((globalThis as any).window.cli.runBatch).toHaveBeenLastCalledWith([
			['deassign-knob', 'A', '5'],
			['assign-knob', 'A', 'fx', '1', '0', '9', '0'],
		]);
	});

	it('deassignParamPage removes the record and undo restores it', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 5, 0, 1, 0);

		await store.deassignParamPage('A', 5);
		expect(store.slots['A'].paramPages).toEqual([]);

		await store.undo();
		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 5, location: 0, moduleIndex: 1, paramIndex: 0, isLed: 0 }]);
	});

	it('undo/redo round-trip for assignParamToPage', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 5, 0, 1, 0);

		await store.undo();
		expect(store.slots['A'].paramPages).toEqual([]);

		await store.redo();
		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 5, location: 0, moduleIndex: 1, paramIndex: 0, isLed: 0 }]);
	});

	it('records undo despite a rejected CLI call (offline)', async () => {
		(globalThis as any).window.cli.runBatch = vi.fn().mockRejectedValue(new Error('Daemon not running'));
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;
		// runCliBatchSafe's offline fallback is the behaviour under test — expect and suppress its console.warn.
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		await store.assignParamToPage('A', 5, 0, 1, 0);

		expect(store.slots['A'].paramPages).toEqual([{ slotIndex: 5, location: 0, moduleIndex: 1, paramIndex: 0, isLed: 0 }]);
		expect(useHistoryStore().canUndo('A')).toBe(true);
		vi.restoreAllMocks();
	});
});

describe('swapParamPageSlots', () => {
	beforeEach(() => {
		useDeviceStore().status = DeviceStatus.Connected;
	});

	function at(slotIndex: number) {
		return useSlotsStore().slots['A'].paramPages.find((k) => k.slotIndex === slotIndex);
	}

	it('moves the assignment when the target slot is empty', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 3, 1, 2, 5);

		await store.swapParamPageSlots('A', 3, 9);

		expect(at(3)).toBeUndefined();
		expect(at(9)).toMatchObject({ location: 1, moduleIndex: 2, paramIndex: 5 });
		expect((globalThis as any).window.cli.runBatch).toHaveBeenCalledWith([
			['deassign-knob', 'A', '3'],
			['assign-knob', 'A', 'va', '2', '5', '9', '0'],
		]);
	});

	it('exchanges both assignments when the target slot is occupied', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 3, 1, 2, 5);
		await store.assignParamToPage('A', 9, 0, 4, 1);

		await store.swapParamPageSlots('A', 3, 9);

		expect(at(9)).toMatchObject({ location: 1, moduleIndex: 2, paramIndex: 5 });
		expect(at(3)).toMatchObject({ location: 0, moduleIndex: 4, paramIndex: 1 });
	});

	// The reason this action exists: two assignParamToPage calls recorded two entries, so one Ctrl+Z
	// left the swap half-applied.
	it('records the swap as a single undo entry that restores both slots at once', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 3, 1, 2, 5);
		await store.assignParamToPage('A', 9, 0, 4, 1);
		const before = [...store.slots['A'].paramPages];

		await store.swapParamPageSlots('A', 3, 9);
		await store.undo();

		expect(store.slots['A'].paramPages).toEqual(before);
		expect(store.slots['A'].patch!.paramPages).toEqual(before);

		await store.redo();
		expect(at(9)).toMatchObject({ moduleIndex: 2, paramIndex: 5 });
		expect(at(3)).toMatchObject({ moduleIndex: 4, paramIndex: 1 });
	});

	it('does nothing when the source slot is empty or is the target', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 9, 0, 4, 1);
		const before = [...store.slots['A'].paramPages];

		await store.swapParamPageSlots('A', 3, 9);
		await store.swapParamPageSlots('A', 9, 9);

		expect(store.slots['A'].paramPages).toEqual(before);
	});
});

describe('assignModuleToPage', () => {
	beforeEach(() => {
		useDeviceStore().status = DeviceStatus.Connected;
	});

	function at(slotIndex: number) {
		return useSlotsStore().slots['A'].paramPages.find((k) => k.slotIndex === slotIndex);
	}

	it('assigns count consecutive slots (one per param, in order), marks dirty, and records one undo entry', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		store.slots['A'].patch = patch;

		await store.assignModuleToPage('A', 8, 1, 2, [0, 1, 2]);

		expect(store.slots['A'].paramPages).toEqual([
			{ slotIndex: 8, location: 1, moduleIndex: 2, paramIndex: 0, isLed: 0 },
			{ slotIndex: 9, location: 1, moduleIndex: 2, paramIndex: 1, isLed: 0 },
			{ slotIndex: 10, location: 1, moduleIndex: 2, paramIndex: 2, isLed: 0 },
		]);
		expect(patch.paramPages).toEqual(store.slots['A'].paramPages);
		expect(store.isSlotEdited('A')).toBe(true);
		expect(useHistoryStore().canUndo('A')).toBe(true);
		expect((globalThis as any).window.cli.runBatch).toHaveBeenCalledWith([
			['assign-knob', 'A', 'va', '2', '0', '8', '0'],
			['assign-knob', 'A', 'va', '2', '1', '9', '0'],
			['assign-knob', 'A', 'va', '2', '2', '10', '0'],
		]);
	});

	it("evicts occupants of the target slots and any of this module's other assignments among the reassigned params", async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignParamToPage('A', 9, 0, 9, 9); // occupant of a target slot
		await store.assignParamToPage('A', 40, 1, 2, 1); // module 2's param 1, previously parked elsewhere

		await store.assignModuleToPage('A', 8, 1, 2, [0, 1, 2]);

		expect(at(9)).toMatchObject({ moduleIndex: 2, paramIndex: 1 }); // evicted occupant's slot now holds module 2 param 1
		expect(at(40)).toBeUndefined(); // stray moved into the contiguous run
		expect(store.slots['A'].paramPages.filter((k) => k.moduleIndex === 2)).toHaveLength(3);
	});

	it('undo/redo round-trips the whole run as one entry', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();
		await store.assignModuleToPage('A', 8, 1, 2, [0, 1, 2]);
		const assigned = [...store.slots['A'].paramPages];

		await store.undo();
		expect(store.slots['A'].paramPages).toEqual([]);

		await store.redo();
		expect(store.slots['A'].paramPages).toEqual(assigned);
	});

	it('truncates instead of overrunning slot 119', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();

		await store.assignModuleToPage('A', 118, 0, 5, [0, 1, 2, 3, 4]);

		expect(store.slots['A'].paramPages.map((k) => k.slotIndex).sort((a, b) => a - b)).toEqual([118, 119]);
	});

	it('does nothing when the starting slot is already past the last slot', async () => {
		const store = useSlotsStore();
		store.slots['A'].patch = makePatch();

		await store.assignModuleToPage('A', 120, 0, 5, [0, 1, 2, 3, 4]);

		expect(store.slots['A'].paramPages).toEqual([]);
	});
});

describe('assignModuleToGlobalPage', () => {
	beforeEach(() => {
		useDeviceStore().status = DeviceStatus.Connected;
	});

	function at(slotIndex: number) {
		return useSlotsStore().globalParamPages.find((k) => k.slotIndex === slotIndex);
	}

	it('assigns count consecutive global slots targeting the given patch slot, with no undo entry', async () => {
		const store = useSlotsStore();

		await store.assignModuleToGlobalPage('B', 16, 0, 7, [0, 1]);

		expect(store.globalParamPages).toEqual([
			{ slotIndex: 16, slot: 'B', location: 0, moduleIndex: 7, paramIndex: 0, isLed: 0 },
			{ slotIndex: 17, slot: 'B', location: 0, moduleIndex: 7, paramIndex: 1, isLed: 0 },
		]);
		expect(useHistoryStore().canUndo('A')).toBe(false);
		expect((globalThis as any).window.cli.runBatch).toHaveBeenCalledWith([
			['assign-global-knob', 'A', 'B', 'fx', '7', '0', '16'],
			['assign-global-knob', 'A', 'B', 'fx', '7', '1', '17'],
		]);
	});

	it("evicts occupants and this module's other assignments for the target patch slot", async () => {
		const store = useSlotsStore();
		await store.assignParamToGlobalPage('B', 17, 1, 9, 9);
		await store.assignParamToGlobalPage('B', 50, 0, 7, 1);

		await store.assignModuleToGlobalPage('B', 16, 0, 7, [0, 1]);

		expect(at(17)).toMatchObject({ moduleIndex: 7, paramIndex: 1 });
		expect(at(50)).toBeUndefined();
	});

	it('truncates instead of overrunning slot 119', async () => {
		const store = useSlotsStore();

		await store.assignModuleToGlobalPage('B', 118, 0, 5, [0, 1, 2, 3, 4]);

		expect(store.globalParamPages.map((k) => k.slotIndex).sort((a, b) => a - b)).toEqual([118, 119]);
	});
});

describe('randomizeOrClearSeqSteps', () => {
	// Real SeqNote (121) param layout: Seq1Step1..16 at indices 0-15, Seq2Step1..16 at 16-31,
	// Loop 32, Length 33, TG 34, Rnd 35, Clr 36.
	const LENGTH_IDX = 33;

	function withVariations(voiceValues: number[], moduleIndex: number): any[] {
		return Array.from({ length: 9 }, () => ({ fx: {}, voice: { [moduleIndex]: [...voiceValues] }, patch: {} }));
	}

	it("'clr' resets both the value row and the gate row for all 16 steps, ignoring Length", async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [{ type: 121, index: 1, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 37, lv: [], modes: [] }];
		store.slots['A'].patch = patch;
		const values = Array(37).fill(10);
		values[LENGTH_IDX] = 3; // Length only affects playback, not which steps Rnd/Clr touch
		store.slots['A'].variations = withVariations(values, 1);

		await store.randomizeOrClearSeqSteps(1, 0, 'voice', 'clr');

		const result = store.slots['A'].variations![0].voice[1];
		expect(result.slice(0, 16)).toEqual(Array(16).fill(64)); // FreqCoarse def = 64
		expect(result.slice(16, 32)).toEqual(Array(16).fill(0)); // Seq2Step1-16 gates (OffOnBlank def = 0)
		expect(store.isSlotEdited('A')).toBe(true);
		expect(useHistoryStore().canUndo('A')).toBe(true);
	});

	it("'rnd' on SeqNote is bounded by the module's own piano-roll zoom/octave window, not the param's full range", async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [
			{
				type: 121,
				index: 1,
				horiz: 0,
				vert: 0,
				colour: 0,
				uprate: 0,
				mutaLock: 0,
				pcnt: 37,
				lv: [],
				modes: [],
				pianoRollView: { zoom: 1, octaveOffset: 5 },
			},
		];
		store.slots['A'].patch = patch;
		const values = Array(37).fill(0);
		values[LENGTH_IDX] = 15; // all 16 steps active
		store.slots['A'].variations = withVariations(values, 1);

		await store.randomizeOrClearSeqSteps(1, 0, 'voice', 'rnd');

		// zoom=1, octaveOffset=5 -> window [48, 72] (see visibleNoteWindow in pianoRoll.ts), not [0, 127].
		const result = store.slots['A'].variations![0].voice[1];
		for (const v of result.slice(0, 16)) {
			expect(v).toBeGreaterThanOrEqual(48);
			expect(v).toBeLessThanOrEqual(72);
		}
		for (const v of result.slice(16, 32)) {
			expect(v).toBeGreaterThanOrEqual(0); // gate row is unaffected by the piano-roll window
			expect(v).toBeLessThanOrEqual(1);
		}
	});

	it("'rnd' on a non-SeqNote sequencer (no piano-roll window) still spans the param's full range", async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [{ type: 154, index: 1, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 37, lv: [], modes: [] }];
		store.slots['A'].patch = patch;
		store.slots['A'].variations = withVariations(Array(37).fill(64), 1);

		await store.randomizeOrClearSeqSteps(1, 0, 'voice', 'rnd');

		const result = store.slots['A'].variations![0].voice[1];
		for (const v of result.slice(0, 16)) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(127);
		}
		expect(result.slice(0, 16).some((v: number) => v !== 64)).toBe(true);
	});

	it('one press is a single undo/redo entry', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [{ type: 121, index: 1, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 37, lv: [], modes: [] }];
		store.slots['A'].patch = patch;
		const values = Array(37).fill(10);
		values[LENGTH_IDX] = 15;
		store.slots['A'].variations = withVariations(values, 1);

		await store.randomizeOrClearSeqSteps(1, 0, 'voice', 'clr');
		expect(store.slots['A'].variations![0].voice[1].slice(0, 16)).toEqual(Array(16).fill(64));

		await store.undo();
		expect(store.slots['A'].variations![0].voice[1].slice(0, 16)).toEqual(Array(16).fill(10));

		await store.redo();
		expect(store.slots['A'].variations![0].voice[1].slice(0, 16)).toEqual(Array(16).fill(64));
	});

	it('treats all 16 steps as active for a module with no Length param (SeqCtr), resetting both rows', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [{ type: 154, index: 1, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 37, lv: [], modes: [] }];
		store.slots['A'].patch = patch;
		store.slots['A'].variations = withVariations(Array(37).fill(10), 1);

		await store.randomizeOrClearSeqSteps(1, 0, 'voice', 'clr');

		expect(store.slots['A'].variations![0].voice[1].slice(0, 32)).toEqual(Array(32).fill(0)); // LevBipUni + OffOnBlank def = 0
	});

	it('does nothing for a module without any Seq1Step params', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [{ type: 5, index: 1, horiz: 0, vert: 0, colour: 0, uprate: 0, mutaLock: 0, pcnt: 0, lv: [], modes: [] }];
		store.slots['A'].patch = patch;

		await store.randomizeOrClearSeqSteps(1, 0, 'voice', 'clr');

		expect(useHistoryStore().canUndo('A')).toBe(false);
	});
});

describe('setParamLabel — 4-button switch keeps the other button names', () => {
	async function findSwitch() {
		const { getAllModules } = await import('@/renderer/nmg2mods');
		for (const m of getAllModules()) {
			const idx = (m.params ?? []).findIndex((p) => p.label?.length === 4);
			if (idx >= 0) return { mod: m, paramIndex: idx, names: m.params![idx].label! };
		}
		throw new Error('no multi-button label switch found');
	}

	it.each([0, 1])('renaming button %i sends and stores all other buttons with their default names', async (labelIndex) => {
		const { mod, paramIndex, names } = await findSwitch();
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[0].modules.push({ index: 1, type: mod.id, paramLabels: undefined });
		store.slots['A'].patch = patch;

		await store.setParamLabel(1, paramIndex, 'Foo', 'fx', labelIndex);

		const expected = names.map((n, i) => (i === labelIndex ? 'Foo' : n));
		expect(patch.areas[0].modules[0].paramLabels[0].labels).toEqual(expected);
		expect((globalThis as any).window.cli.run).toHaveBeenCalledWith([
			'set-module-labels',
			'A',
			expect.any(String),
			'1',
			String(paramIndex),
			String(expected.length),
			...expected,
		]);
	});

	it('renaming one of the four separate On buttons (Mixer 4-1 C) leaves the other three untouched', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[0].modules.push({ index: 1, type: 123, paramLabels: undefined });
		store.slots['A'].patch = patch;

		for (const [i, name] of ['Mic', 'Piano', 'Bass', 'Drums'].entries()) await store.setParamLabel(1, 4 + i, name, 'fx');
		await store.setParamLabel(1, 4, 'Line', 'fx');

		// The device replaces a module's whole label list per message, so the last command must carry all four.
		const run = (globalThis as any).window.cli.run;
		expect(run).toHaveBeenLastCalledWith(['set-module-labels', 'A', 'fx', '1', '4', '1', 'Line', '5', '1', 'Piano', '6', '1', 'Bass', '7', '1', 'Drums']);

		const labels = patch.areas[0].modules[0].paramLabels.map((pl: any) => [pl.paramIndex, pl.labels]);
		expect(labels).toEqual([
			[4, ['Line']],
			[5, ['Piano']],
			[6, ['Bass']],
			[7, ['Drums']],
		]);
	});

	it('sends the full fixed-size block: padding dropped, missing label params filled with defaults', async () => {
		const store = useSlotsStore();
		const patch = makePatch();
		const pad = { paramIndex: 0, isString: false, paramLen: 0, labels: [] };
		patch.areas[0].modules.push({ index: 1, type: 123, paramLabels: [{ paramIndex: 7, isString: true, paramLen: 8, labels: ['Synth'] }, pad, pad] });
		store.slots['A'].patch = patch;

		await store.setParamLabel(1, 4, 'Mic', 'fx');

		// Mixer 4-1 C's block is always 40 bytes on the device: On1-On4 (params 4-7), one 10-byte entry each.
		expect((globalThis as any).window.cli.run).toHaveBeenLastCalledWith([
			'set-module-labels',
			'A',
			'fx',
			'1',
			'4',
			'1',
			'Mic',
			'5',
			'1',
			'Ch 2',
			'6',
			'1',
			'Ch 3',
			'7',
			'1',
			'Synth',
		]);
	});

	it('undo restores the default name instead of a blank button', async () => {
		const { mod, paramIndex, names } = await findSwitch();
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[0].modules.push({ index: 1, type: mod.id, paramLabels: undefined });
		store.slots['A'].patch = patch;

		await store.setParamLabel(1, paramIndex, 'Foo', 'fx', 1);
		await store.undo();

		expect(patch.areas[0].modules[0].paramLabels[0].labels).toEqual(names);
	});
});

describe('failed edit push', () => {
	beforeEach(() => {
		// These tests deliberately exercise the "CLI failed" warning paths — expect and suppress them.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => vi.restoreAllMocks());

	it('reloads the slot from the G2 when an edit fails while connected', async () => {
		const slots = useSlotsStore();
		const load = vi.spyOn(slots, 'loadSlot').mockResolvedValue(null);
		useDeviceStore().status = DeviceStatus.Connected;
		(window as any).cli.runBatch.mockRejectedValue(new Error("Error invoking remote method 'cli:run-batch': Error: the G2 rejected the edit"));

		await runCliBatchSafe(
			[
				['add-module', 'C', 'va', '61'],
				['add-cable', 'C', 'va'],
			],
			'test',
		);
		await new Promise((r) => setTimeout(r, 0));

		expect(load).toHaveBeenCalledWith('C', true);
	});

	it('waits for the rest of the edit, then reloads once and drops the history', async () => {
		const slots = useSlotsStore();
		const hist = useHistoryStore();
		hist.record('B', { undo: async () => {}, redo: async () => {} } as any);
		const load = vi.spyOn(slots, 'loadSlot').mockResolvedValue({} as any);
		useDeviceStore().status = DeviceStatus.Connected;
		let pending = 1;
		(window as any).cli.pending = () => pending;
		(window as any).cli.run.mockRejectedValue(new Error('the G2 rejected the edit'));

		await runCliSafe(['add-module', 'B', 'va', '61'], 'test');
		await runCliSafe(['add-cable', 'B', 'va'], 'test');
		await new Promise((r) => setTimeout(r, 0));
		expect(load).not.toHaveBeenCalled(); // a later step of the edit is still in flight

		pending = 0;
		await new Promise((r) => setTimeout(r, 150));
		expect(load).toHaveBeenCalledTimes(1);
		expect(load).toHaveBeenCalledWith('B', true);
		expect(hist.canUndo('B')).toBe(false);
		delete (window as any).cli.pending;
	});

	it('sends no set-module-labels for a module whose labels are all empty', async () => {
		const slots = useSlotsStore();
		slots.slots['A'].patch = makePatch();
		const src = {
			type: 184,
			index: 1,
			horiz: 0,
			vert: 0,
			color: 0,
			name: 'Mix1-1A1',
			lv: [],
			modes: [],
			paramLabels: [{ paramIndex: 0, labels: [] }],
		} as any;

		await slots.addModuleWithData(src, 17, 0, 0, 'voice');

		const batches = (window as any).cli.runBatch.mock.calls.map((c: any[]) => c[0]);
		expect(batches.flat().some((cmd: string[]) => cmd[0] === 'set-module-labels')).toBe(false);
	});

	it('keeps the local edit when offline', async () => {
		const slots = useSlotsStore();
		const load = vi.spyOn(slots, 'loadSlot').mockResolvedValue(null);
		useDeviceStore().status = DeviceStatus.Disconnected;
		(window as any).cli.run.mockRejectedValue(new Error('not connected'));

		await runCliSafe(['add-module', 'A', 'va', '61'], 'test');

		expect(load).not.toHaveBeenCalled();
	});
});

// Osc → EnvADSR → Out in a new patch sounded degraded: the editor computed uprate only for display,
// so the G2 kept the Env at control rate. The reference editor sends S_SET_MODULE_UPRATE (0x2A) and
// recolours the module's output cables after every topology change; a reload fixed it only because
// the full upload carries the uprate bits (test-patches/new/degraded.pch2).
describe('uprate is sent to the G2', () => {
	const OSC_A = 97; // red out
	const ENV_ADSR = 20; // purple in 0, purple out 1
	const OUT2 = 4;
	const RED = 0,
		BLUE = 1;
	const envUprate = (v: number) => ['set-module-uprate', 'A', 'va', '2', String(v)].join();
	const mod = (index: number, type: number) => ({ index, type, horiz: 0, vert: index * 3, colour: 0, uprate: 0, leds: 0, pcnt: 0, lv: [], modes: [] });

	function setup() {
		const store = useSlotsStore();
		const patch = makePatch();
		patch.areas[1].modules = [mod(1, OSC_A), mod(2, ENV_ADSR), mod(3, OUT2)];
		patch.areas[1].cableList = [{ colour: BLUE, smod: 2, scon: 1, dir: 1, dmod: 3, dcon: 0 }];
		store.slots['A'].patch = patch;
		const sent: string[][] = [];
		(globalThis as any).window.cli.run = vi.fn(async (cmd: string[]) => void sent.push(cmd));
		(globalThis as any).window.cli.runBatch = vi.fn(async (cmds: string[][]) => (sent.push(...cmds), []));
		const idx = (c: string) => sent.findIndex((s) => s.join() === c);
		return { store, patch, sent, idx };
	}

	it('addCable osc → env uprates the env after the add-cable and recolours its output cable', async () => {
		const { store, patch, sent, idx } = setup();
		await store.addCable(1, 1, 0, 2, 0, 0, 'voice', RED);
		expect(idx(envUprate(1))).toBeGreaterThan(sent.findIndex((c) => c[0] === 'add-cable'));
		expect(idx(['set-cable-color', 'A', 'va', String(RED), '2', '1', '1', '3', '0', '0'].join())).toBeGreaterThanOrEqual(0);
		expect(patch.areas[1].modules.find((m: any) => m.index === 2).uprate).toBe(1);
	});

	it('deleting the cable and undoing the add both de-rate the env', async () => {
		const { store, sent, idx } = setup();
		await store.addCable(1, 1, 0, 2, 0, 0, 'voice', RED);
		sent.length = 0;
		await store.deleteConnectedCables(2, 0, 'input', 'voice');
		expect(idx(envUprate(0))).toBeGreaterThan(sent.findIndex((c) => c[0] === 'del-cable'));

		await store.undo(); // re-adds the cable
		expect(idx(envUprate(1))).toBeGreaterThanOrEqual(0);
		sent.length = 0;
		await store.undo(); // undoes the original add
		expect(idx(envUprate(0))).toBeGreaterThanOrEqual(0);
	});

	it('deleteModule undo re-uprates the re-created module (add-module creates it at control rate)', async () => {
		const { store, sent, idx } = setup();
		await store.addCable(1, 1, 0, 2, 0, 0, 'voice', RED);
		await store.deleteModule(2, 'voice');
		sent.length = 0;
		await store.undo();
		expect(idx(envUprate(1))).toBeGreaterThan(sent.findIndex((c) => c[0] === 'add-module'));
	});

	it("replaceModule of the env's osc sends no uprate flip for the env (no intermediate sync from deleteModule)", async () => {
		const { store, patch, sent } = setup();
		await store.addCable(1, 1, 0, 2, 0, 0, 'voice', RED);
		sent.length = 0;
		await store.replaceModule(1, 7 /* OscB */, 'voice');
		expect(sent.filter((c) => c[0] === 'set-module-uprate' && c[3] === '2')).toEqual([]);
		expect(patch.areas[1].modules.find((m: any) => m.index === 2).uprate).toBe(1);
	});

	it('paste undo de-rates a module the pasted cable fed', async () => {
		const { store, sent, idx } = setup();
		await store.paste(
			[{ src: mod(9, OSC_A) as any, newId: 4, col: 1, row: 0 }],
			[{ newSmod: 4, scon: 0, dir: 1, newDmod: 2, dcon: 0, colour: RED }],
			'voice',
		);
		expect(idx(envUprate(1))).toBeGreaterThanOrEqual(0);
		sent.length = 0;
		await store.undo();
		expect(idx(envUprate(0))).toBeGreaterThan(sent.findIndex((c) => c[0] === 'del-module'));
	});
});

// Patches stored on the G2 by the old editor keep uprate=0 in G2 memory (the G2 doesn't recompute
// it on load), so loading one from the G2 must repair the live slot and tell the user to save.
describe('uprate repair on load from the G2', () => {
	beforeEach(async () => {
		(await import('@/composables/useToast')).useToast().toasts.splice(0); // module-level, and keyed toasts dedupe
	});

	async function degradedFixture(envUprate: number): Promise<{ name: string; rawHex: string }> {
		const fs = await import('fs');
		const path = await import('path');
		const { fileURLToPath } = await import('url');
		const { PatchParser, stripFileHeader } = await import('@/parser/nmg2PatchParser');
		const { serializePatch } = await import('@/parser/nmg2PatchSerializer');
		const { extractVariations } = await import('@/store/slotHelpers');
		const buf = fs.readFileSync(path.join(fileURLToPath(new URL('.', import.meta.url)), '../../../../test-patches/new/degraded.pch2'));
		const bytes = new Uint8Array(buf);
		const patch: any = new PatchParser(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)).parse();
		patch.areas[1].modules.find((m: any) => m.uname === 'EnvADSR1').uprate = envUprate;
		return { name: 'degraded', rawHex: serializePatch('degraded', patch, stripFileHeader(bytes), extractVariations(patch)) };
	}

	function capture() {
		const sent: string[][] = [];
		(globalThis as any).window.cli.run = vi.fn(async (cmd: string[]) => void sent.push(cmd));
		(globalThis as any).window.cli.runBatch = vi.fn(async (cmds: string[][]) => (sent.push(...cmds), []));
		return sent;
	}

	it('sends set-module-uprate and shows a toast when the G2 has the env at control rate', async () => {
		const { useToast } = await import('@/composables/useToast');
		const { toasts } = useToast();
		const before = toasts.length;
		const { name, rawHex } = await degradedFixture(0);
		const sent = capture();
		await useSlotsStore()._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));
		expect(sent.map((c) => c.join())).toEqual([['set-module-uprate', 'A', 'va', '2', '1'].join()]);
		expect(toasts.length).toBe(before + 1);
		expect(toasts[toasts.length - 1]).toMatchObject({ error: true, message: expect.stringContaining('Slot A') });
	});

	it('in Performance mode, several degraded slots give one toast that saves the performance', async () => {
		const { useToast } = await import('@/composables/useToast');
		const { toasts } = useToast();
		toasts.splice(0);
		useDeviceStore().device = { mode: 'Performance' } as any;
		const { name, rawHex } = await degradedFixture(0);
		const sent = capture();
		const store = useSlotsStore();
		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));
		await store._applyPatchOutput('B', JSON.stringify({ slot: 'B', name, data: rawHex }));
		expect(sent.map((c) => c.slice(0, 2).join())).toEqual(['set-module-uprate,A', 'set-module-uprate,B']);
		expect(toasts).toHaveLength(1);
		expect(toasts[0]).toMatchObject({ key: 'uprate-perf', message: expect.stringContaining('save the performance') });

		useDeviceStore().setStoredLocation('perf', 2, 5);
		sent.length = 0;
		expect(await toasts[0].action!.run()).toBe(true);
		expect(sent).toEqual([['store-patch', '4', '2', '5']]);
	});

	it('a single patch loaded in Performance mode names the slot, but still saves the performance', async () => {
		const { useToast } = await import('@/composables/useToast');
		const { toasts } = useToast();
		useDeviceStore().device = { mode: 'Performance' } as any;
		const { name, rawHex } = await degradedFixture(0);
		capture();
		await useSlotsStore()._applyPatchOutput('C', JSON.stringify({ slot: 'C', name, data: rawHex }));
		expect(toasts).toHaveLength(1);
		expect(toasts[0]).toMatchObject({ key: 'uprate-perf', message: expect.stringMatching(/^Slot C: .*save the performance/) });
	});

	it('a performance loaded while the G2 is in Patch mode also gets the performance toast', async () => {
		const { useToast } = await import('@/composables/useToast');
		const { toasts } = useToast();
		useDeviceStore().device = { mode: 'Patch' } as any;
		useDeviceStore().pendingPerfBank = 1; // performance select still loading
		const { name, rawHex } = await degradedFixture(0);
		capture();
		await useSlotsStore()._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));
		expect(toasts.map((t) => t.key)).toEqual(['uprate-perf']);
	});

	it('a loaded performance (editor in performance mode) gets the performance toast', async () => {
		const { useToast } = await import('@/composables/useToast');
		const { toasts } = useToast();
		useDeviceStore().device = { mode: 'Patch' } as any;
		useSlotsStore().performanceName = 'Bank 2 / 5';
		const { name, rawHex } = await degradedFixture(0);
		capture();
		await useSlotsStore()._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));
		expect(toasts.map((t) => t.key)).toEqual(['uprate-perf']);
	});

	it('sends nothing when the stored uprate is already correct', async () => {
		const { useToast } = await import('@/composables/useToast');
		const { toasts } = useToast();
		const before = toasts.length;
		const { name, rawHex } = await degradedFixture(1);
		const sent = capture();
		await useSlotsStore()._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }));
		expect(sent).toEqual([]);
		expect(toasts.length).toBe(before);
	});

	it('a reload (preserveHistory) repairs a wrong uprate too, without a toast', async () => {
		const { useToast } = await import('@/composables/useToast');
		const { name, rawHex } = await degradedFixture(0);
		const sent = capture();
		const store = useSlotsStore();
		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }), true, store.editSeq.A);
		expect(sent.map((c) => c.join())).toEqual([['set-module-uprate', 'A', 'va', '2', '1'].join()]);
		expect(useToast().toasts).toEqual([]);
	});

	it('a reload that raced an edit sends no repair (computed from an older topology)', async () => {
		const { name, rawHex } = await degradedFixture(0);
		const sent = capture();
		const store = useSlotsStore();
		const seq = store.editSeq.A;
		store._markSlotDirty('A');
		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }), true, seq);
		expect(sent).toEqual([]);
	});

	it('a NACKed repair after a reload does not trigger another reload', async () => {
		const { name, rawHex } = await degradedFixture(0);
		capture();
		(globalThis as any).window.cli.runBatch = vi.fn().mockRejectedValue(new Error('REJECTED'));
		useDeviceStore().status = DeviceStatus.Connected;
		const store = useSlotsStore();
		const load = vi.spyOn(store, 'loadSlot');
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name, data: rawHex }), true, store.editSeq.A);
		await new Promise((r) => setTimeout(r, 0));
		expect(load).not.toHaveBeenCalled();
	});

	it('a fresh load of the slot dismisses the warning about its previous patch', async () => {
		const { useToast } = await import('@/composables/useToast');
		const { toasts } = useToast();
		capture();
		const store = useSlotsStore();
		const bad = await degradedFixture(0);
		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: bad.name, data: bad.rawHex }));
		expect(toasts.map((t) => t.key)).toEqual(['uprate-A']);
		const good = await degradedFixture(1);
		await store._applyPatchOutput('A', JSON.stringify({ slot: 'A', name: 'good', data: good.rawHex }));
		expect(toasts).toEqual([]);
	});

	it('loading a file returns the repair for the caller to send after its raw upload (which carries the wrong bits)', async () => {
		const { PatchParser } = await import('@/parser/nmg2PatchParser');
		const { name, rawHex } = await degradedFixture(0);
		const bytes = new Uint8Array(rawHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
		const pch2 = new Uint8Array([...new TextEncoder().encode(name), 0x00, 0x17, 0x00, ...bytes]);
		const patch: any = new PatchParser(pch2.buffer).parse();
		const sent = capture();
		expect(useSlotsStore().loadPatchFile('A', patch, name, rawHex)).toEqual([['set-module-uprate', 'A', 'va', '2', '1']]);
		expect(sent).toEqual([]);
		expect(patch.areas[1].modules.find((m: any) => m.index === 2).uprate).toBe(1);
	});
});
