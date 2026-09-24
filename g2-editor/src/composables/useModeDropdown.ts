import { createSingletonDropdown } from './useSingletonDropdown';
import type { ParamDefinition } from '../types';

type ModeDropdownBase = {
	paramDef: ParamDefinition | null;
	value: number;
	moduleId: number | undefined;
	lv: number[] | undefined;
};

const { state, openAt, close, select } = createSingletonDropdown<ModeDropdownBase, number>({
	paramDef: null,
	value: 0,
	moduleId: undefined,
	lv: undefined,
});

export function useModeDropdown() {
	function open(x: number, y: number, paramDef: ParamDefinition, value: number, onSelect: (value: number) => void, moduleId?: number, lv?: number[]) {
		openAt(x, y, onSelect, { paramDef, value, moduleId, lv });
	}

	return { state, open, close, select };
}
