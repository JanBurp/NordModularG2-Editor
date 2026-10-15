<template>
	<g
		:transform="`translate(${param.x}, ${param.y})`"
		class="switch-control"
		@contextmenu.stop.prevent="emit('paramContextMenu', props.paramIndex, $event, contextMenuLabelIndex)"
	>
		<!-- Output type (Pos/Neg/Bip, LFOs & Envs): green behind the active half (or whole), light strips on both sides -->
		<svg v-if="param.n === 'levelshift' && hasBitmap" :width="width" height="11" class="switch-bitmap" @click="onCycleValue">
			<rect x="0" y="0" :width="width" height="11" fill="#EEE" stroke="#333" />
			<rect x="2.5" y="0.5" :width="width - 5" height="10" fill="#A0A0A0" />
			<rect v-if="levelShiftHalf !== 'bottom'" x="2.5" y="0.5" :width="width - 5" height="4.5" :fill="GRAPH_COLORS.dxLine" />
			<rect v-if="levelShiftHalf !== 'top'" x="2.5" y="6" :width="width - 5" height="4.5" :fill="GRAPH_COLORS.dxLine" />
			<use :href="`#Bitmap${bmp}`" :transform="`translate(0,${-(LEVEL_SHIFT_FRAME[activeIndex] * maskh)})`" />
		</svg>

		<!-- Bitmap-based switch -->
		<template v-else-if="hasBitmap">
			<!-- Single button mode: show active bitmap with highlight -->
			<svg
				v-if="singleButtonMode && displayNames.length <= 1"
				:x="0"
				:y="0"
				:width="width"
				:height="height"
				class="switch-bitmap"
				v-bind="isTrigger ? { onMousedown: onTriggerDown, onMouseup: onTriggerUp, onMouseleave: onTriggerUp } : { onClick: onCycleValue }"
			>
				<rect x="0" y="0" :width="width" :height="height" :fill="activeIndex === 1 ? '#6df2f2' : '#CCC'" stroke="#333" />
				<use :href="`#Bitmap${bmp}`" :clip-path="`url(#clip-${param.n}-0)`" />
			</svg>

			<!-- Single button mode: show active bitmap without highlight -->
			<svg
				v-else-if="singleButtonMode && displayNames.length > 1"
				:x="0"
				:y="0"
				:width="width"
				height="11"
				class="switch-bitmap"
				v-bind="isTrigger ? { onMousedown: onTriggerDown, onMouseup: onTriggerUp, onMouseleave: onTriggerUp } : { onClick: onCycleValue }"
			>
				<rect x="0" y="0" :width="width" height="11" fill="#EEE" stroke="#333" />
				<use :href="`#Bitmap${bmp}`" :transform="`translate(0,${-(activeIndex * maskh)})`" :clip-path="`url(#clip-${param.n}-0)`" />
			</svg>

			<!-- VR/HR mode: show all bitmaps with active highlighted -->
			<svg
				v-else
				v-for="(name, index) in displayNames"
				:key="index"
				:x="getButtonX(index)"
				:y="getButtonY(index)"
				:width="width"
				height="11"
				class="switch-bitmap"
				:class="{ active: index === activeIndex }"
				@click="onButtonClick(index)"
				@mouseleave="onButtonLeave"
				@contextmenu.stop.prevent="emit('paramContextMenu', props.paramIndex, $event, index)"
			>
				<rect x="0" y="0" :width="width" height="11" :fill="index === activeIndex ? '#6df2f2' : '#CCC'" stroke="#333" />
				<use :href="`#Bitmap${bmp}`" :transform="`translate(${-(index * width)}, 0)`" :clip-path="`url(#clip-${param.n}-${index})`" />
			</svg>
		</template>

		<!-- Text-based switch -->
		<template v-else>
			<!-- Single button mode, with one displayname: show with highlight -->
			<g
				v-if="singleButtonMode && displayNames.length <= 1"
				class="switch-button"
				v-bind="isTrigger ? { onMousedown: onTriggerDown, onMouseup: onTriggerUp, onMouseleave: onTriggerUp } : { onClick: onCycleValue }"
			>
				<rect :x="0" :y="0" :width="width" height="11" stroke="#333" :fill="activeIndex === 1 ? '#6df2f2' : '#CCC'" />
				<text :x="width / 2" :y="9" fill="#000" font-size="8" text-anchor="middle" pointer-events="none">
					{{ activeOptionName }}
				</text>
			</g>

			<!-- Single button mode: show only active option without highlight -->
			<g
				v-else-if="singleButtonMode && displayNames.length > 1"
				class="switch-button"
				v-bind="isTrigger ? { onMousedown: onTriggerDown, onMouseup: onTriggerUp, onMouseleave: onTriggerUp } : { onClick: onCycleValue }"
			>
				<rect :x="0" :y="0" :width="width" height="11" stroke="#333" fill="#EEE" />
				<text :x="width / 2" :y="9" fill="#000" font-size="8" text-anchor="middle" pointer-events="none">
					{{ activeOptionName }}
				</text>
			</g>

			<!-- VR/HR mode: show all options with active highlighted -->
			<g
				v-else
				v-for="(name, index) in displayNames"
				:key="index"
				class="switch-button"
				:class="{ active: index === activeIndex }"
				@click="onButtonClick(index)"
				@mouseleave="onButtonLeave"
				@contextmenu.stop.prevent="emit('paramContextMenu', props.paramIndex, $event, index)"
			>
				<rect
					:x="getButtonX(index)"
					:y="getButtonY(index)"
					:width="width"
					height="11"
					:fill="index === activeIndex ? '#6df2f2' : '#CCC'"
					stroke="#333"
				/>
				<text :x="getButtonX(index) + width / 2" :y="getButtonY(index) + 9" fill="#000" font-size="8" text-anchor="middle" pointer-events="none">
					{{ name }}
				</text>
			</g>
		</template>

		<!-- Morph Group assignment indicator: red = assigned to the selected group, blue = another group -->
		<rect v-if="morphColor" x="0" y="-2" :width="width" height="2" :fill="morphColorHex(morphColor)" pointer-events="none" />

		<!-- Selected param underline -->
		<rect v-if="highlight" x="0" :y="height + 1" :width="width" height="2" fill="white" pointer-events="none" />
	</g>
