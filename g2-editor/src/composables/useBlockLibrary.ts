import { ref } from 'vue';
import type { ClipboardEntry } from '@/types/patch';
import { useSettingsStore } from '@/store/settings';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { resolveSelectionArea } from '@/store/slotHelpers';
import { blockToPch2, pch2ToBlock } from '../parser/blockFile';
import { useEditDialog } from './useEditDialog';
import { selectionEntry } from './usePatchClipboard';
import { showToast } from './useToast';

export type BlockItem = { name: string; path: string; isDir: boolean; block?: ClipboardEntry };

// Singleton state shared by the Library pane and the Save Selection as Block dialog.
const root = ref(''); // the blocks folder
const folder = ref(''); // the folder the pane shows: root or one of its subfolders
const items = ref<BlockItem[]>([]);
let pendingEntry: ClipboardEntry | null = null;

const saveDialog = useEditDialog<string>('', 'saveBlock', saveBlock);

async function refresh(): Promise<void> {
	if (!folder.value) return;
	const result = await window.electronAPI.patches.list(folder.value);
	const entries = result.entries.filter((e) => e.isDir || /\.pch2$/i.test(e.name));
	items.value = await Promise.all(
		entries.map(async (e) => {
			if (e.isDir) return e;
			const file = await window.electronAPI.patches.load(e.path);
			try {
				return { ...e, name: e.name.replace(/\.pch2$/i, ''), block: file.data ? pch2ToBlock(file.data) : undefined };
			} catch {
				return { ...e, name: e.name.replace(/\.pch2$/i, '') }; // unreadable file: listed, but can't be inserted
			}
		}),
	);
}

async function init(): Promise<void> {
	root.value = await window.electronAPI.patches.blocksDir(useSettingsStore().blocksFolder || undefined);
	if (!folder.value.startsWith(root.value)) folder.value = root.value;
	await refresh();
}

async function saveBlock(name: string): Promise<void> {
	const entry = pendingEntry;
	const slot = useSlotsStore().slots[useUiStore().slotInFocus];
	if (!entry || !slot.patch || !slot.templateRawHex) return;
	await init();
	// Never overwrite: "Name", "Name 2", "Name 3", ...
	const base = name.trim().replace(/[/\\:*?"<>|]/g, '_') || 'Block';
	const taken = new Set(items.value.filter((i) => !i.isDir).map((i) => i.name.toLowerCase()));
	let unique = base;
	for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${base} ${n}`;
	const bytes = blockToPch2(unique, entry, { patch: slot.patch, templateRawHex: slot.templateRawHex, variations: slot.variations ?? [] });
	await window.electronAPI.savePatch(`${folder.value}/${unique}.pch2`, bytes);
	const settings = useSettingsStore();
	if (settings.rightPaneTab !== 'library' || !settings.showRightPane) settings.toggleSidebar('library');
	await refresh();
}

export function useBlockLibrary() {
	function openSaveDialog(): void {
		const ui = useUiStore();
		pendingEntry = selectionEntry(resolveSelectionArea(ui));
		if (!pendingEntry) return;
		if (!useSlotsStore().slots[ui.slotInFocus].templateRawHex) return showToast('This patch cannot be saved yet — try again once it has loaded.');
		saveDialog.open(pendingEntry.modules[0].uname || 'Block');
	}

	async function chooseFolder(): Promise<void> {
		const result = await window.electronAPI.patches.setFolder();
		if (!result.success || !result.folder) return;
		useSettingsStore().blocksFolder = result.folder;
		folder.value = '';
		await init();
	}

	async function enter(dir: string): Promise<void> {
		folder.value = dir;
		await refresh();
	}

	async function up(): Promise<void> {
		if (folder.value === root.value) return;
		await enter(folder.value.slice(0, folder.value.lastIndexOf('/')));
	}

	async function remove(item: BlockItem): Promise<void> {
		await window.electronAPI.patches.blocksRemove(item.path);
		await refresh();
	}

	return { root, folder, items, init, refresh, chooseFolder, enter, up, remove, openSaveDialog, saveDialog };
}
