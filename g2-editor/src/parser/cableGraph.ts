import type { Cable } from '@/renderer/cableRenderer';

// BFS over dir=0 (input-to-input) cables to find all cables transitively connected to a given input jack
export function findConnectedInputCables(cableList: Cable[], startMod: number, startCon: number): Cable[] {
	const visitedJacks = new Set<string>();
	const result: Cable[] = [];
	const queue: { mod: number; con: number }[] = [{ mod: startMod, con: startCon }];
	while (queue.length > 0) {
		const { mod, con } = queue.shift()!;
		const key = `${mod}-${con}`;
		if (visitedJacks.has(key)) continue;
		visitedJacks.add(key);
		for (const cable of cableList) {
			if ((cable.dir ?? 1) !== 0 || result.includes(cable)) continue;
			const csmod = cable.smod ?? 0,
				cscon = cable.scon ?? 0,
				cdmod = cable.dmod ?? 0,
				cdcon = cable.dcon ?? 0;
			if (csmod === mod && cscon === con) {
				result.push(cable);
				queue.push({ mod: cdmod, con: cdcon });
			} else if (cdmod === mod && cdcon === con) {
				result.push(cable);
				queue.push({ mod: csmod, con: cscon });
			}
		}
	}
	return result;
}

// BFS from an input jack to determine whether any output cable already drives the connected nest.
export function isNestDrivenByOutput(cableList: Cable[], startMod: number, startCon: number): boolean {
	const visited = new Set<string>();
	const queue: { mod: number; con: number }[] = [{ mod: startMod, con: startCon }];
	while (queue.length > 0) {
		const { mod, con } = queue.shift()!;
		const key = `${mod}-${con}`;
		if (visited.has(key)) continue;
		visited.add(key);
		if (cableList.some((c) => (c.dir ?? 1) === 1 && (c.dmod ?? 0) === mod && (c.dcon ?? 0) === con)) return true;
		for (const c of cableList) {
			if ((c.dir ?? 1) !== 0) continue;
			const sm = c.smod ?? 0, sc = c.scon ?? 0, dm = c.dmod ?? 0, dc = c.dcon ?? 0;
			if (sm === mod && sc === con) queue.push({ mod: dm, con: dc });
			else if (dm === mod && dc === con) queue.push({ mod: sm, con: sc });
		}
	}
	return false;
}

// Returns the colour of any output already driving the combined input group of (smod,scon) and (dmod,dcon).
// Falls back to 6 (white) when no output is connected.
export function findGroupOutputColor(cableList: Cable[], smod: number, scon: number, dmod: number, dcon: number): number {
	const inputJacks = new Set<string>([`${smod}-${scon}`, `${dmod}-${dcon}`]);
	for (const c of [...findConnectedInputCables(cableList, smod, scon), ...findConnectedInputCables(cableList, dmod, dcon)]) {
		inputJacks.add(`${c.smod ?? 0}-${c.scon ?? 0}`);
		inputJacks.add(`${c.dmod ?? 0}-${c.dcon ?? 0}`);
	}
	for (const c of cableList) {
		if ((c.dir ?? 1) === 1 && inputJacks.has(`${c.dmod ?? 0}-${c.dcon ?? 0}`)) return c.colour;
	}
	return 6; // white
}
