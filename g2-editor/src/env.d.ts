/// <reference types="vite/client" />

declare module "*.vue" {
	import type { DefineComponent } from "vue";
	const component: DefineComponent<{}, {}, any>;
	export default component;
}

interface Window {
	__g2DragTypeId?: number;
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
