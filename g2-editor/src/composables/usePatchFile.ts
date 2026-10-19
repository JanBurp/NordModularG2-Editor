import type { Patch, GlobalParamPageAssignment, SlotLabel } from '@/types';
import { SLOT_LABELS } from '../constants';
import { DeviceStatus, useDeviceStore } from '../store/device';
import { useSettingsStore } from '../store/settings';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { showToast } from './useToast';
const { PatchParser, stripFileHeader } = await import('../parser/nmg2PatchParser');

type DiskItem = { type: 'disk'; filepath: string; kind?: 'patch' | 'performance' };
type SynthItem = { type: 'synth'; bank: number; location: number; kind?: 'patch' | 'performance' };
type Prf2Data = {
	slotNames: string[];
	patches: Patch[];
	slotMeta: Array<{ active: boolean; key: boolean; hold: boolean; bank: number; patch: number; rangeLow: number; rangeHigh: number }>;
	globalParamPages: GlobalParamPageAssignment[];
};

/* Safety net for handlePerformanceSynthSelect: clears the loading overlay if the
 * device never sends the matching synth_settings_update (error/disconnect mid-load). */
export const PERF_SETTLE_TIMEOUT_MS = 5000;

// Shared so a re-select (from any usePatchFile instance) cancels the previous settle watchdog
let perfSelectTimer: ReturnType<typeof setTimeout> | undefined;

