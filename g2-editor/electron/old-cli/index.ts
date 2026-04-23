import { Settings, DeviceInfo } from "./types";

async function run(args: string[]): Promise<string> {
	return window.cli.run(args);
}

export async function connect(): Promise<DeviceInfo> {
	const output = await run(["connect"]);
	return { connected: true, name: "Nord G2" };
}

export async function getSettings(): Promise<Settings> {
	const output = await run(["settings"]);
	return JSON.parse(output);
}

export async function listDevices(): Promise<string[]> {
	const output = await run(["list-devices"]);
	return output.trim().split("\n");
}

export const cli = { run, connect, getSettings, listDevices };
