import { ref, computed } from 'vue';
import { getParam } from '../renderer/parammap';
import { getModule } from '../renderer/nmg2mods';
import type { ModuleDefinition, ModuleParam, ParamDefinition } from '../types/index';
import { useSlotsStore } from '../store/slots';
import { useUiStore } from '../store/ui';
import { clamp } from '@/utils/math';
import { formatParamDisplay, isSwitch, type ParamValueOption } from '@/utils/moduleControls';

interface Editing {
	moduleIndex: number;
	paramIndex: number;
	area: 'fx' | 'voice';
	def: ParamDefinition;
	moduleDef: ModuleDefinition;
	values: number[];
	modes: number[];
}

// Singleton state shared between the openers (context menu, Shift+click, `=` key) and the popup (renderer)
const showDialog = ref(false);
const editing = ref<Editing | null>(null);
const position = ref({ x: 0, y: 0 });

// Switches have their own click/label UI; every other param gets the Set Value popup.
export function isValueEditable(param: ModuleParam | undefined): boolean {
	return !!param && !isSwitch(param.n);
}

export function useParamEditDialog() {
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const isEnumParam = computed(() => (editing.value?.def.names?.length ?? 0) > 1);

	// Every raw value low..high with the label the module would show for it, so mode-dependent
	// displays (Osc FreqMode, Delay range, …) list values in the current mode's units.
	const options = computed<ParamValueOption[]>(() => {
		const e = editing.value;
		if (!e) return [];
		const values = [...e.values];
		const result: ParamValueOption[] = [];
		for (let raw = e.def.low; raw <= e.def.high; raw++) {
			values[e.paramIndex] = raw;
			const label = (isEnumParam.value && e.def.names?.[raw - e.def.low]) || formatParamDisplay(e.moduleDef, e.paramIndex, values, e.modes);
			result.push({ raw, label });
		}
		return result;
	});

	const currentValue = computed(() => editing.value?.values[editing.value.paramIndex] ?? 0);
	const currentLabel = computed(() => options.value.find((o) => o.raw === currentValue.value)?.label ?? String(currentValue.value));

	function openParamEdit(info: { area: 'fx' | 'va'; moduleIndex: number; paramIndex: number; x: number; y: number }) {
		const areaIdx = info.area === 'va' ? 1 : 0;
		const area = info.area === 'va' ? 'voice' : 'fx';
		const slot = uiStore.slotInFocus;
		const mod = slotsStore.getAreaModules(slot, areaIdx).find((m) => m.index === info.moduleIndex);
		const moduleDef = mod && getModule(mod.type);
		const param = moduleDef?.params?.[info.paramIndex];
		const def = param && getParam(param.type);
		if (!moduleDef || !def || !isValueEditable(param)) return;
		const values = slotsStore.slots[slot]?.variations?.[uiStore.variation]?.[area]?.[info.moduleIndex] ?? [];
		editing.value = { moduleIndex: info.moduleIndex, paramIndex: info.paramIndex, area, def, moduleDef, values: [...values], modes: mod.modes ?? [] };
		position.value = { x: info.x, y: info.y };
		showDialog.value = true;
	}

	function closeParamEdit() {
		showDialog.value = false;
		editing.value = null;
	}

	async function confirmParamEdit(raw: number) {
		const e = editing.value;
		if (!e) return;
		closeParamEdit();
		await slotsStore.setParam(e.moduleIndex, e.paramIndex, clamp(raw, e.def.low, e.def.high), uiStore.variation, e.area);
	}

	return {
		showDialog,
		position,
		options,
		currentValue,
		currentLabel,
		isEnumParam,
		openParamEdit,
		closeParamEdit,
		confirmParamEdit,
	};
}
