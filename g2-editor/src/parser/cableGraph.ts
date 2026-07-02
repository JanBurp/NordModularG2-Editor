import type { Cable } from '@/renderer/cableRenderer';
import type { ModuleDefinition } from '@/types/module';
import { getEffectiveJackColor, jackColorNameToIndex } from '@/constants/cableColors';

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
			const sm = c.smod ?? 0,
				sc = c.scon ?? 0,
				dm = c.dmod ?? 0,
				dc = c.dcon ?? 0;
			if (sm === mod && sc === con) queue.push({ mod: dm, con: dc });
			else if (dm === mod && dc === con) queue.push({ mod: sm, con: sc });
		}
	}
	return false;
}

// BFS outward from every output cable over dir=0 edges to find all input jacks whose nest is already driven by an output.
export function computeDrivenInputJacks(cableList: Cable[]): Set<string> {
	const dir0Cables = cableList.filter((c) => (c.dir ?? 1) === 0);
	const drivenNestJacks = new Set<string>();
	for (const c of cableList) {
		if ((c.dir ?? 1) !== 1) continue;
		const queue: { mod: number; con: number }[] = [{ mod: c.dmod ?? 0, con: c.dcon ?? 0 }];
		while (queue.length > 0) {
			const { mod, con } = queue.shift()!;
			const key = `${mod}-${con}`;
			if (drivenNestJacks.has(key)) continue;
			drivenNestJacks.add(key);
			for (const dc of dir0Cables) {
				const sm = dc.smod ?? 0,
					sc = dc.scon ?? 0,
					dm = dc.dmod ?? 0,
					dc2 = dc.dcon ?? 0;
				if (sm === mod && sc === con) queue.push({ mod: dm, con: dc2 });
				else if (dm === mod && dc2 === con) queue.push({ mod: sm, con: sc });
			}
		}
	}
	return drivenNestJacks;
}

// Computes which modules are uprated (audio-rate promoted) given the current cable topology.
// A module is uprated when any of its blue/yellow/purple inputs receives a red/orange signal.
// The red/orange can come from a static-red output OR from a blue/purple output whose module is already uprated.
// Iterates to fixed-point to handle cascading uprate.
export function computeUprateSet(cables: Cable[], modules: Array<{ index: number; def: ModuleDefinition }>): Set<number> {
	const uprated = new Set<number>();
	const modDefs = new Map(modules.map((m) => [m.index, m.def]));
	let changed = true;
	while (changed) {
		changed = false;
		for (const cable of cables) {
			if ((cable.dir ?? 1) !== 1) continue;
			const srcDef = modDefs.get(cable.smod);
			const dstDef = modDefs.get(cable.dmod);
			if (!srcDef || !dstDef) continue;
			const srcOutput = srcDef.outputs?.[cable.scon];
			const dstInput = dstDef.inputs?.[cable.dcon];
			if (!srcOutput || !dstInput) continue;
			const effectiveSrc = getEffectiveJackColor(srcOutput.colour, uprated.has(cable.smod));
			// Destination is uprate-eligible if its base colour is blue or yellow (purple normalised to blue)
			const dstBase = dstInput.colour === 'purple' ? 'blue' : dstInput.colour;
			if ((effectiveSrc === 'red' || effectiveSrc === 'orange') && (dstBase === 'blue' || dstBase === 'yellow')) {
				if (!uprated.has(cable.dmod)) {
					uprated.add(cable.dmod);
					changed = true;
				}
			}
		}
	}
	return uprated;
}

// Recolors all auto-colored cables (those without userColour) to match the effective signal rate.
// dir=1 cables get the effective colour of their source output jack.
// dir=0 cables get the colour of the output driving their input group (or white if none).
export function autoRecolorCables(cables: Cable[], uprateSet: Set<number>, modDefs: Map<number, ModuleDefinition>): Cable[] {
	const pass1 = cables.map((cable) => {
		if (cable.userColour !== undefined) return cable;
		if ((cable.dir ?? 1) !== 1) return cable;
		const srcDef = modDefs.get(cable.smod);
		const srcOutput = srcDef?.outputs?.[cable.scon];
		if (!srcOutput) return cable;
		const effectiveColour = getEffectiveJackColor(srcOutput.colour, uprateSet.has(cable.smod));
		const newIndex = jackColorNameToIndex(effectiveColour);
		return newIndex !== cable.colour ? { ...cable, colour: newIndex } : cable;
	});

	return pass1.map((cable) => {
		if (cable.userColour !== undefined) return cable;
		if ((cable.dir ?? 1) !== 0) return cable;
		const groupColor = findGroupOutputColor(pass1, cable.smod ?? 0, cable.scon ?? 0, cable.dmod ?? 0, cable.dcon ?? 0);
		return groupColor !== cable.colour ? { ...cable, colour: groupColor } : cable;
	});
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
