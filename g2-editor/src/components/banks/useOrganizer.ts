import { ref } from 'vue';
import { SLOT_LABELS } from '@/constants';
import { useBrowserStore, type BankKind, type BankLoc, type PlaceSource, type StorageItem } from '@/store/browser';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { useDeviceStore } from '@/store/device';
import { usePatchFile } from '@/composables/usePatchFile';
import { SOUND_CATEGORIES } from '@/constants/categories';
import type { ContextMenuItem } from '@/types';
import { categoryColor } from './categoryTint';

// A selectable thing: a bank cell or a Temporary Storage item. A selection holds one type only.
// The same shape is what the store places into a bank (PlaceSource).
export type Selectable = PlaceSource;
export const asCell = (loc: BankLoc): Selectable => ({ type: 'cell', loc });
export const asStorage = (item: StorageItem): Selectable => ({ type: 'storage', item });
const keyOf = (s: Selectable) => (s.type === 'cell' ? `${s.loc.kind}-${s.loc.bank}-${s.loc.location}` : s.item.file);

// What is being dragged inside the Bank Organizer: a flash location, a storage file, a live slot
// (0-3 = A-D, 4 = performance), or a multi-selection. Kept here instead of in the DataTransfer,
// so no other drop target in the app ever sees these drags.
export type OrganizerDragSource = Selectable | { type: 'slot'; slot: number } | { type: 'many'; items: Selectable[] };

// A selectable area (left grid, right grid, storage): its items in display order and its row width,
// for Shift-click ranges, Cmd-A and arrow keys.
export interface OrganizerArea {
	id: string;
	items: () => Selectable[];
	cols: () => number;
}

const source = ref<OrganizerDragSource | null>(null);
// Selected cells or storage items, and what waits for the delete confirmation.
const selection = ref<Selectable[]>([]);
const clearRequest = ref<Selectable[] | null>(null);
// Shift-click / Shift+arrow ranges run from the anchor; the cursor is the arrow keys' position.
const anchor = ref<Selectable | null>(null);
const cursor = ref<Selectable | null>(null);
const activeArea = ref<string | null>(null);
const areas = new Map<string, OrganizerArea>();
// Set when a multi-drop doesn't fit; BankOrganizer shows it in a dialog.
const roomWarning = ref<{ needed: number; free: number; bank: number; from: number } | null>(null);

