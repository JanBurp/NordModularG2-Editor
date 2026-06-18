import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import { getParam } from '../renderer/parammap';
import type { ModuleInstance, ModuleDefinition, ParamLabel } from '../types';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { clamp } from '@/utils/math';

export function useModuleParams(
	instance: ComputedRef<ModuleInstance>,
	moduleDef: ComputedRef<ModuleDefinition | null>,
	areaLabel: 'fx' | 'va',
	emitParamChange: (moduleIndex: number, paramIndex: number, value: number, immediate?: boolean) => void,
	emitModeChange: (moduleIndex: number, index: number, value: number) => void,
) {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const areaKey = areaLabel === 'va' ? 'voice' : 'fx';

	const localLv = computed<number[]>(() => {
		const params = slotsStore.slots[uiStore.slotInFocus]
			?.variations?.[uiStore.variation]
			?.[areaKey]?.[instance.value.index];
		if (params) return params;
		return moduleDef.value?.params?.map((param) => {
			const p = getParam(param.type);
			return p?.def ?? 64;
		}) ?? [];
	});

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

	function onParamChange(paramIndex: number, value: number, immediate?: boolean) {
		const param = moduleDef.value?.params?.[paramIndex];
		if (param) {
			const p = getParam(param.type);
			if (p) {
				value = clamp(value, p.low, p.high);
			}
		}
		emitParamChange(instance.value.index || 0, paramIndex, value, immediate);
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
