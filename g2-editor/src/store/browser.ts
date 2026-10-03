import { defineStore } from 'pinia';
import { SLOT_LABELS } from '@/constants';
import { getCategorySlug } from '@/constants/categories';
import { useDeviceStore } from './device';
import { useSlotsStore } from './slots';
import { showToast } from '@/composables/useToast';

export interface SynthPatch {
	bank: number;
	location: number;
	name: string;
	category?: string;
}

export interface DiskEntry {
	name: string;
	path: string;
	isDir: boolean;
}

function bankEntries(bankStr: string, entries: any[], withCategory: boolean): SynthPatch[] {
	return entries.map((e) => ({
		bank: Number(bankStr),
		location: e.location,
		name: e.name,
		...(withCategory && { category: e.category }),
	}));
}

export const useBrowserStore = defineStore('browser', {
	state: () => ({
		view: 'patches' as 'patches' | 'performances' | 'disk',
		synthPatches: [] as SynthPatch[],
		synthPerformances: [] as SynthPatch[],
		collapsedBanks: [] as number[],
		diskFolder: '' as string,
		diskEntries: [] as DiskEntry[],
		loading: false,
		error: '' as string,
	}),

	actions: {
		/* Populate from startup JSON `names` field (avoids extra `list` call) */
		applyNamesData(names: any): void {
			const toEntries = (banks: any, withCategory: boolean): SynthPatch[] =>
				Object.entries(banks ?? {}).flatMap(([bankStr, entries]) => bankEntries(bankStr, entries as any[], withCategory));
			this.synthPatches = toEntries(names?.patches, true);
			this.synthPerformances = toEntries(names?.performances, false);
		},

		/* Fallback: load list with separate CLI call */
		async loadSynthList(): Promise<void> {
			this.loading = true;
			this.error = '';
			try {
				const output = await window.cli.run(['list']);
				this.applyNamesData(JSON.parse(output));
			} catch (e: any) {
				this.error = e.message;
			} finally {
				this.loading = false;
			}
		},

		removePatch(bank: number, location: number, kind: 'patch' | 'performance'): void {
			const list = kind === 'performance' ? this.synthPerformances : this.synthPatches;
			const idx = list.findIndex((p) => p.bank === bank && p.location === location);
			if (idx >= 0) list.splice(idx, 1);
		},

		upsertPatch(bank: number, location: number, kind: 'patch' | 'performance', name: string, category?: string): void {
			const list = kind === 'performance' ? this.synthPerformances : this.synthPatches;
			const entry: SynthPatch = { bank, location, name, ...(category !== undefined && { category }) };
			const idx = list.findIndex((p) => p.bank === bank && p.location === location);
			if (idx >= 0) list.splice(idx, 1, entry);
			else list.push(entry);
		},

		toggleBank(bank: number): void {
			const idx = this.collapsedBanks.indexOf(bank);
			if (idx >= 0) this.collapsedBanks.splice(idx, 1);
			else this.collapsedBanks.push(bank);
		},

		isBankCollapsed(bank: number): boolean {
			return this.collapsedBanks.includes(bank);
		},

		async loadDiskList(folder: string): Promise<void> {
			this.diskFolder = folder;
			this.loading = true;
			this.error = '';
			try {
				const result = await window.electronAPI.patches.list(folder);
				this.diskEntries = result.success ? result.entries : [];
				if (!result.success) this.error = result.error ?? 'Failed to list files';
			} catch (e: any) {
				this.error = e.message;
			} finally {
				this.loading = false;
			}
		},

		async navigateUp(): Promise<void> {
			if (!this.diskFolder) return;
			const parent = this.diskFolder.split('/').slice(0, -1).join('/') || '/';
			await this.loadDiskList(parent);
		},

		async storePatch(slotIndex: 0 | 1 | 2 | 3, bank: number, location: number, kind: 'patch' | 'performance', name?: string): Promise<void> {
			const slot = kind === 'performance' ? 4 : slotIndex;
			try {
				await window.cli.run(['store-patch', String(slot), String(bank), String(location)]);
				const category =
					kind === 'patch' ? getCategorySlug(useSlotsStore().getPatchForSlot(SLOT_LABELS[slotIndex])?.description?.category ?? 0) : undefined;
				this.upsertPatch(bank, location, kind, name ?? '', category);
				useDeviceStore().setStoredLocation(kind === 'performance' ? 'perf' : SLOT_LABELS[slotIndex], bank, location);
				showToast(`Saved ${kind} at ${bank}-${location}`);
			} catch (e: any) {
				showToast(e.message);
			}
		},

		async clearBank(bank: number, kind: 'patch' | 'performance'): Promise<void> {
			try {
				await window.cli.run(['clear-bank', kind, String(bank)]);
				if (kind === 'performance') {
					this.synthPerformances = this.synthPerformances.filter((p) => p.bank !== bank);
				} else {
					this.synthPatches = this.synthPatches.filter((p) => p.bank !== bank);
				}
			} catch (e: any) {
				showToast(e.message);
			}
		},

		async clearPatch(bank: number, location: number, kind: 'patch' | 'performance'): Promise<void> {
			try {
				await window.cli.run(['clear-patch', kind, String(bank), String(location)]);
				this.removePatch(bank, location, kind);
			} catch (e: any) {
				showToast(e.message);
			}
		},

		setCollapsedBanks(banks: number[]): void {
			this.collapsedBanks = banks;
		},

		async chooseDiskFolder(): Promise<void> {
			const result = await window.electronAPI.patches.setFolder();
			if (result.success && result.folder) {
				const { useSettingsStore } = await import('./settings');
				useSettingsStore().setPath(result.folder);
				await this.loadDiskList(result.folder);
			}
		},
	},
});
