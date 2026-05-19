import { ref } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { CABLE_COLOR_INDEX_MAP } from '../constants';

type JackInfo = {
	moduleIndex: number;
	connectorIndex: number;
	type: 'input' | 'output';
	colour: string;
};

function jackColourToIndex(colour: string): number {
	const entry = Object.entries(CABLE_COLOR_INDEX_MAP).find(([, name]) => name === colour);
	return entry ? Number(entry[0]) : 1;
}

function isNestDrivenByOutput(cableList: any[], startMod: number, startCon: number): boolean {
	const visited = new Set<string>();
	const queue: { mod: number; con: number }[] = [{ mod: startMod, con: startCon }];
	while (queue.length > 0) {
		const { mod, con } = queue.shift()!;
		const key = `${mod}-${con}`;
		if (visited.has(key)) continue;
		visited.add(key);
		if (cableList.some((c: any) => (c.dir ?? 1) === 1 && (c.dmod ?? 0) === mod && (c.dcon ?? 0) === con)) return true;
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

export function useJackPatching() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const dragSource = ref<JackInfo | null>(null);

	function handleJackDragStart(info: JackInfo): void {
		dragSource.value = info;
	}

	async function handleJackDragEnd(info: JackInfo): Promise<void> {
		const src = dragSource.value;
		dragSource.value = null;
		if (!src || !info) return;
		if (src.moduleIndex === info.moduleIndex && src.connectorIndex === info.connectorIndex && src.type === info.type) return;
		if (src.type === 'output' && info.type === 'output') return; // output→output not allowed

		if (src.type === info.type) {
			// input-to-input: white cable, dir=0
			await slotsStore.addCable(
				src.moduleIndex,
				0,
				src.connectorIndex,
				info.moduleIndex,
				0,
				info.connectorIndex,
				uiStore.area === 1 ? 'voice' : 'fx',
				6, // white
			);
		} else {
			const output = src.type === 'output' ? src : info;
			const input = src.type === 'input' ? src : info;
			const cableList = slotsStore.getAreaCables(uiStore.slotInFocus, uiStore.area as 0 | 1);
			if (isNestDrivenByOutput(cableList, input.moduleIndex, input.connectorIndex)) return;
			await slotsStore.addCable(
				output.moduleIndex,
				1,
				output.connectorIndex,
				input.moduleIndex,
				0,
				input.connectorIndex,
				uiStore.area === 1 ? 'voice' : 'fx',
				jackColourToIndex(output.colour),
			);
		}
	}

	return { dragSource, handleJackDragStart, handleJackDragEnd };
}
