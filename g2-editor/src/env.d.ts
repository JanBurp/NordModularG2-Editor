/// <reference types="vite/client" />
import type { MenuAction, MenuState } from './types/index';
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
			updateRecentFiles: (files: { path: string; kind: 'patch' | 'performance' }[]) => void;
			updateMenuState: (state: MenuState) => void;
			savePatch: (filepath: string, data: number[]) => Promise<void>;
			writeTempPatch: (name: string, data: number[]) => Promise<string>;
			showSaveDialog: (defaultName?: string, folder?: string) => Promise<{ success: boolean; filepath?: string }>;
			showSavePerfDialog: (defaultName?: string, folder?: string) => Promise<{ success: boolean; filepath?: string }>;
			openPatchDialog: (kind?: 'patch' | 'performance') => Promise<{
				success: boolean;
				filepath?: string;
				data?: number[];
				error?: string;
			}>;
			getAppInfo: () => Promise<{ version: string; platform: string; iconDataUrl: string }>;
			openExternal: (url: string) => void;
			setTheme: (mode: 'system' | 'light' | 'dark') => Promise<void>;
			selectBankFolder: () => Promise<{ success: boolean; folder?: string }>;
			selectPchListFile: () => Promise<{ success: boolean; filepath?: string }>;
		};
		cli: CliService;
	}
}
