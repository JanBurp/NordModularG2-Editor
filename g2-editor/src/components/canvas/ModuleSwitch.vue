<template>
	<g
		:transform="`translate(${param.x}, ${param.y})`"
		class="switch-control"
		@contextmenu.stop.prevent="emit('paramContextMenu', props.paramIndex, $event, contextMenuLabelIndex)"
	>
		<!-- Output type (Pos/Neg/Bip, LFOs & Envs): green behind the active half (or whole), light strips on both sides -->
		<svg v-if="param.n === 'levelshift' && hasBitmap" :width="width" height="11" class="switch-bitmap" @click="onCycleValue">
			<rect x="0" y="0" :width="width" height="11" :fill="CONTROL.single" :stroke="PANEL.line" />
			<rect x="2.5" y="0.5" :width="width - 5" height="10" :fill="CONTROL.levelShiftBg" />
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
				<rect x="0" y="0" :width="width" :height="height" :fill="btnFill(activeIndex === 1)" :stroke="PANEL.line" />
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
				<rect x="0" y="0" :width="width" height="11" :fill="btnFill(true, CONTROL.single)" :stroke="PANEL.line" />
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
				<rect x="0" y="0" :width="width" height="11" :fill="btnFill(index === activeIndex)" :stroke="PANEL.line" />
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
				<rect :x="0" :y="0" :width="width" height="11" :stroke="PANEL.line" :fill="btnFill(activeIndex === 1)" />
				<text :x="width / 2" :y="9" :fill="textFill(activeIndex === 1)" font-size="8" text-anchor="middle" pointer-events="none">
					{{ activeOptionName }}
				</text>
			</g>

			<!-- Single button mode: show only active option without highlight -->
			<g
				v-else-if="singleButtonMode && displayNames.length > 1"
				class="switch-button"
				v-bind="isTrigger ? { onMousedown: onTriggerDown, onMouseup: onTriggerUp, onMouseleave: onTriggerUp } : { onClick: onCycleValue }"
			>
				<rect :x="0" :y="0" :width="width" height="11" :stroke="PANEL.line" :fill="btnFill(true, CONTROL.single)" />
				<text :x="width / 2" :y="9" :fill="textFill(true)" font-size="8" text-anchor="middle" pointer-events="none">
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
				<rect :x="getButtonX(index)" :y="getButtonY(index)" :width="width" height="11" :fill="btnFill(index === activeIndex)" :stroke="PANEL.line" />
				<text
					:x="getButtonX(index) + width / 2"
					:y="getButtonY(index) + 9"
					:fill="textFill(index === activeIndex)"
					font-size="8"
					text-anchor="middle"
					pointer-events="none"
				>
					<SearchHit :text="name" :hit="searchHitOf(index)" />
				</text>
			</g>
		</template>

		<!-- Find & Replace: frame matching labels where their text isn't drawn (one button at a time, or bitmaps) -->
		<rect
			v-for="m in singleButtonMode || hasBitmap ? (searchMatches ?? []) : []"
			:key="`search-${m.labelIndex}`"
			:x="singleButtonMode ? 0 : getButtonX(m.labelIndex)"
			:y="singleButtonMode ? 0 : getButtonY(m.labelIndex)"
			:width="width"
			height="11"
			class="search-frame"
			:class="{ current: m.current }"
			pointer-events="none"
		/>

		<!-- Selected param underline -->
		<rect v-if="highlight" x="0" :y="underline.y" :width="underline.width" height="1.5" :fill="PANEL.highlight" pointer-events="none" />
	</g>
</template>
<script setup lang="ts">
	import { CONTROL, PANEL } from '@/constants/colors';
	import { computed, toRef } from 'vue';
	import type { ModuleParam, ParamLabel } from '../../types';
	import { useSwitch } from '../../composables/useSwitch';
	import SearchHit from '../common/SearchHit.vue';
	import { morphColorHex } from '../../utils/morphColors';
	import { GRAPH_COLORS } from '../../constants/colors';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
		label?: ParamLabel;
		highlight?: boolean;
		searchMatches?: { labelIndex: number; current: boolean }[] | null;
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

	// Morph Group assignment: the whole button takes the group's color (red = selected group, blue = another).
	// The on state is the full color, off a pale tint of it, so the state stays readable. Without a morph
	// assignment: `base` (default on CONTROL.on / off CONTROL.off).
	function btnFill(active: boolean, base?: string): string {
		if (!props.morphColor) return base ?? (active ? CONTROL.on : CONTROL.off);
		const color = morphColorHex(props.morphColor);
		return active ? color : `color-mix(in srgb, ${color} 35%, ${CONTROL.off})`;
	}
	const textFill = (active: boolean) => (props.morphColor && active ? PANEL.white : PANEL.ink);

	function searchHitOf(labelIndex: number): 'match' | 'current' | null {
		const m = props.searchMatches?.find((x) => x.labelIndex === labelIndex);
		return m ? (m.current ? 'current' : 'match') : null;
	}

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

	// Selected param underline: below the whole control, so under all buttons in VR/HR mode (a column or rows of buttons).
	const underline = computed(() => {
		const n = singleButtonMode.value ? 1 : Math.max(1, displayNames.value.length);
		const xs = Array.from({ length: n }, (_, i) => getButtonX(i));
		return { width: Math.max(...xs) + width.value, y: getButtonY(n - 1) + (singleButtonMode.value ? height.value : 11) + 1 };
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
		stroke: v-bind('PANEL.hover');
		stroke-width: 1;
	}

	.switch-button.active rect {
		stroke: v-bind('PANEL.line');
		stroke-width: 1;
	}
</style>
