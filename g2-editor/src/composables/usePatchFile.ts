import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { useDeviceStore } from '../store/device';
import { SLOT_LABELS } from '../constants';

type DiskItem   = { type: 'disk'; filepath: string };
type SynthItem  = { type: 'synth'; bank: number; location: number };

function stripFileHeader(bytes: number[] | Uint8Array): string {
	let ofs = 0;
	while (ofs < bytes.length && bytes[ofs] !== 0) ofs++;
	return Array.from((bytes as any).slice(ofs + 3))
		.map((b: number) => b.toString(16).padStart(2, '0'))
		.join('');
}

export function usePatchFile() {
	const slotsStore = useSlotsStore();
	const uiStore    = useUiStore();
	const device     = useDeviceStore();

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
		const file  = input.files?.[0];
		if (!file) return;
		const buffer = await file.arrayBuffer();
		const { PatchParser } = await import('../parser/nmg2PatchParser');
		const parsedPatch = new PatchParser(buffer).parse() as any;
		const name   = file.name.replace(/\.(pch2|prf2)$/i, '');
		const rawHex = stripFileHeader(new Uint8Array(buffer));
		slotsStore.loadPatchFile(uiStore.activeSlot, parsedPatch, name, rawHex);
		applyVariation(parsedPatch);
	}

	async function openFromElectronDialog(): Promise<void> {
		if (!window.electronAPI) return;
		const result = await window.electronAPI.openPatchDialog();
		if (!result.success || !result.data) return;
		const buffer = new Uint8Array(result.data).buffer;
		const { PatchParser } = await import('../parser/nmg2PatchParser');
		const parsedPatch = new PatchParser(buffer).parse() as any;
		const name   = (result.filepath!.split('/').pop() ?? result.filepath!).replace(/\.(pch2|prf2)$/i, '');
		const rawHex = stripFileHeader(result.data as number[]);
		slotsStore.loadPatchFile(uiStore.activeSlot, parsedPatch, name, rawHex, result.filepath!);
		applyVariation(parsedPatch);
	}

	async function handlePatchSelect(item: DiskItem | SynthItem): Promise<void> {
		if (item.type === 'disk') {
			if (!window.electronAPI) return;
			try {
				const result = await window.electronAPI.patches.load(item.filepath);
				if (!result.success || !result.data) return;
				const buffer = new Uint8Array(result.data).buffer;
				const { PatchParser } = await import('../parser/nmg2PatchParser');
				const parsedPatch = new PatchParser(buffer).parse() as any;
				const name   = (item.filepath.split('/').pop() ?? item.filepath).replace(/\.(pch2|prf2)$/i, '');
				const rawHex = stripFileHeader(result.data as number[]);
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
			try {
				await window.cli.run(['select-patch', uiStore.activeSlot, String(item.bank), String(item.location)]);
				await slotsStore.loadSlot(uiStore.activeSlot);
			} catch (err) {
				console.error('Failed to select synth patch:', err);
			}
		}
	}

	return { handleFileLoad, handlePatchSelect, loadSlotPatch, openFromElectronDialog };
}
