export interface CliService {
	run(args: string[]): Promise<string>;
	runBatch(argsList: string[][]): Promise<string[]>;
	watchStart(): Promise<void>;
	watchStop(): void;
	onWatchEvent(cb: (line: string) => void): void;
	offWatchEvent(): void;
	onWatchDone(cb: () => void): void;
	offWatchDone(): void;
	onDeviceDisconnected(cb: () => void): void;
	offDeviceDisconnected(): void;
}
