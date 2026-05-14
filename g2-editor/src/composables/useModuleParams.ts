import { ref, watch } from 'vue';
import type { ComputedRef } from 'vue';
import { getParam } from '../renderer/parammap';
import type { ModuleInstance, ModuleDefinition, ParamLabel } from '../types';

export function useModuleParams(
	instance: ComputedRef<ModuleInstance>,
	moduleDef: ComputedRef<ModuleDefinition | null>,
	emitParamChange: (moduleIndex: number, paramIndex: number, value: number) => void,
	emitModeChange: (moduleIndex: number, index: number, value: number) => void,
) {
	const localLv = ref<number[]>([]);

	watch(
		() => instance.value.lv,
		(newLv) => {
			if (newLv) {
				localLv.value = [...newLv];
			} else {
				localLv.value =
					moduleDef.value?.params?.map((param) => {
						const p = getParam(param.type);
						return p?.def ?? 64;
					}) || [];
			}
		},
		{ immediate: true },
	);

	function getParamValue(index: number): number {
		if (localLv.value.length > index) {
			return localLv.value[index];
		}
		const param = moduleDef.value?.params?.[index];
		if (param) {
			const p = getParam(param.type);
			return p?.def ?? 64;
		}
		return 64;
	}

	function getParamLabel(index: number): ParamLabel | undefined {
		if (typeof instance.value.paramLabels === 'undefined' || instance.value.paramLabels?.length === 0) return undefined;
		const idx = instance.value.paramLabels.findIndex((label) => label.paramIndex === index);
		if (idx < 0) return undefined;
		return instance.value.paramLabels[idx];
	}

	function onParamChange(paramIndex: number, value: number) {
		const param = moduleDef.value?.params?.[paramIndex];
		if (param) {
			const p = getParam(param.type);
			if (p) {
				value = Math.min(Math.max(value, p.low), p.high);
			}
		}
		localLv.value[paramIndex] = value;
		emitParamChange(instance.value.index || 0, paramIndex, value);
	}

	function getModeValue(index: number): number {
		if (instance.value.modes && instance.value.modes.length > index) {
			return instance.value.modes[index];
		}
		return 0;
	}

	function onModeChange(index: number, value: number) {
		if (instance.value.modes && instance.value.modes.length > index) {
			instance.value.modes[index] = value;
		}
		emitModeChange(instance.value.index || 0, index, value);
	}

	return { localLv, getParamValue, getParamLabel, onParamChange, getModeValue, onModeChange };
}