</template>
<script setup lang="ts">
	import { computed, toRef } from 'vue';
	import type { ModuleParam, ParamLabel } from '../../types';
	import { useSwitch } from '../../composables/useSwitch';
	import { morphColorHex } from '../../utils/morphColors';
	import { GRAPH_COLORS } from './graphFunctions';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
		label?: ParamLabel;
		highlight?: boolean;
		morphColor?: 'red' | 'blue' | null;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number, immediate?: boolean];
		paramLabelEdit: [info: { paramIndex: number; currentLabel: string }];
		paramContextMenu: [paramIndex: number, event: MouseEvent, labelIndex: number];
	}>();

	const {
		displayNames,
		activeIndex,
		singleButtonMode,
		activeOptionName,
		bmp,
		hasBitmap,
		maskh,
		width,
		height,
		getButtonX,
		getButtonY,
		onButtonClick,
		onButtonLeave,
		onCycleValue,
		isTrigger,
		onTriggerDown,
		onTriggerUp,
	} = useSwitch(
		toRef(props, 'param'),
		toRef(props, 'value'),
		computed(() => props.label),
		toRef(props, 'paramIndex'),
		(index, value) => emit('change', index, value, true),
		(info) => emit('paramLabelEdit', info),
	);

	// OutputMode bitmap frames are Bip, BipInv, Pos, PosInv, Neg, NegInv; values are Pos, PosInv, Neg, NegInv, Bip, BipInv
	const LEVEL_SHIFT_FRAME = [2, 3, 4, 5, 0, 1];
	const levelShiftHalf = computed(() => (activeIndex.value < 2 ? 'top' : activeIndex.value < 4 ? 'bottom' : 'whole'));

	const contextMenuLabelIndex = computed(() => {
		if (singleButtonMode.value) {
			const dn = displayNames.value;
			const len = Array.isArray(dn) ? dn.length : (dn as string).length;
			if (len <= 1) return 0;
		}
		return activeIndex.value;
	});
</script>
<style scoped>
	.switch-control {
		user-select: none;
	}

	.switch-bitmap {
		cursor: pointer;
		overflow: hidden;
	}

	.switch-bitmap.active {
		filter: brightness(1.2);
	}

	.switch-button {
		cursor: pointer;
	}

	.switch-button:hover rect {
		stroke: #666;
		stroke-width: 1;
	}

	.switch-button.active rect {
		stroke: #333;
		stroke-width: 1;
	}
</style>
