import { SLOT_LABELS } from '../constants';
import { useDeviceStore } from '../store/device';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
const { PatchParser } = await import('../parser/nmg2PatchParser');

type DiskItem = { type: 'disk'; filepath: string; kind?: 'patch' | 'performance' };
type SynthItem = { type: 'synth'; bank: number; location: number; kind?: 'patch' | 'performance' };

function stripFileHeader(bytes: number[] | Uint8Array): string {
	let ofs = 0;
	while (ofs < bytes.length && bytes[ofs] !== 0) ofs++;
	return Array.from((bytes as any).slice(ofs + 3))
		.map((b: unknown) => (b as number).toString(16).padStart(2, '0'))
		.join('');
}

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

	async function handleFileLoad(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const buffer = await file.arrayBuffer();
		const parsedPatch = new PatchParser(buffer).parse() as any;
		const name = file.name.replace(/\.(pch2|prf2)$/i, '');
		const rawHex = stripFileHeader(new Uint8Array(buffer));
		slotsStore.loadPatchFile(uiStore.activeSlot, parsedPatch, name, rawHex);
		applyVariation(parsedPatch);
	}

	async function openFromElectronDialog(): Promise<void> {
		if (!window.electronAPI) return;
		const result = await window.electronAPI.openPatchDialog();
		if (!result.success || !result.data) return;
		const buffer = new Uint8Array(result.data).buffer;
		const name = (result.filepath!.split('/').pop() ?? result.filepath!).replace(/\.(pch2|prf2)$/i, '');
		const rawHex = stripFileHeader(result.data as number[]);
		const parser = new PatchParser(buffer);
		const prf2 = parser.parsePrf2();
		if (prf2) {
			slotsStore.loadPerformanceFile(prf2.patches, prf2.slotNames, name, rawHex, result.filepath!);
			await device.setPerformanceMode(name);
			return;
		}
		const parsedPatch = parser.parse() as any;
		slotsStore.loadPatchFile(uiStore.activeSlot, parsedPatch, name, rawHex, result.filepath!);
		applyVariation(parsedPatch);
		if (device.status === 'connected') {
			try {
				await window.cli.run(['upload-patch', uiStore.activeSlot, result.filepath!]);
			} catch (err) {
				console.error('Upload to G2 failed:', err);
			}
		}
	}

	async function handlePerformanceSynthSelect(bank: number, location: number): Promise<void> {
		if (device.status !== 'connected') return;
		try {
			await device.setPerformanceMode(`Bank ${bank} / ${location}`);
			await window.cli.run(['select-perf', String(bank), String(location)]);
			for (const slot of SLOT_LABELS) {
				await slotsStore.loadSlot(slot);
			}
			slotsStore.$patch({ performanceName: `Bank ${bank} / ${location}`, performanceFilePath: '', performanceRawHex: null });
		} catch (err) {
			console.error('Failed to select synth performance:', err);
		}
	}

	async function handlePatchSelect(item: DiskItem | SynthItem): Promise<void> {
		if (item.type === 'disk') {
			if (!window.electronAPI) return;
			try {
				const result = await window.electronAPI.patches.load(item.filepath);
				if (!result.success || !result.data) return;
				const buffer = new Uint8Array(result.data).buffer;
				const name = (item.filepath.split('/').pop() ?? item.filepath).replace(/\.(pch2|prf2)$/i, '');
				const rawHex = stripFileHeader(result.data as number[]);
				if (item.kind === 'performance' || item.filepath.toLowerCase().endsWith('.prf2')) {
					const prf2 = new PatchParser(buffer).parsePrf2();
					if (prf2) {
						slotsStore.loadPerformanceFile(prf2.patches, prf2.slotNames, name, rawHex, item.filepath);
						await device.setPerformanceMode(name);
						return;
					}
				}
				const parsedPatch = new PatchParser(buffer).parse() as any;
				slotsStore.loadPatchFile(uiStore.activeSlot, parsedPatch, name, rawHex, item.filepath);
				applyVariation(parsedPatch);
				if (device.status === 'connected') {
					try {
						await window.cli.run(['upload-patch', uiStore.activeSlot, item.filepath]);
					} catch (err) {
						console.error('Upload to G2 failed:', err);
					}
				}
			} catch (err) {
				console.error('Failed to load patch:', err);
			}
		} else {
			if (device.status !== 'connected') return;
			if (item.kind === 'performance') {
				await handlePerformanceSynthSelect(item.bank, item.location);
				return;
			}
			try {
				await window.cli.run(['select-patch', uiStore.activeSlot, String(item.bank), String(item.location)]);
				await slotsStore.loadSlot(uiStore.activeSlot);
			} catch (err) {
				console.error('Failed to select synth patch:', err);
			}
		}
	}

	return {
		handleFileLoad,
		handlePatchSelect,
		handlePerformanceSynthSelect,
		loadSlotPatch,
		openFromElectronDialog,
	};
}
