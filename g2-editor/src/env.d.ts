/// <reference types="vite/client" />
import type { MenuAction, MenuState } from './types/index';
import type { CliService } from './types/cli';
import type { DeviceStatus } from './store/device';

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
				}>;
				load: (filepath: string) => Promise<{ success: boolean; data?: number[]; error?: string }>;
				setFolder: () => Promise<{ success: boolean; folder?: string }>;
				builtinPath: (name: string) => Promise<string>;
				initLoadPath: (slot: number) => Promise<string>;
				initSavePath: (slot: number) => Promise<string>;
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
			selectBankFolder: () => Promise<{ success: boolean; folder?: string }>;
			selectPchListFile: () => Promise<{ success: boolean; filepath?: string }>;
			devices: {
				list: () => Promise<{ bus: number; device: number; id: string; alreadyConnected: boolean }[]>;
				connect: (bus: number, device: number) => Promise<{ id: string }>;
				switchTo: (bus: number, device: number) => Promise<void>;
				reportName: (name: string) => Promise<void>;
				reportStatus: (status: DeviceStatus) => Promise<void>;
				getAssignment: () => Promise<{ bus: number; device: number; showSplash: boolean } | null>;
				onChanged: (
					cb: (list: { id: string; bus: number; device: number; name: string | null; hasDaemon: boolean; status: DeviceStatus }[]) => void,
				) => void;
				offChanged: () => void;
			};
			clipboard: {
				write: (entry: unknown) => Promise<void>;
				read: () => Promise<unknown | null>;
			};
		};
		cli: CliService;
	}
}
