<template>
	<svg :x="x" :y="y" :width="totalWidth" :height="height" :viewBox="`0 0 ${totalWidth} ${height}`" class="overflow-hidden! cursor-pointer" @click="onClick">
		<rect x="0" y="0" :width="iconWidth" :height="height" fill="#CCC" stroke="#333" />
		<ModuleGraph v-if="isGraph" :ve="graphVe" :lv="lv" :modes="[value]" :module-id="moduleId" />
		<use v-else-if="bitmapId" :href="`#${bitmapId}`" :transform="`translate(${imgShift[0]}, ${offset + imgShift[1]})`" />
		<text
			v-else
			x="50%"
			y="50%"
			:width="iconWidth"
			:height="height"
			fill="#000"
			font-size="9"
			dominant-baseline="middle"
			text-anchor="middle"
			class="cursor-pointer!"
		>
			{{ valueName }}
		</text>
		<template v-if="hasPopup">
			<rect :x="iconWidth" y="0" :width="chevronColWidth" :height="height" fill="#CCC" stroke="#333" />
			<polygon :points="chevronPoints" fill="#555" />
		</template>
	</svg>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import { getParam } from '../../renderer/parammap';
	import { useModeDropdown } from '../../composables/useModeDropdown';
	import ModuleGraph from './ModuleGraph.vue';
	import type { ModuleMode } from '../../types';
	import type { ParamDefinition } from '../../types';

	const props = defineProps<{
		mode: ModuleMode;
		paramIndex: number;
		value: number;
		moduleId?: number;
		lv?: number[];
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
	}>();

	const paramDef = computed<ParamDefinition>(() => {
		return getParam(props.mode.type) || ({} as ParamDefinition);
	});

	const x = computed(() => props.mode.x ?? 0);
	const y = computed(() => props.mode.y ?? 0);
	const iconWidth = computed(() => paramDef.value.width || 18);
	const height = computed(() => paramDef.value.height || 21);

	const isGraph = computed(() => !!paramDef.value.graph);
	const bitmapId = computed(() => paramDef.value.img || '');
	const hasPopup = computed(() => isGraph.value || !!bitmapId.value);
	const itemHeight = computed(() => paramDef.value.h || -18);
	const imgShift = computed(() => paramDef.value.imgShift ?? [0, 0]);

	const offset = computed(() => {
		return props.value * itemHeight.value;
	});

	const graphVe = computed(() => ({
		type: 'graph',
		x: 0,
		y: 0,
		w: iconWidth.value,
		h: height.value,
		f: typeof paramDef.value.graph === 'string' ? paramDef.value.graph : undefined,
	}));

	const valueName = computed(() => {
		if (paramDef.value.defin) {
			const def = paramDef.value.defin[0].split(',');
			return def[props.value].substring(4);
		}
		return props.value;
	});

	// Full-height button segment just outside the icon box, with a divider and centered
	// downward chevron, hinting that this control opens a dropdown. Sized to just fit the triangle.
	const chevronColWidth = 7;
	const totalWidth = computed(() => iconWidth.value + (hasPopup.value ? chevronColWidth : 0));
	const chevronPoints = computed(() => {
		const cx = iconWidth.value + chevronColWidth / 2;
		const cy = height.value / 2;
		return `${cx - 2},${cy - 1.5} ${cx + 2},${cy - 1.5} ${cx},${cy + 1.5}`;
	});

	function onCycleValue() {
		const low = paramDef.value.low || 0;
		const high = paramDef.value.high || 0;
		const range = high - low + 1;
		const current = Math.max(low, Math.min(props.value, high));
		const newValue = low + ((current - low + 1) % range);
		emit('change', props.paramIndex, newValue);
	}

	function onClick(event: MouseEvent) {
		if (!hasPopup.value) {
			onCycleValue();
			return;
		}
		// getBoundingClientRect() on this element is unreliable here: since its content can
		// overflow the nominal width/height viewport (e.g. a multi-frame icon sheet), some
		// browsers report a bounding box that includes the clipped-off parts. getScreenCTM()
		// maps this element's own (0,0) — its true top-left corner — to screen space directly,
		// sidestepping that bug entirely.
		const svg = event.currentTarget as SVGSVGElement;
		const ctm = svg.getScreenCTM();
		const topLeft = ctm ? new DOMPoint(0, 0).matrixTransform(ctm) : { x: 0, y: 0 };
		useModeDropdown().open(
			topLeft.x,
			topLeft.y,
			paramDef.value,
			props.value,
			(newValue) => emit('change', props.paramIndex, newValue),
			props.moduleId,
			props.lv,
		);
	}
</script>
