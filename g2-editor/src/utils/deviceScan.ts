// Unclaimed G2 ids seen on this scan and on the previous one: only those are added as new devices
// (see scanForDevices in electron/main.ts).
export function confirmedNewDevices(previous: string[], current: string[]): string[] {
	return current.filter((id) => previous.includes(id));
}
