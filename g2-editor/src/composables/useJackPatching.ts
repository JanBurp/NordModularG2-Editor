import { ref } from 'vue';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { CABLE_COLOR_INDEX_MAP } from '../constants';
import { isNestDrivenByOutput, findDrivingOutputCable } from '../parser/cableGraph';

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

function sameJackInfo(a: JackInfo, b: JackInfo): boolean {
	return a.moduleIndex === b.moduleIndex && a.connectorIndex === b.connectorIndex && a.type === b.type;
}

// Shared across every useJackPatching() call so click-connect mode's armed jack (set from one
// PatchCanvas/App.vue instance) is visible to ModuleJack.vue's highlight logic without prop drilling.
export const armedSource = ref<JackInfo | null>(null);

export function useJackPatching() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const dragSource = ref<JackInfo | null>(null);

	// Validates and creates a cable between two jacks. Returns true iff a cable was actually added.
	async function connectJacks(src: JackInfo, info: JackInfo): Promise<boolean> {
		if (sameJackInfo(src, info)) return false;
		if (src.type === 'output' && info.type === 'output') return false; // output→output not allowed

		const srcArea = src.area ?? 0;
		if (src.type === info.type) {
			// input-to-input: extends a "nest". Refuse if both jacks already belong to nests driven
			// by two different outputs — that would silently merge two independently-driven signal
			// groups (matches the original editor's refusal of a plain drag-connect when both ends
			// already carry a signal on different chains).
			const cableList = slotsStore.getAreaCables(uiStore.slotInFocus, srcArea);
			const srcDriver = findDrivingOutputCable(cableList, src.moduleIndex, src.connectorIndex);
			const dstDriver = findDrivingOutputCable(cableList, info.moduleIndex, info.connectorIndex);
			if (srcDriver && dstDriver && (srcDriver.smod !== dstDriver.smod || srcDriver.scon !== dstDriver.scon)) return false;

			// white cable, dir=0
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
			if (isNestDrivenByOutput(cableList, input.moduleIndex, input.connectorIndex)) return false;
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
		return true;
	}

	function handleJackDragStart(info: JackInfo): void {
		dragSource.value = info;
	}

	async function handleJackDragEnd(info: JackInfo): Promise<void> {
		const src = dragSource.value;
		dragSource.value = null;
		if (!src || !info) return;
		await connectJacks(src, info);
	}

	// Click-connect mode: first click arms a source jack; a second click on the same jack cancels,
	// otherwise attempts to connect (armed state clears either way, per the app's UX decision that
	// an invalid second click also cancels rather than leaving the source armed).
	async function armOrConnect(info: JackInfo): Promise<void> {
		const armed = armedSource.value;
		if (!armed) {
			armedSource.value = info;
			return;
		}
		armedSource.value = null;
		if (sameJackInfo(armed, info)) return;
		await connectJacks(armed, info);
	}

	function clearArmed(): void {
		armedSource.value = null;
	}

	return { dragSource, handleJackDragStart, handleJackDragEnd, connectJacks, armedSource, armOrConnect, clearArmed };
}
