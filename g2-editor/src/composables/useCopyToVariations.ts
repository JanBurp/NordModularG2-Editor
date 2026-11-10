import type { ContextMenuItem } from '@/types';
import { copyModuleParams, type VariationCopy } from '@/store/slotHelpers';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';

const USER_VARIATIONS = [0, 1, 2, 3, 4, 5, 6, 7];

// Copy to Variations from the current variation: to `target` ('all' = every other variation, else one variation).
export function copyToVariations(target: number | 'all', copy: VariationCopy): Promise<void> {
	return useSlotsStore().copyToVariations(target === 'all' ? USER_VARIATIONS : [target], copy);
}

// "<label> ▸ All Variations / Variation 1…8" (the current variation, the source, disabled).
export function buildCopyToVariationsItem(label: string, copy: VariationCopy, disabled = false): ContextMenuItem {
	const current = useUiStore().variation;
	return {
		label,
		disabled,
		children: [
			{ label: 'All Variations', action: () => copyToVariations('all', copy) },
			{ type: 'separator' },
			...USER_VARIATIONS.map((v) => ({ label: `Variation ${v + 1}`, disabled: v === current, action: () => copyToVariations(v, copy) })),
		],
	};
}

// Module(s) or one module param: values only, and values with their morph ranges.
export function buildCopyParamsToVariationsItems(area: 'voice' | 'fx', moduleIds: number[], paramIdx?: number): ContextMenuItem[] {
	return [
		buildCopyToVariationsItem('Copy to Variations', copyModuleParams(area, moduleIds, paramIdx, false)),
		buildCopyToVariationsItem('Copy with Morphs to Variations', copyModuleParams(area, moduleIds, paramIdx, true)),
	];
}
