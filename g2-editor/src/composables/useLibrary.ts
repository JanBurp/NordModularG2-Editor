import { computed, markRaw, ref, shallowRef } from 'vue';
import type { ClipboardEntry } from '@/types/patch';
import { useSettingsStore } from '@/store/settings';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { resolveSelectionArea } from '@/store/slotHelpers';
import { libraryItemToPch2, pch2ToLibraryItem, withNotes, type LibraryEntry } from '../parser/libraryFile';
import { useEditDialog } from './useEditDialog';
import { buildClipboardEntry } from './usePatchClipboard';
import { showToast } from './useToast';

// `group` is the item's subfolder path in the library folder, '' for the folder itself.
// `entry` is missing for a file that can't be read: it's listed, but can't be inserted. `mtime`: the file's, when read.
export type LibraryItem = { name: string; path: string; group: string; mtime: number; entry?: LibraryEntry };

// Singleton state shared by the Library pane and the Save Selection to Library dialog.
const root = ref(''); // the library folder
// Shallow, the entries raw: never changed in place, only replaced by refresh().
const items = shallowRef<LibraryItem[]>([]);
let pendingEntry: ClipboardEntry | null = null;

// The library folder's own items show as group 'Saved'; the groups are its subfolders.
export const groupLabel = (group: string) => group || 'Saved';
const groups = computed(() => [...new Set(items.value.map((i) => i.group).filter(Boolean))].sort());

export type SaveForm = { group: string; name: string; notes: string };
const saveDialog = useEditDialog<SaveForm>({ group: '', name: '', notes: '' }, 'saveToLibrary', saveToLibrary);
let lastGroup = '';
// The item just saved, for the Library pane to show it.
const lastSaved = ref<{ group: string; name: string } | null>(null);

const safeName = (s: string) => s.trim().replace(/[/\\:*?"<>|]/g, '_');
// "Drums/Kicks" stays a nested group; 'Saved' (any case) is the library folder itself.
const groupPath = (group: string) =>
	group.trim().toLowerCase() === groupLabel('').toLowerCase()
		? ''
		: group
				.split('/')
				.map(safeName)
				.filter((s) => s && s !== '.' && s !== '..')
				.join('/');

// Every .pch2 in `dir` and its subfolders (hidden ones skipped). Files unchanged since `known` keep their item,
// so they're not read again and the pane doesn't redraw them.
async function scan(dir: string, group: string, known: Map<string, LibraryItem>): Promise<LibraryItem[]> {
	const { entries } = await window.electronAPI.patches.list(dir);
	const lists = await Promise.all(
		entries
			.filter((e) => !e.name.startsWith('.'))
			.map(async (e): Promise<LibraryItem[]> => {
				if (e.isDir) return scan(e.path, group ? `${group}/${e.name}` : e.name, known);
				if (!/\.pch2$/i.test(e.name)) return [];
				const old = known.get(e.path);
				if (old?.mtime === e.mtime) return [old];
				const file = await window.electronAPI.patches.load(e.path);
				let entry: LibraryEntry | undefined;
				try {
					entry = file.data ? markRaw(pch2ToLibraryItem(file.data)) : undefined;
				} catch {
					entry = undefined;
				}
				return [{ name: e.name.replace(/\.pch2$/i, ''), path: e.path, group, mtime: e.mtime, entry }];
			}),
	);
	return lists.flat();
}

async function refresh(): Promise<void> {
	if (!root.value) return;
	const next = await scan(root.value, '', new Map(items.value.map((i) => [i.path, i])));
	if (next.length !== items.value.length || next.some((item, i) => item !== items.value[i])) items.value = next;
}

async function init(): Promise<void> {
	root.value = await window.electronAPI.patches.libraryDir(useSettingsStore().libraryFolder || undefined);
	await refresh();
}

// The item the dialog edits; null when it saves the selection as a new item.
const editing = ref<LibraryItem | null>(null);

// Saved into the group's folder (created when new), the notes as the patch notes. Never overwrites another item:
// "Name", "Name 2", ... An edited item is rewritten in place, then moved when its name or group changed.
async function saveToLibrary(form: SaveForm): Promise<void> {
	const item = editing.value;
	const slot = useSlotsStore().slots[useUiStore().slotInFocus];
	const entry = pendingEntry;
	if (!item && (!entry || !slot.patch || !slot.templateRawHex)) return;
	const original = item ? (await window.electronAPI.patches.load(item.path)).data : undefined;
	if (item && !original) return;
	await init();
	const group = groupPath(form.group);
	if (!item) lastGroup = group;
	const name = safeName(form.name) || 'Item';
	const taken = new Set(items.value.filter((i) => i.group === group && i.path !== item?.path).map((i) => i.name.toLowerCase()));
	let unique = name;
	for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${name} ${n}`;
	const notes = form.notes.trim();
	const bytes = item
		? withNotes(original!, unique, notes)
		: libraryItemToPch2(unique, entry!, { patch: slot.patch!, templateRawHex: slot.templateRawHex!, variations: slot.variations ?? [] }, notes);
	const path = `${root.value}/${group ? `${group}/` : ''}${unique}.pch2`;
	await window.electronAPI.patches.librarySave(item?.path ?? path, bytes);
	if (item && item.path !== path) await window.electronAPI.patches.libraryMove(item.path, path);
	const settings = useSettingsStore();
	if (settings.rightPaneTab !== 'library' || !settings.showRightPane) settings.toggleSidebar('library');
	await refresh();
	lastSaved.value = { group, name: unique };
}

export function useLibrary() {
	function openSaveDialog(): void {
		const ui = useUiStore();
		pendingEntry = ui.selectedModules.length ? buildClipboardEntry(ui.selectedModules, resolveSelectionArea(ui)) : null;
		if (!pendingEntry) return;
		if (!useSlotsStore().slots[ui.slotInFocus].templateRawHex) return showToast('This patch cannot be saved yet — try again once it has loaded.');
		// Groups to choose from: read the folder first. The group defaults to the last one used.
		editing.value = null;
		void init();
		saveDialog.open({ group: lastGroup, name: pendingEntry.modules[0].uname || 'Item', notes: '' });
	}

	// '' = back to the default folder (userData/library).
	async function setFolder(dir: string): Promise<void> {
		useSettingsStore().setLibraryFolder(dir);
		await init();
	}

	async function chooseFolder(): Promise<void> {
		const result = await window.electronAPI.patches.setFolder();
		if (result.success && result.folder) await setFolder(result.folder);
	}

	// The same dialog, filled in with the item's group, name and notes.
	function openEditDialog(item: LibraryItem): void {
		if (!item.entry) return;
		editing.value = item;
		saveDialog.open({ group: item.group, name: item.name, notes: item.entry.text });
	}

	async function remove(item: LibraryItem): Promise<void> {
		await window.electronAPI.patches.libraryRemove(item.path);
		await refresh();
	}

	return { root, items, groups, lastSaved, editing, init, refresh, setFolder, chooseFolder, remove, openSaveDialog, openEditDialog, saveDialog };
}
