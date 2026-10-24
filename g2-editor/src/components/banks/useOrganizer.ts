import { ref } from 'vue';
import { SLOT_LABELS } from '@/constants';
import { useBrowserStore, type BankLoc, type StorageItem } from '@/store/browser';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { useDeviceStore } from '@/store/device';
import { usePatchFile } from '@/composables/usePatchFile';

// What is being dragged inside the Bank Organizer: a flash location, a storage-area
// file, or a live slot (0-3 = A-D, 4 = performance). Kept here instead of in the
// DataTransfer, so no other drop target in the app ever sees these drags.
export type OrganizerDragSource = { type: 'cell'; loc: BankLoc } | { type: 'storage'; item: StorageItem } | { type: 'slot'; slot: number };

const source = ref<OrganizerDragSource | null>(null);

// A selectable thing: a bank cell or a Temporary Storage item. A selection holds one type only.
export type Selectable = { type: 'cell'; loc: BankLoc } | { type: 'storage'; item: StorageItem };
export const asCell = (loc: BankLoc): Selectable => ({ type: 'cell', loc });
export const asStorage = (item: StorageItem): Selectable => ({ type: 'storage', item });
const keyOf = (s: Selectable) => (s.type === 'cell' ? `${s.loc.kind}-${s.loc.bank}-${s.loc.location}` : s.item.file);

// Selected cells or storage items (click / Shift- or Cmd-click), and what waits for the delete confirmation.
const selection = ref<Selectable[]>([]);
const clearRequest = ref<Selectable[] | null>(null);

const LOCATIONS = 128;

// Shared state and actions of the Bank Organizer: drag & drop, selection, deleting.
export function useOrganizer() {
	const browser = useBrowserStore();
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const device = useDeviceStore();
	const patchFile = usePatchFile();

	function start(e: DragEvent, src: OrganizerDragSource) {
		source.value = src;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'copyMove';
			e.dataTransfer.setData('text/plain', '');
		}
	}

	function end() {
		source.value = null;
	}

	// Option/Alt while dragging = copy.
	function over(e: DragEvent, accepts: (src: OrganizerDragSource) => boolean) {
		if (!source.value || !accepts(source.value)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
	}

	function slotName(slot: number): string {
		if (slot === 4) return device.device?.performance?.name ?? '';
		return slotsStore.getPatchName(SLOT_LABELS[slot]) ?? '';
	}

	// Slot index for store-patch: A-D, or 0 for the performance (storePatch picks the Perf slot by kind).
	const storeSlot = (slot: number) => (slot === 4 ? 0 : slot) as 0 | 1 | 2 | 3;

	function dropOnCell(e: DragEvent, dst: BankLoc) {
		const src = source.value;
		end();
		if (!src) return;
		if (src.type === 'cell') browser.moveLocation(src.loc, dst, e.altKey);
		else if (src.type === 'storage') browser.fromStorage(src.item, dst);
		else browser.storeSlotAt(storeSlot(src.slot), dst, slotName(src.slot));
	}

	function dropOnStorage() {
		const src = source.value;
		end();
		if (src?.type === 'cell') browser.toStorage(src.loc);
	}

	async function loadIntoSlot(loc: BankLoc, slot: number) {
		if (slot < 4) uiStore.setSlotInFocus(SLOT_LABELS[slot]);
		await patchFile.handlePatchSelect({ type: 'synth', bank: loc.bank, location: loc.location, kind: loc.kind });
	}

	function dropOnSlot(slot: number) {
		const src = source.value;
		end();
		if (src?.type === 'cell') loadIntoSlot(src.loc, slot);
	}

	// First empty location of a bank, for the "… to Bank n" menu entries; null when the bank is full.
	function firstEmpty(kind: BankLoc['kind'], bank: number): BankLoc | null {
		for (let location = 1; location <= LOCATIONS; location++) {
			const loc = { kind, bank, location };
			if (!browser.entryAt(loc)) return loc;
		}
		return null;
	}

	const isSelected = (s: Selectable) => selection.value.some((x) => keyOf(x) === keyOf(s));

	// Plain click selects only this one; `add` (Shift/Cmd-click) toggles it. Another type starts a new selection.
	function select(s: Selectable, add: boolean) {
		if (!add || selection.value[0]?.type !== s.type) selection.value = [s];
		else if (isSelected(s)) selection.value = selection.value.filter((x) => keyOf(x) !== keyOf(s));
		else selection.value = [...selection.value, s];
	}

	// The thing itself, or the whole selection when it is part of it.
	const targetsFor = (s: Selectable) => (isSelected(s) ? selection.value : [s]);

	// Asks for confirmation (BankOrganizer's dialog); empty bank cells are left out.
	function requestClear(list: Selectable[]) {
		const real = list.filter((s) => s.type === 'storage' || browser.entryAt(s.loc));
		if (real.length) clearRequest.value = real;
	}

	async function confirmClear() {
		const list = clearRequest.value ?? [];
		clearRequest.value = null;
		const locs = list.flatMap((s) => (s.type === 'cell' ? [s.loc] : []));
		const items = list.flatMap((s) => (s.type === 'storage' ? [s.item] : []));
		if (items.length) await browser.removeStorage(items);
		if (!locs.length || (await browser.clearLocations(locs))) selection.value = [];
	}

	function dropOnTrash() {
		const src = source.value;
		end();
		if (src?.type === 'cell') requestClear(targetsFor(asCell(src.loc)));
		else if (src?.type === 'storage') requestClear(targetsFor(asStorage(src.item)));
	}

	return {
		source,
		selection,
		clearRequest,
		start,
		end,
		over,
		slotName,
		storeSlot,
		dropOnCell,
		dropOnStorage,
		dropOnSlot,
		loadIntoSlot,
		firstEmpty,
		isSelected,
		select,
		targetsFor,
		requestClear,
		confirmClear,
		dropOnTrash,
	};
}
