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

// BFS from an input jack over its dir=0 "nest" to find the output cable already driving it, if any.
export function findDrivingOutputCable(cableList: Cable[], startMod: number, startCon: number): Cable | null {
	const visited = new Set<string>();
	const queue: { mod: number; con: number }[] = [{ mod: startMod, con: startCon }];
	while (queue.length > 0) {
		const { mod, con } = queue.shift()!;
		const key = `${mod}-${con}`;
		if (visited.has(key)) continue;
		visited.add(key);
		const driver = cableList.find((c) => (c.dir ?? 1) === 1 && (c.dmod ?? 0) === mod && (c.dcon ?? 0) === con);
		if (driver) return driver;
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
	return null;
}

type NestJack = { mod: number; con: number; type: 'input' | 'output' };

function nestJackKey(j: NestJack): string {
	return `${j.mod}-${j.con}-${j.type}`;
}

// A cable's two endpoints as (mod, con, type) jacks: a dir=1 cable runs output->input, a dir=0
// cable straps two inputs together.
function cableEndpoints(c: Cable): [NestJack, NestJack] {
	const isOutputSource = (c.dir ?? 1) === 1;
	return [
		{ mod: c.smod ?? 0, con: c.scon ?? 0, type: isOutputSource ? 'output' : 'input' },
		{ mod: c.dmod ?? 0, con: c.dcon ?? 0, type: 'input' },
	];
}

// BFS over the whole cable graph (jacks as nodes, cables as edges) to find every cable reachable
// from a jack, however many hops away — the entire nest: stacked inputs, their driving output,
// and every other destination that output fans out to — regardless of which jack in the chain
// (start, middle, or end) you start from.
export function findJackNestCables(cableList: Cable[], startMod: number, startCon: number, startType: 'input' | 'output'): Cable[] {
	const visited = new Set<string>();
	const result: Cable[] = [];
	const queue: NestJack[] = [{ mod: startMod, con: startCon, type: startType }];
	while (queue.length > 0) {
		const jack = queue.shift()!;
		const key = nestJackKey(jack);
		if (visited.has(key)) continue;
		visited.add(key);
		for (const c of cableList) {
			const [a, b] = cableEndpoints(c);
			const touchesA = a.mod === jack.mod && a.con === jack.con && a.type === jack.type;
			const touchesB = b.mod === jack.mod && b.con === jack.con && b.type === jack.type;
			if (!touchesA && !touchesB) continue;
			if (!result.includes(c)) result.push(c);
			queue.push(touchesA ? b : a);
		}
	}
	return result;
}

// Whether any output cable already drives the nest connected to this input jack.
export function isNestDrivenByOutput(cableList: Cable[], startMod: number, startCon: number): boolean {
	return findDrivingOutputCable(cableList, startMod, startCon) !== null;
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

const isDynamic = (colour: string | undefined) => colour === 'purple' || colour === 'orange';

// Computes which modules are uprated (audio-rate promoted) given the current cable topology,
// mirroring CPatchData::GenerateBandwidthChangeMolecules in G2Editor.c: a module is uprated when
// any of its Dynamic (purple/orange) inputs is driven — directly or via an input-to-input chain —
// by a static red output, or by a Dynamic output of an already-uprated module.
// Iterates to fixed-point to handle cascading uprate.
export function computeUprateSet(cables: Cable[], modules: Array<{ index: number; def: ModuleDefinition }>): Set<number> {
	const uprated = new Set<number>();
	const modDefs = new Map(modules.map((m) => [m.index, m.def]));
	let changed = true;
	while (changed) {
		changed = false;
		for (const { index, def } of modules) {
			if (uprated.has(index)) continue;
			const audioDriven = (def.inputs ?? []).some((input, con) => {
				if (!isDynamic(input.colour)) return false;
				const driver = findDrivingOutputCable(cables, index, con);
				if (!driver) return false;
				const srcColour = modDefs.get(driver.smod)?.outputs?.[driver.scon]?.colour;
				return srcColour === 'red' || (isDynamic(srcColour) && uprated.has(driver.smod));
			});
			if (audioDriven) {
				uprated.add(index);
				changed = true;
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

// Infers which cables carry an explicit user colour, for cables just parsed from the wire
// format (hardware or .pch2 file) — that format has no spare bits to persist userColour itself.
// A cable is inferred user-set when its stored colour differs from what a fresh auto-recolor
// pass would compute for it right now.
// Known limitation: if a user's chosen colour happens to equal the current auto default for
// that jack/uprate state, it's indistinguishable from "never set" and may revert on a later
// topology change — unavoidable given the wire format has no spare bits.
export function inferUserColours(cables: Cable[], uprateSet: Set<number>, modDefs: Map<number, ModuleDefinition>): Cable[] {
	const stripped = cables.map((c) => {
		const { userColour, ...rest } = c;
		return rest as Cable;
	});
	const natural = autoRecolorCables(stripped, uprateSet, modDefs);
	return cables.map((c, i) => {
		if (c.userColour !== undefined) return c;
		return c.colour !== natural[i].colour ? { ...c, userColour: c.colour } : c;
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
