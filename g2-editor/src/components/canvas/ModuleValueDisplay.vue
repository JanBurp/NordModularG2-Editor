<script setup lang="ts">
	import { formatValue, formatCombinedValue } from '@/composables/useModuleControls';

	const props = defineProps<{
		ve: {
			type?: string;
			x?: number;
			y?: number;
			w?: number;
			ref?: number | number[];
			func?: string;
		};
		params: any[];
		values: number[];
	}>();

	function getParamValue(index: number): number {
		return props.values[index] ?? 64;
	}
</script>

<template>
	<rect :x="ve.x" :y="ve.y" :width="ve.w" height="14" fill="#666" />
	<text v-if="ve.ref !== undefined" :x="(ve.x || 0) + (ve.w || 0) / 2" :y="(ve.y || 0) + 10" fill="#fff" font-size="8" text-anchor="middle">
		<template v-if="typeof ve.ref === 'number'">
			{{ formatValue(getParamValue(ve.ref), props.params[ve.ref]?.type || '') }}
		</template>
		<template v-else-if="Array.isArray(ve.ref)">
			{{ formatCombinedValue(ve.ref, ve.func, props.params, values) }}
		</template>
	</text>
</template>
