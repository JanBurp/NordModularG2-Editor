/// <reference types="vite/client" />
import type { MenuAction } from './types/index';
import type { CliService } from './types/cli';

declare module '*.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent<{}, {}, any>;
	export default component;
}

declare global {
	interface Window {
		electronAPI: {
			patches: {
				list: (folder: string) => Promise<{
					success: boolean;
					entries: { name: string; path: string; isDir: boolean }[];
					error?: string;
				}>;
				load: (filepath: string) => Promise<{ success: boolean; data?: number[]; error?: string }>;
				setFolder: () => Promise<{ success: boolean; folder?: string }>;
			};
			onMenuAction: (cb: (action: MenuAction) => void) => void;
			offMenuAction: () => void;
			savePatch: (filepath: string, data: number[]) => Promise<void>;
			showSaveDialog: (defaultName?: string) => Promise<{ success: boolean; filepath?: string }>;
			showSavePerfDialog: (defaultName?: string) => Promise<{ success: boolean; filepath?: string }>;
			openPatchDialog: () => Promise<{
				success: boolean;
				filepath?: string;
				data?: number[];
				error?: string;
			}>;
		};
		cli: CliService;
	}
}
