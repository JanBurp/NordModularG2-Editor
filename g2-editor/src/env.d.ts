/// <reference types="vite/client" />

declare module "*.vue" {
	import type { DefineComponent } from "vue";
	const component: DefineComponent<{}, {}, any>;
	export default component;
}

interface Window {
	__g2DragTypeId?: number;
	electronAPI: {
		patches: {
			list:      (folder: string) => Promise<{ success: boolean; entries: { name: string; path: string; isDir: boolean }[]; error?: string }>;
			load:      (filepath: string) => Promise<{ success: boolean; data?: number[]; error?: string }>;
			setFolder: () => Promise<{ success: boolean; folder?: string }>;
		};
	};
	cli: {
		run: (args: string[]) => Promise<string>;
		runBatch: (argsList: string[][]) => Promise<string[]>;
		watchStart: () => void;
		watchStop: () => void;
		onWatchEvent: (cb: (line: string) => void) => void;
		offWatchEvent: () => void;
		onWatchDone: (cb: () => void) => void;
		offWatchDone: () => void;
		onDeviceDisconnected: (cb: () => void) => void;
		offDeviceDisconnected: () => void;
	};
}
