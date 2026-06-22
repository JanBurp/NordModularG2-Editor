import { ref } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { CABLE_COLOR_INDEX_MAP } from '../constants';
import { isNestDrivenByOutput } from '../parser/cableGraph';

type JackInfo = {
	moduleIndex: number;
	connectorIndex: number;
	type: 'input' | 'output';
	colour: string;
	area?: 0 | 1;
};

function jackColourToIndex(colour: string): number {
	const entry = Object.entries(CABLE_COLOR_INDEX_MAP).find(([, name]) => name === colour);
	return entry ? Number(entry[0]) : 1;
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

		const srcArea = src.area ?? 0;
		if (src.type === info.type) {
			// input-to-input: white cable, dir=0
			await slotsStore.addCable(
				src.moduleIndex,
				0,
				src.connectorIndex,
				info.moduleIndex,
				0,
				info.connectorIndex,
				srcArea === 1 ? 'voice' : 'fx',
				6, // white
			);
		} else {
			const output = src.type === 'output' ? src : info;
			const input = src.type === 'input' ? src : info;
			const cableList = slotsStore.getAreaCables(uiStore.slotInFocus, srcArea);
			if (isNestDrivenByOutput(cableList, input.moduleIndex, input.connectorIndex)) return;
			await slotsStore.addCable(
				output.moduleIndex,
				1,
				output.connectorIndex,
				input.moduleIndex,
				0,
				input.connectorIndex,
				srcArea === 1 ? 'voice' : 'fx',
				jackColourToIndex(output.colour),
			);
		}
	}

	return { dragSource, handleJackDragStart, handleJackDragEnd };
}
