import { defineStore } from "pinia";

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

export const useBrowserStore = defineStore("browser", {
	state: () => ({
		view: "patches" as "patches" | "performances" | "disk",
		synthPatches:       [] as SynthPatch[],
		synthPerformances:  [] as SynthPatch[],
		collapsedBanks:     [] as number[],
		diskFolder: "" as string,
		diskEntries: [] as DiskEntry[],
		loading: false,
		error:   "" as string,
	}),

	actions: {
		/* Populate from startup JSON `names` field (avoids extra `list` call) */
		applyNamesData(names: any): void {
			const patches: SynthPatch[] = [];
			const perfs:   SynthPatch[] = [];
			for (const [bankStr, entries] of Object.entries(names?.patches ?? {})) {
				for (const e of entries as any[]) {
					patches.push({ bank: Number(bankStr), location: e.location, name: e.name, category: e.category });
				}
			}
			for (const [bankStr, entries] of Object.entries(names?.performances ?? {})) {
				for (const e of entries as any[]) {
					perfs.push({ bank: Number(bankStr), location: e.location, name: e.name });
				}
			}
			this.synthPatches      = patches;
			this.synthPerformances = perfs;
		},

		/* Fallback: load list with separate CLI call */
		async loadSynthList(): Promise<void> {
			this.loading = true;
			this.error = "";
			try {
				const output = await window.cli.run(["list"]);
				this.applyNamesData(JSON.parse(output));
			} catch (e: any) {
				this.error = e.message;
			} finally {
				this.loading = false;
			}
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
			this.error = "";
			try {
				const result = await window.electronAPI.patches.list(folder);
				this.diskEntries = result.success ? result.entries : [];
				if (!result.success) this.error = result.error ?? "Failed to list files";
			} catch (e: any) {
				this.error = e.message;
			} finally {
				this.loading = false;
			}
		},

		async navigateUp(): Promise<void> {
			if (!this.diskFolder) return;
			const parent = this.diskFolder.split("/").slice(0, -1).join("/") || "/";
			await this.loadDiskList(parent);
		},

		async chooseDiskFolder(): Promise<void> {
			const result = await window.electronAPI.patches.setFolder();
			if (result.success && result.folder) await this.loadDiskList(result.folder);
		},
	},
});
