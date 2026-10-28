/// <reference types="vite/client" />
import type { ConnectedDeviceInfo, DeviceAction, DeviceSummary, MenuAction, MenuState } from './types/index';
import type { CliService } from './types/cli';

declare module '*.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent<{}, {}, any>;
	export default component;
}

declare global {
	interface Window {
		electronAPI: {
			isOffline: boolean;
			isMac: boolean;
			patches: {
				list: (folder: string) => Promise<{
					success: boolean;
					entries: { name: string; path: string; isDir: boolean }[];
					error?: string;
					code?: string; // Node error code, e.g. ENOENT, EACCES
				}>;
				load: (filepath: string) => Promise<{ success: boolean; data?: number[]; error?: string }>;
				setFolder: () => Promise<{ success: boolean; folder?: string }>;
				builtinPath: (name: string) => Promise<string>;
				initLoadPath: (slot: number) => Promise<string>;
				initSavePath: (slot: number) => Promise<string>;
				storageDir: (custom?: string) => Promise<string>;
				storageRemove: (filepath: string) => Promise<void>;
				storageCopy: (from: string, to: string) => Promise<void>;
				libraryDir: (custom?: string) => Promise<string>;
				librarySave: (filepath: string, data: number[]) => Promise<void>;
				libraryMove: (from: string, to: string) => Promise<void>;
				libraryRemove: (filepath: string) => Promise<void>;
				reveal: (filepath: string) => Promise<void>;
				onStorageChanged: (cb: () => void) => void;
				offStorageChanged: () => void;
			};
			loadHelp: (shortName: string) => Promise<string | null>;
			loadModuleGraphics: () => Promise<Record<number, string>>;
			onMenuAction: (cb: (action: MenuAction) => void) => void;
			offMenuAction: () => void;
			onOpenFile: (cb: (filepath: string) => void) => void;
			offOpenFile: () => void;
			updateRecentFiles: (files: { path: string; kind: 'patch' | 'performance' }[]) => void;
			updateMenuState: (state: MenuState) => void;
			savePatch: (filepath: string, data: number[]) => Promise<void>;
			showSaveDialog: (defaultName?: string, folder?: string) => Promise<{ success: boolean; filepath?: string }>;
			showSavePerfDialog: (defaultName?: string, folder?: string) => Promise<{ success: boolean; filepath?: string }>;
			openPatchDialog: (kind?: 'patch' | 'performance') => Promise<{
				success: boolean;
				filepath?: string;
				data?: number[];
				error?: string;
			}>;
			getAppInfo: () => Promise<{ version: string; platform: string; iconDataUrl: string }>;
			getLatestVersion: () => Promise<string | null>;
			claimStartupSplash: () => Promise<boolean>;
			openExternal: (url: string) => void;
			setTheme: (mode: 'system' | 'light' | 'dark') => Promise<void>;
			selectBankFolder: (defaultPath?: string) => Promise<{ success: boolean; folder?: string }>;
			selectPchListFile: () => Promise<{ success: boolean; filepath?: string }>;
			devices: {
				list: () => Promise<{ bus: number; device: number; id: string; alreadyConnected: boolean }[]>;
				connect: (bus: number, device: number) => Promise<{ id: string }>;
				self: () => Promise<number>;
				report: (summary: DeviceSummary) => Promise<void>;
				select: (viewId: number, action?: DeviceAction) => Promise<void>;
				detach: (viewId: number) => Promise<void>;
				attach: (viewId: number) => Promise<void>;
				close: (viewId: number) => Promise<void>;
				getAssignment: () => Promise<{ bus: number; device: number; showSplash: boolean } | null>;
				onChanged: (cb: (list: ConnectedDeviceInfo[]) => void) => void;
				offChanged: () => void;
				onAction: (cb: (action: DeviceAction) => void) => void;
				offAction: () => void;
				onAssigned: (cb: (assignment: { bus: number; device: number }) => void) => void;
				offAssigned: () => void;
			};
			clipboard: {
				write: (entry: unknown) => Promise<void>;
				read: () => Promise<unknown | null>;
			};
		};
		cli: CliService;
	}
}
