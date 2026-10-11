import { computed, ref } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { getParam } from '../renderer/parammap';
import type { ModuleParam, ParamDefinition, ParamLabel } from '../types';
import { clamp } from '@/utils/math';

function resolveOptionNames(paramDef: ParamDefinition): string[] {
	const def = paramDef.defin;
	if (def && def.length > 0) {
		const options = def[0].split(',').map((s) => {
			const parts = s.split('~');
			return parts.length >= 2 ? parts[1].trim() : s.trim();
		});
		if (options.length > 0 && options[0] !== '') return options;
	}
	return paramDef.names || [];
}

// Text shown for a switch's option(s), honouring user labels. Shared by the canvas switch and ParamPages.
export function resolveSwitchDisplayNames(param: ModuleParam, paramDef: ParamDefinition, label: ParamLabel | undefined): string[] | string {
	const names = paramDef.names || [];
	if (label) {
		const customLabels = label.labels;
		const baseNames = param.label ?? (names.length > 0 ? names : resolveOptionNames(paramDef));
		if (!Array.isArray(baseNames)) return customLabels;
		// '' counts as "never customized" too (older saves / hardware entries), else the button renders blank
		const count = Math.max(baseNames.length, customLabels.length);
		return Array.from({ length: count }, (_, i) => customLabels[i] || (baseNames as string[])[i] || '');
	}
	if (param.label) return param.label;
	if (names[0] === 'Ch#' && param.name) {
		const last = param.name.substring(param.name.length - 1);
		if (!isNaN(Number(last))) return ['Ch ' + last];
	}
	if (names.length === 1) {
		if (names[0] === '') return '';
		return [param.name];
	}
	if (names.length > 0) return names;
	return resolveOptionNames(paramDef);
}

export function useSwitch(
	param: Ref<ModuleParam> | ComputedRef<ModuleParam>,
	value: Ref<number> | ComputedRef<number>,
	label: Ref<ParamLabel | undefined> | ComputedRef<ParamLabel | undefined>,
	paramIndex: Ref<number> | ComputedRef<number>,
	emitChange: (index: number, value: number) => void,
	_emitLabelEdit?: (info: { paramIndex: number; currentLabel: string }) => void,
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

	const optionNames = computed(() => resolveOptionNames(paramDef.value));

	const displayNames = computed(() => resolveSwitchDisplayNames(param.value, paramDef.value, label.value));

	const itemsPerRow = computed(() => Math.ceil(names.value.length / rows.value));

	const isTrigger = computed(() => paramDef.value.trigger === true);
	const triggerActive = ref(false);

	const activeIndex = computed(() => {
		if (isTrigger.value) return triggerActive.value ? 1 : 0;
		const low = paramDef.value.low || 0;
		const high = paramDef.value.high || names.value.length - 1 || 0;
		return clamp(value.value, low, high);
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
		const current = clamp(value.value, low, high);
		emitChange(paramIndex.value, low + ((current - low + 1) % range));
	}

	// Button index clicked last, until the mouse leaves it
	let cycleAnchor: number | null = null;

	function onButtonClick(index: number) {
		if (mode.value !== 'VR' && mode.value !== 'HR') {
			onCycleValue();
		} else {
			const low = paramDef.value.low || 0;
			const high = paramDef.value.high || names.value.length - 1 || 0;
			const newValue = clamp(index, low, high);
			// Repeated clicks without leaving the button (or a click on the active option) cycle to the next option
			if (cycleAnchor === index || newValue === activeIndex.value) onCycleValue();
			else emitChange(paramIndex.value, newValue);
			cycleAnchor = index;
		}
	}

	function onButtonLeave() {
		cycleAnchor = null;
	}

	function onTriggerDown() {
		triggerActive.value = true;
		emitChange(paramIndex.value, 1);
	}

	function onTriggerUp() {
		triggerActive.value = false;
		emitChange(paramIndex.value, 0);
	}

	return {
		paramDef,
		names,
		defin,
		width,
		mode,
		rows,
		bmp,
		hasBitmap,
		maskh,
		optionNames,
		displayNames,
		activeIndex,
		singleButtonMode,
		activeOptionName,
		itemsPerRow,
		getButtonX,
		getButtonY,
		onButtonClick,
		onButtonLeave,
		onCycleValue,
		isTrigger,
		onTriggerDown,
		onTriggerUp,
	};
}
