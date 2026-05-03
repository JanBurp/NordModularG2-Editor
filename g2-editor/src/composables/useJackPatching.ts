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
		if (src.type === info.type) return; // can't connect two inputs or two outputs

		const output = src.type === 'output' ? src : info;
		const input = src.type === 'input' ? src : info;
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

	return { dragSource, handleJackDragStart, handleJackDragEnd };
}
