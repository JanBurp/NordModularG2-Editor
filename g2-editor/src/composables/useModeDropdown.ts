import { reactive } from 'vue';
import type { ParamDefinition } from '../types';

const state = reactive({
	visible: false,
	x: 0,
	y: 0,
	paramDef: null as ParamDefinition | null,
	value: 0,
	moduleId: undefined as number | undefined,
	lv: undefined as number[] | undefined,
	onSelect: null as ((value: number) => void) | null,
});

export function useModeDropdown() {
	function open(x: number, y: number, paramDef: ParamDefinition, value: number, onSelect: (value: number) => void, moduleId?: number, lv?: number[]) {
		state.x = x;
		state.y = y;
		state.paramDef = paramDef;
		state.value = value;
		state.moduleId = moduleId;
		state.lv = lv;
		state.onSelect = onSelect;
		state.visible = true;
	}

	function close() {
		state.visible = false;
	}

	function select(value: number) {
		state.onSelect?.(value);
	}

	return { state, open, close, select };
}
