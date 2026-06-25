import { defineStore } from 'pinia';

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
			const patches: SynthPatch[] = [];
			const perfs: SynthPatch[] = [];
			for (const [bankStr, entries] of Object.entries(names?.patches ?? {})) {
				for (const e of entries as any[]) {
					patches.push({
						bank: Number(bankStr),
						location: e.location,
						name: e.name,
						category: e.category,
					});
				}
			}
			for (const [bankStr, entries] of Object.entries(names?.performances ?? {})) {
				for (const e of entries as any[]) {
					perfs.push({
						bank: Number(bankStr),
						location: e.location,
						name: e.name,
					});
				}
			}
			this.synthPatches = patches;
			this.synthPerformances = perfs;
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
				this.upsertPatch(bank, location, kind, name ?? '');
			} catch (e: any) {
				this.error = e.message;
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
				this.error = e.message;
			}
		},

		async clearPatch(bank: number, location: number, kind: 'patch' | 'performance'): Promise<void> {
			try {
				await window.cli.run(['clear-patch', kind, String(bank), String(location)]);
				if (kind === 'performance') {
					this.synthPerformances = this.synthPerformances.filter((p) => !(p.bank === bank && p.location === location));
				} else {
					this.synthPatches = this.synthPatches.filter((p) => !(p.bank === bank && p.location === location));
				}
			} catch (e: any) {
				this.error = e.message;
			}
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
