import { computed } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { getParam } from '../renderer/parammap';
import type { ModuleParam, ParamDefinition, ParamLabel } from '../types';
import { useContextMenu } from './useContextMenu';

export function useSwitch(
	param: Ref<ModuleParam> | ComputedRef<ModuleParam>,
	value: Ref<number> | ComputedRef<number>,
	label: Ref<ParamLabel | undefined> | ComputedRef<ParamLabel | undefined>,
	paramIndex: Ref<number> | ComputedRef<number>,
	emitChange: (index: number, value: number) => void,
	emitLabelEdit?: (info: { paramIndex: number; currentLabel: string }) => void,
) {
	const paramDef = computed<ParamDefinition>(() => getParam(param.value.type) || ({} as ParamDefinition));
	const names = computed(() => paramDef.value.names || []);
	const defin = computed(() => paramDef.value.defin || []);
	const width = computed(() => param.value.w || paramDef.value.width || 18);
	const mode = computed(() => paramDef.value.mode);
	const rows = computed(() => paramDef.value.rows || 1);
	const bmp = computed(() => paramDef.value.bmp);
	const hasBitmap = computed(() => !!bmp.value);
	const maskh = computed(() => paramDef.value.maskh || 11);

	const optionNames = computed(() => {
		const def = defin.value;
		if (def && def.length > 0) {
			const options = def[0].split(',').map((s) => {
				const parts = s.split('~');
				return parts.length >= 2 ? parts[1].trim() : s.trim();
			});
			if (options.length > 0 && options[0] !== '') return options;
		}
		return names.value;
	});

	const displayNames = computed(() => {
		if (label.value) return label.value.labels;
		if (names.value[0] === 'Ch#' && param.value.name) {
			const name = param.value.name;
			const last = name.substring(name.length - 1);
			if (!isNaN(Number(last))) return ['Ch ' + last];
		}
		if (names.value.length === 1) {
			if (names.value[0] === '') return '';
			return [param.value.name];
		}
		if (names.value && names.value.length > 0) return names.value;
		return optionNames.value;
	});

	const itemsPerRow = computed(() => Math.ceil(names.value.length / rows.value));

	const activeIndex = computed(() => {
		const low = paramDef.value.low || 0;
		const high = paramDef.value.high || names.value.length - 1 || 0;
		return Math.max(low, Math.min(value.value, high));
	});

	const singleButtonMode = computed(() => mode.value !== 'VR' && mode.value !== 'HR');

	const activeOptionName = computed(() => {
		const idx = activeIndex.value;
		const dn = displayNames.value;
		return Array.isArray(dn) ? (dn[idx] ?? dn[0]) : dn;
	});

	function getButtonX(index: number): number {
		if (mode.value === 'VR') return 0;
		return (index % itemsPerRow.value) * width.value;
	}

	function getButtonY(index: number): number {
		if (mode.value === 'VR') return index * 11;
		if (mode.value === 'HR') return Math.floor(index / itemsPerRow.value) * 11;
		return 0;
	}

	function onCycleValue() {
		const low = paramDef.value.low || 0;
		const high = paramDef.value.high || names.value.length - 1 || 0;
		const range = high - low + 1;
		const current = Math.max(low, Math.min(value.value, high));
		emitChange(paramIndex.value, low + ((current - low + 1) % range));
	}

	function onButtonClick(index: number) {
		if (mode.value !== 'VR' && mode.value !== 'HR') {
			onCycleValue();
		} else {
			const low = paramDef.value.low || 0;
			const high = paramDef.value.high || names.value.length - 1 || 0;
			const newValue = Math.max(low, Math.min(index, high));
			if (newValue !== value.value) emitChange(paramIndex.value, newValue);
		}
	}

	const { open: openContextMenu } = useContextMenu();

	function onContextMenu(e: MouseEvent) {
		if (!emitLabelEdit) return;
		openContextMenu(e, [
			{ label: 'Rename label', action: () => emitLabelEdit!({ paramIndex: paramIndex.value, currentLabel: label.value?.labels[0] ?? '' }) },
		]);
	}

	return {
		paramDef, names, defin, width, mode, rows, bmp, hasBitmap, maskh,
		optionNames, displayNames, activeIndex, singleButtonMode, activeOptionName,
		itemsPerRow, getButtonX, getButtonY, onButtonClick, onCycleValue, onContextMenu,
	};
}
