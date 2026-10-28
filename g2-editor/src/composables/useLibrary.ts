import { computed, ref } from 'vue';
import type { ClipboardEntry } from '@/types/patch';
import { useSettingsStore } from '@/store/settings';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { resolveSelectionArea } from '@/store/slotHelpers';
import { libraryItemToPch2, pch2ToLibraryItem, type LibraryEntry } from '../parser/libraryFile';
import { useEditDialog } from './useEditDialog';
import { selectionEntry } from './usePatchClipboard';
import { showToast } from './useToast';

// `group` is the item's subfolder path in the library folder, '' for the folder itself.
// `entry` is missing for a file that can't be read: it's listed, but can't be inserted.
export type LibraryItem = { name: string; path: string; group: string; entry?: LibraryEntry };

// Singleton state shared by the Library pane and the Save Selection to Library dialog.
const root = ref(''); // the library folder
const items = ref<LibraryItem[]>([]);
let pendingEntry: ClipboardEntry | null = null;

// The library folder's own items show as group 'Saved'; the groups are its subfolders.
export const groupLabel = (group: string) => group || 'Saved';
const groups = computed(() => [...new Set(items.value.map((i) => i.group).filter(Boolean))].sort());

export type SaveForm = { group: string; name: string; notes: string };
const saveDialog = useEditDialog<SaveForm>({ group: '', name: '', notes: '' }, 'saveToLibrary', saveToLibrary);
let lastGroup = '';

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

// Every .pch2 in `dir` and its subfolders (hidden ones skipped).
async function scan(dir: string, group: string): Promise<LibraryItem[]> {
	const { entries } = await window.electronAPI.patches.list(dir);
	const lists = await Promise.all(
		entries
			.filter((e) => !e.name.startsWith('.'))
			.map(async (e): Promise<LibraryItem[]> => {
				if (e.isDir) return scan(e.path, group ? `${group}/${e.name}` : e.name);
				if (!/\.pch2$/i.test(e.name)) return [];
				const file = await window.electronAPI.patches.load(e.path);
				let entry: LibraryEntry | undefined;
				try {
					entry = file.data ? pch2ToLibraryItem(file.data) : undefined;
				} catch {
					entry = undefined;
				}
				return [{ name: e.name.replace(/\.pch2$/i, ''), path: e.path, group, entry }];
			}),
	);
	return lists.flat();
}

async function refresh(): Promise<void> {
	if (root.value) items.value = await scan(root.value, '');
}

async function init(): Promise<void> {
	root.value = await window.electronAPI.patches.libraryDir(useSettingsStore().libraryFolder || undefined);
	await refresh();
}

// Saved into the group's folder (created when new), the notes as the patch notes. Never overwrites: "Name", "Name 2", ...
async function saveToLibrary(form: SaveForm): Promise<void> {
	const entry = pendingEntry;
	const slot = useSlotsStore().slots[useUiStore().slotInFocus];
	if (!entry || !slot.patch || !slot.templateRawHex) return;
	await init();
	const group = groupPath(form.group);
	lastGroup = group;
	const name = safeName(form.name) || 'Item';
	const taken = new Set(items.value.filter((i) => i.group === group).map((i) => i.name.toLowerCase()));
	let unique = name;
	for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${name} ${n}`;
	const source = { patch: slot.patch, templateRawHex: slot.templateRawHex, variations: slot.variations ?? [] };
	const bytes = libraryItemToPch2(unique, entry, source, form.notes.trim());
	await window.electronAPI.patches.librarySave(`${root.value}/${group ? `${group}/` : ''}${unique}.pch2`, bytes);
	const settings = useSettingsStore();
	if (settings.rightPaneTab !== 'library' || !settings.showRightPane) settings.toggleSidebar('library');
	await refresh();
}

export function useLibrary() {
	function openSaveDialog(): void {
		const ui = useUiStore();
		pendingEntry = selectionEntry(resolveSelectionArea(ui));
		if (!pendingEntry) return;
		if (!useSlotsStore().slots[ui.slotInFocus].templateRawHex) return showToast('This patch cannot be saved yet — try again once it has loaded.');
		// Groups to choose from: read the folder first. The group defaults to the last one used.
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

	async function remove(item: LibraryItem): Promise<void> {
		await window.electronAPI.patches.libraryRemove(item.path);
		await refresh();
	}

	return { root, items, groups, init, refresh, setFolder, chooseFolder, remove, openSaveDialog, saveDialog };
}
