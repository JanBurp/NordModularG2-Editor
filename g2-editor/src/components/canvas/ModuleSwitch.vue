<template>
	<g
		:transform="`translate(${param.x}, ${param.y})`"
		class="switch-control"
		@contextmenu.stop.prevent="emit('paramContextMenu', props.paramIndex, $event)"
	>
		<!-- Bitmap-based switch -->
		<template v-if="hasBitmap">
			<!-- Single button mode: show active bitmap with highlight -->
			<svg v-if="singleButtonMode && displayNames.length <= 1" :x="0" :y="0" :width="width" height="11" class="switch-bitmap" @click="onCycleValue">
				<rect x="0" y="0" :width="width" height="11" :fill="activeIndex === 1 ? '#6df2f2' : '#CCC'" stroke="#333" />
				<use :href="`#Bitmap${bmp}`" :clip-path="`url(#clip-${param.n}-0)`" />
			</svg>

			<!-- Single button mode: show active bitmap without highlight -->
			<svg v-else-if="singleButtonMode && displayNames.length > 1" :x="0" :y="0" :width="width" height="11" class="switch-bitmap" @click="onCycleValue">
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
			>
				<rect x="0" y="0" :width="width" height="11" :fill="index === activeIndex ? '#6df2f2' : '#CCC'" stroke="#333" />
				<use :href="`#Bitmap${bmp}`" :transform="`translate(${-(index * width)}, 0)`" :clip-path="`url(#clip-${param.n}-${index})`" />
			</svg>
		</template>

		<!-- Text-based switch -->
		<template v-else>
			<!-- Single button mode, with one displayname: show with highlight -->
			<g v-if="singleButtonMode && displayNames.length <= 1" class="switch-button" @click="onCycleValue">
				<rect :x="0" :y="0" :width="width" height="11" stroke="#333" :fill="activeIndex === 1 ? '#6df2f2' : '#CCC'" />
				<text :x="width / 2" :y="9" fill="#000" font-size="8" text-anchor="middle" pointer-events="none">
					{{ activeOptionName }}
				</text>
			</g>

			<!-- Single button mode: show only active option without highlight -->
			<g v-else-if="singleButtonMode && displayNames.length > 1" class="switch-button" @click="onCycleValue">
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

		<!-- Selected param underline -->
		<rect v-if="highlight" x="0" y="12" :width="width" height="2" fill="white" pointer-events="none" />
	</g>
</template>
<script setup lang="ts">
	import { computed, toRef } from 'vue';
	import type { ModuleParam, ParamLabel } from '../../types';
	import { useSwitch } from '../../composables/useSwitch';

	const props = defineProps<{
		param: ModuleParam;
		value: number;
		paramIndex: number;
		label?: ParamLabel;
		highlight?: boolean;
	}>();

	const emit = defineEmits<{
		change: [index: number, value: number];
		paramLabelEdit: [info: { paramIndex: number; currentLabel: string }];
		paramContextMenu: [paramIndex: number, event: MouseEvent];
	}>();

	const {
		paramDef,
		names,
		displayNames,
		activeIndex,
		singleButtonMode,
		activeOptionName,
		mode,
		bmp,
		hasBitmap,
		maskh,
		width,
		itemsPerRow,
		getButtonX,
		getButtonY,
		onButtonClick,
		onCycleValue,
	} = useSwitch(
		toRef(props, 'param'),
		toRef(props, 'value'),
		computed(() => props.label),
		toRef(props, 'paramIndex'),
		(index, value) => emit('change', index, value),
		(info) => emit('paramLabelEdit', info),
	);
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