export function usePatchFile() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const device = useDeviceStore();

	function applyVariation(parsedPatch: any): void {
		if (parsedPatch?.description?.variation !== undefined) {
			uiStore.variation = parsedPatch.description.variation;
		}
	}

	async function loadSlotPatch(index: number): Promise<{ name: string; patch: any } | null> {
		return slotsStore.loadSlot(SLOT_LABELS[index]);
	}

	async function applyPerformanceFile(prf2: Prf2Data, name: string, rawHex: string, filepath: string): Promise<void> {
		const connected = device.status === DeviceStatus.Connected;
		if (connected) {
			if (slotsStore.uploadingFromFile) return;
			slotsStore.uploadingFromFile = true;
		}
		slotsStore.loadPerformanceFile(prf2.patches, prf2.slotNames, name, rawHex, filepath, prf2.globalParamPages);
		await device.setPerformanceMode(name);
		if (connected) {
			try {
				await window.cli.run(['upload-perf', filepath]);
			} catch (err) {
				console.error('Upload perf to G2 failed:', err);
				showToast('Performance upload to G2 failed — check device connection.');
			} finally {
				slotsStore.uploadingFromFile = false;
			}
			if (device.device?.performance) device.device.performance.name = name;
		} else if (prf2.slotMeta.length === 4) {
			const slots = prf2.slotMeta.map((m, i) => ({
				slot: SLOT_LABELS[i],
				name: prf2.slotNames[i],
				active: m.active,
				key: m.key,
				hold: m.hold,
				bank: m.bank,
				patch: m.patch,
				range: { lower: m.rangeLow, upper: m.rangeHigh },
			}));
			const focusIdx = prf2.slotMeta.findIndex((m) => m.key);
			const focusLabel = SLOT_LABELS[focusIdx >= 0 ? focusIdx : 0];
			device.updatePerfSettings({ performance: { name, focus: focusLabel, rangeEnable: false, bpm: 0, clockRunning: false }, slots });
			uiStore.setSlotInFocus(focusLabel);
		}
	}

	async function handleFileLoad(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const buffer = await file.arrayBuffer();
			const parsedPatch = new PatchParser(buffer).parse() as any;
			const name = file.name.replace(/\.(pch2|prf2)$/i, '');
			const rawHex = stripFileHeader(new Uint8Array(buffer));
			slotsStore.loadPatchFile(uiStore.slotInFocus, parsedPatch, name, rawHex);
			applyVariation(parsedPatch);
		} catch (err) {
			console.error('Failed to load patch file:', err);
			showToast('Failed to load patch file — the file may be corrupt.');
		}
	}

	async function openFromElectronDialog(slot?: SlotLabel, kind?: 'patch' | 'performance'): Promise<void> {
		if (slot) uiStore.setSlotInFocus(slot);
		if (!window.electronAPI) return;
		const result = await window.electronAPI.openPatchDialog(kind);
		if (!result.success || !result.data) return;
		const buffer = new Uint8Array(result.data).buffer;
		const name = (result.filepath!.split(/[/\\]/).pop() ?? result.filepath!).replace(/\.(pch2|prf2)$/i, '');
		const rawHex = stripFileHeader(result.data as number[]);
		let targetSlot: SlotLabel | undefined;
		try {
			const parser = new PatchParser(buffer);
			const prf2 = parser.parsePrf2();
			if (prf2) {
				await applyPerformanceFile(prf2, name, rawHex, result.filepath!);
				useSettingsStore().addRecentFile(result.filepath!, 'performance');
				return;
			}
			useSettingsStore().addRecentFile(result.filepath!, 'patch');
			targetSlot = uiStore.slotInFocus;
			const parsedPatch = parser.parse() as any;
			slotsStore.loadPatchFile(targetSlot, parsedPatch, name, rawHex, result.filepath!);
			applyVariation(parsedPatch);
		} catch (err) {
			console.error('Failed to load patch file:', err);
			showToast('Failed to load patch file — the file may be corrupt.');
			return;
		}
		if (device.status === DeviceStatus.Connected) {
			slotsStore.uploadingFromFile = true;
			try {
				await window.cli.run(['upload-patch', targetSlot, result.filepath!]);
			} catch (err) {
				console.error('Upload to G2 failed:', err);
				showToast('Patch upload to G2 failed — check device connection.');
			} finally {
				slotsStore.uploadingFromFile = false;
			}
		}
	}

	async function handlePerformanceSynthSelect(bank: number, location: number): Promise<void> {
		if (device.status !== DeviceStatus.Connected) return;
		device.modeChanging = true;
		delete device.storedLocation.perf;
		device.pendingPerfBank = bank - 1;
		device.pendingPerfLoc = location - 1;
		clearTimeout(perfSelectTimer);
		perfSelectTimer = setTimeout(() => {
			if (device.pendingPerfBank === bank - 1 && device.pendingPerfLoc === location - 1) {
				console.warn('Performance select did not settle in time');
				showToast('Performance switch did not complete — check device connection.');
				device.clearPendingPerf();
			}
		}, PERF_SETTLE_TIMEOUT_MS);
		// Like the official editor (CFlashData::LoadPerformance): only the flash load, no mode change —
		// the G2 decides the mode and the editor follows what it reports.
		const name = `Bank ${bank} / ${location}`;
		if (device.device?.performance) device.device.performance.name = name;
		try {
			await window.cli.run(['select-perf', String(bank), String(location)]);
			device.setStoredLocation('perf', bank, location);
			slotsStore.$patch({ performanceName: name, performanceFilePath: '', performanceRawHex: null });
			// In Patch mode the G2 loads the performance's patches but reports no perfBank/perfLoc to match
			// (perfBank=129), so the pending select would only end in the timeout toast. select-perf answers
			// after the whole load cascade, so it's done here.
			if (!device.isHardwarePerformanceMode) {
				clearTimeout(perfSelectTimer);
				device.clearPendingPerf();
			}
		} catch (err) {
			console.error('Failed to select synth performance:', err);
			showToast('Failed to select synth performance — check device connection.');
			clearTimeout(perfSelectTimer);
			device.clearPendingPerf();
		}
	}

	async function handlePatchSelect(item: DiskItem | SynthItem): Promise<void> {
		if (item.type === 'disk') {
			if (!window.electronAPI) return;
			try {
				const result = await window.electronAPI.patches.load(item.filepath);
				if (!result.success || !result.data) return;
				const buffer = new Uint8Array(result.data).buffer;
				const name = (item.filepath.split(/[/\\]/).pop() ?? item.filepath).replace(/\.(pch2|prf2)$/i, '');
				const rawHex = stripFileHeader(result.data as number[]);
				if (item.kind === 'performance' || item.filepath.toLowerCase().endsWith('.prf2')) {
					const prf2 = new PatchParser(buffer).parsePrf2();
					if (prf2) {
						await applyPerformanceFile(prf2, name, rawHex, item.filepath);
						return;
					}
				}
				const targetSlot = uiStore.slotInFocus;
				const parsedPatch = new PatchParser(buffer).parse() as any;
				slotsStore.loadPatchFile(targetSlot, parsedPatch, name, rawHex, item.filepath);
				applyVariation(parsedPatch);
				if (device.status === DeviceStatus.Connected) {
					slotsStore.uploadingFromFile = true;
					try {
						await window.cli.run(['upload-patch', targetSlot, item.filepath]);
					} catch (err) {
						console.error('Upload to G2 failed:', err);
						showToast('Patch upload to G2 failed — check device connection.');
					} finally {
						slotsStore.uploadingFromFile = false;
					}
				}
			} catch (err) {
				console.error('Failed to load patch:', err);
				showToast('Failed to load patch file — the file may be corrupt.');
			}
		} else {
			if (device.status !== DeviceStatus.Connected) return;
			if (item.kind === 'performance') {
				await handlePerformanceSynthSelect(item.bank, item.location);
				return;
			}
			try {
				const targetSlot = uiStore.slotInFocus;
				await window.cli.run(['select-patch', targetSlot, String(item.bank), String(item.location)]);
				await slotsStore.loadSlot(targetSlot);
				device.clearOriginStale(targetSlot);
				device.setStoredLocation(targetSlot, item.bank, item.location);
			} catch (err) {
				console.error('Failed to select synth patch:', err);
				showToast('Failed to select synth patch — check device connection.');
			}
		}
	}

	async function newPatch(slot?: SlotLabel): Promise<void> {
		if (slot) uiStore.setSlotInFocus(slot);
		if (!window.electronAPI) return;
		const filepath = await window.electronAPI.patches.builtinPath('EmptyPatch.pch2');
		await handlePatchSelect({ type: 'disk', filepath });
	}

	async function loadInitPatch(slot: 1 | 2): Promise<void> {
		if (!window.electronAPI) return;
		const filepath = await window.electronAPI.patches.initLoadPath(slot);
		await handlePatchSelect({ type: 'disk', filepath });
	}

	return {
		handleFileLoad,
		handlePatchSelect,
		handlePerformanceSynthSelect,
		loadSlotPatch,
		loadInitPatch,
		newPatch,
		openFromElectronDialog,
	};
}