// Click modifiers → selection mode: Shift = range, Cmd/Ctrl = toggle, plain = single.
export const clickMode = (e: MouseEvent) => (e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single') as 'range' | 'toggle' | 'single';

// A "Category" context-menu entry with a submenu of all categories; `pick` gets the chosen id.
export const categoryMenu = (label: string, pick: (id: number) => void): ContextMenuItem => ({
	label,
	children: SOUND_CATEGORIES.map((c) => ({ label: c.name, bgColor: categoryColor(c.id), action: () => pick(c.id) })),
});

// Shared state and actions of the Bank Organizer: drag & drop, selection, deleting.
export function useOrganizer() {
	const browser = useBrowserStore();
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const device = useDeviceStore();
	const patchFile = usePatchFile();

	const filled = (s: Selectable) => s.type === 'storage' || !!browser.entryAt(s.loc);
	const same = (a: Selectable | null, b: Selectable) => !!a && keyOf(a) === keyOf(b);

	function registerArea(area: OrganizerArea): () => void {
		areas.set(area.id, area);
		return () => areas.delete(area.id);
	}

	// ── Selection ───────────────────────────────────────────────────────────
	const isSelected = (s: Selectable) => selection.value.some((x) => same(x, s));
	const isCursor = (s: Selectable) => same(cursor.value, s);

	function rangeIn(area: OrganizerArea, to: Selectable): Selectable[] {
		const list = area.items();
		const a = anchor.value ? list.findIndex((x) => same(anchor.value, x)) : -1;
		const b = list.findIndex((x) => same(to, x));
		if (a < 0 || b < 0) return [to];
		return list.slice(Math.min(a, b), Math.max(a, b) + 1);
	}

	// single: just this one · toggle: add/remove it (Cmd-click) · range: anchor..it (Shift-click).
	// Another type, or another area for a range, starts a new selection. Empty bank cells are
	// never selected (the cursor still moves onto them).
	function select(s: Selectable, mode: 'single' | 'toggle' | 'range', areaId: string) {
		const area = areas.get(areaId);
		const sameArea = activeArea.value === areaId;
		activeArea.value = areaId;
		cursor.value = s;
		if (mode === 'range' && area && sameArea) return void (selection.value = rangeIn(area, s).filter(filled));
		if (mode === 'toggle' && selection.value[0]?.type === s.type) {
			if (isSelected(s)) selection.value = selection.value.filter((x) => !same(x, s));
			else if (filled(s)) selection.value = [...selection.value, s];
		} else selection.value = filled(s) ? [s] : [];
		anchor.value = s;
	}

	function selectAll() {
		const area = activeArea.value ? areas.get(activeArea.value) : undefined;
		if (area) selection.value = area.items().filter(filled);
	}

	// Arrow keys: ±1 left/right, ±a row up/down within the active area; `extend` = Shift.
	function moveCursor(dx: number, dy: number, extend: boolean) {
		const area = activeArea.value ? areas.get(activeArea.value) : undefined;
		if (!area) return;
		const list = area.items();
		if (!list.length) return;
		const at = cursor.value ? list.findIndex((x) => same(cursor.value, x)) : -1;
		const next = list[Math.max(0, Math.min(list.length - 1, at < 0 ? 0 : at + dx + dy * area.cols()))];
		cursor.value = next;
		if (extend) selection.value = rangeIn(area, next).filter(filled);
		else {
			selection.value = filled(next) ? [next] : [];
			anchor.value = next;
		}
	}

	function clearSelection() {
		selection.value = [];
	}

	// The thing itself, or the whole selection when it is part of it.
	const targetsFor = (s: Selectable) => (isSelected(s) ? selection.value : [s]);

	// ── Drag & drop ─────────────────────────────────────────────────────────
	function setSource(e: DragEvent, src: OrganizerDragSource) {
		source.value = src;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'copyMove';
			e.dataTransfer.setData('text/plain', '');
		}
	}

	// A slot drag.
	const start = setSource;

	// A cell or storage drag: the whole selection when the item is part of a multi-selection,
	// else just this item (which becomes the selection).
	function startItem(e: DragEvent, s: Selectable, areaId: string) {
		const items = isSelected(s) ? selection.value.filter(filled) : [];
		if (items.length > 1) return setSource(e, { type: 'many', items });
		if (!isSelected(s)) select(s, 'single', areaId);
		setSource(e, s);
	}

	function end() {
		source.value = null;
	}

	// The drop cursor: `effect` for targets that always copy (storage, slots) or delete (Trash); onto a
	// bank cell, bank locations move (Option/Alt = copy) and storage items and slots are copied.
	function over(e: DragEvent, accepts: (src: OrganizerDragSource) => boolean, effect?: 'copy' | 'move') {
		const src = source.value;
		if (!src || !accepts(src)) return;
		e.preventDefault();
		const moves = !e.altKey && (src.type === 'cell' || (src.type === 'many' && src.items[0].type === 'cell'));
		if (e.dataTransfer) e.dataTransfer.dropEffect = effect ?? (moves ? 'move' : 'copy');
	}

	function slotName(slot: number): string {
		if (slot === 4) return device.device?.performance?.name ?? '';
		return slotsStore.getPatchName(SLOT_LABELS[slot]) ?? '';
	}

	// Slot index for store-patch: A-D, or 0 for the performance (storePatch picks the Perf slot by kind).
	const storeSlot = (slot: number) => (slot === 4 ? 0 : slot) as 0 | 1 | 2 | 3;

	// Bank cells in location order, storage items in storage order: the order they are placed in.
	function inPlaceOrder(items: Selectable[]): Selectable[] {
		const storageIndex = (s: Selectable) => (s.type === 'storage' ? browser.storage.findIndex((x) => x.file === s.item.file) : 0);
		const cellOrder = (s: Selectable) => (s.type === 'cell' ? s.loc.bank * 1000 + s.loc.location : 0);
		return [...items].sort((a, b) => cellOrder(a) - cellOrder(b) || storageIndex(a) - storageIndex(b));
	}

	/* Puts several items into the free locations of `bank` from `from` on (up to 128). When they
	 * don't fit, nothing happens and roomWarning tells the user. */
	async function placeInto(items: Selectable[], kind: BankKind, bank: number, from: number, move: boolean) {
		const ordered = inPlaceOrder(items);
		const free = browser.freeFrom(kind, bank, from);
		if (free.length < ordered.length) {
			roomWarning.value = { needed: ordered.length, free: free.length, bank, from };
			return;
		}
		if (await browser.placeMany(ordered, free.slice(0, ordered.length), move)) clearSelection();
	}

	function dropOnCell(e: DragEvent, dst: BankLoc) {
		const src = source.value;
		end();
		if (!src) return;
		if (src.type === 'many') placeInto(src.items, dst.kind, dst.bank, dst.location, src.items[0].type === 'cell' && !e.altKey);
		else if (src.type === 'cell') browser.moveLocation(src.loc, dst, e.altKey);
		else if (src.type === 'storage') browser.fromStorage(src.item, dst);
		else browser.storeSlotAt(storeSlot(src.slot), dst, slotName(src.slot));
	}

	function dropOnStorage() {
		const src = source.value;
		end();
		if (src?.type === 'cell') browser.toStorage([src.loc]);
		else if (src?.type === 'many') browser.toStorage(inPlaceOrder(src.items).flatMap((s) => (s.type === 'cell' ? [s.loc] : [])));
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
	const firstEmpty = (kind: BankKind, bank: number): BankLoc | null => browser.freeFrom(kind, bank, 1)[0] ?? null;

	// "… Bank n (at n-17)" menu entries for the banks shown left and right, into their first empty location.
	function toBankItems(verb: string, disabled: boolean, act: (dst: BankLoc) => void): ContextMenuItem[] {
		return [...new Set(uiStore.organizerBanks)].map((bank) => {
			const dst = firstEmpty(uiStore.organizerKind, bank);
			return {
				label: dst ? `${verb} Bank ${bank} (at ${bank}-${dst.location})` : `${verb} Bank ${bank} (full)`,
				disabled: disabled || !dst,
				action: () => dst && act(dst),
			};
		});
	}

	// "Copy to Bank n" entries for bank cells or storage items: one item goes to the first empty
	// location (`copyOne`), several to the first empty ones from location 1 on.
	function copyToBankItems(targets: Selectable[], copyOne: (dst: BankLoc) => void): ContextMenuItem[] {
		if (targets.length === 1) return toBankItems('Copy to', false, copyOne);
		return [...new Set(uiStore.organizerBanks)].map((bank) => ({
			label: `Copy ${targets.length} to Bank ${bank}`,
			action: () => placeInto(targets, uiStore.organizerKind, bank, 1, false),
		}));
	}

	// ── Deleting ────────────────────────────────────────────────────────────
	// One item is deleted right away (undo brings it back); several ask for confirmation first
	// (BankOrganizer's dialog). Empty bank cells are left out.
	function requestClear(list: Selectable[]) {
		const real = list.filter(filled);
		if (real.length === 1) clear(real);
		else if (real.length) clearRequest.value = real;
	}

	function confirmClear() {
		const list = clearRequest.value ?? [];
		clearRequest.value = null;
		return clear(list);
	}

	async function clear(list: Selectable[]) {
		const locs = list.flatMap((s) => (s.type === 'cell' ? [s.loc] : []));
		const items = list.flatMap((s) => (s.type === 'storage' ? [s.item] : []));
		if (items.length) await browser.removeStorage(items);
		if (!locs.length || (await browser.clearLocations(locs))) clearSelection();
	}

	function dropOnTrash() {
		const src = source.value;
		end();
		if (src?.type === 'many') requestClear(src.items);
		else if (src?.type === 'cell' || src?.type === 'storage') requestClear(targetsFor(src));
	}

	return {
		source,
		selection,
		clearRequest,
		roomWarning,
		registerArea,
		start,
		startItem,
		end,
		over,
		slotName,
		storeSlot,
		dropOnCell,
		dropOnStorage,
		dropOnSlot,
		loadIntoSlot,
		placeInto,
		firstEmpty,
		toBankItems,
		copyToBankItems,
		isSelected,
		isCursor,
		select,
		selectAll,
		moveCursor,
		clearSelection,
		targetsFor,
		requestClear,
		confirmClear,
		dropOnTrash,
	};
}
