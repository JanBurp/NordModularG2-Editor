<template>
	<div class="switch-control">
		<!-- No mode: single button that cycles through all values on click -->
		<div v-if="singleButtonMode" class="switch-btn" :class="{ active: activeIndex > 0 }" :style="buttonStyle" @click="onCycleValue">
			<svg v-if="bmpPath" width="11" height="11" overflow="visible"><path :d="bmpPath" stroke="#222" fill="none" /></svg>
			<template v-else>{{ activeOptionName }}</template>
		</div>
		<!-- VR (vertical) or HR (horizontal): one button per display name -->
		<div v-else class="switch-buttons" :class="resolvedMode === 'VR' ? 'switch-buttons--vertical' : 'switch-buttons--horizontal'">
			<div
				v-for="(name, i) in displayNames"
				:key="i"
				class="switch-btn"
				:class="{ active: i === activeIndex }"
				:style="buttonStyle"
				@click="onButtonClick(i)"
			>
				{{ name }}
			</div>
		</div>
	</div>
</template>
<script setup lang="ts">
	import { computed } from 'vue';
	import { getParam } from '../../renderer/parammap';
	import { bitmapPaths } from '../../renderer/bitmapPaths';

	const props = defineProps<{
		value: number;
		paramType?: string; // parammap key — derives names/mode/bmp/width/optionCount
		options?: string[]; // used when no paramType
		mode?: 'VR' | 'HR'; // overridden by paramType
		bmp?: string; // overridden by paramType
	}>();

	const emit = defineEmits<{
		change: [value: number];
	}>();

	const param = computed(() => (props.paramType ? getParam(props.paramType) : undefined));

	// Display labels shown on buttons
	const displayNames = computed(() => param.value?.names ?? props.options ?? []);

	// Total number of distinct values (may differ from displayNames.length for single-button params)
	const optionCount = computed(() => (param.value ? param.value.high - param.value.low + 1 : displayNames.value.length));

	const resolvedMode = computed(() => (param.value?.mode ?? props.mode) as 'VR' | 'HR' | undefined);
	const resolvedBmp = computed(() => param.value?.bmp ?? props.bmp);
	const bmpPath = computed(() => (resolvedBmp.value ? bitmapPaths[resolvedBmp.value] : undefined));
	const buttonStyle = computed(() => {
		const w = param.value?.width;
		return w ? { width: w + 'px', minWidth: w + 'px' } : undefined;
	});

	const singleButtonMode = computed(() => !resolvedMode.value);
	const activeIndex = computed(() => Math.max(0, Math.min(props.value, optionCount.value - 1)));
	const activeOptionName = computed(() => displayNames.value[activeIndex.value] ?? displayNames.value[0] ?? '');

	function onButtonClick(index: number) {
		if (index !== props.value) emit('change', index);
	}

	function onCycleValue() {
		if (optionCount.value === 0) return;
		emit('change', (props.value + 1) % optionCount.value);
	}
</script>
<style scoped>
	.switch-control {
		display: inline-block;
		user-select: none;
		font-size: 8px;
	}

	.switch-buttons {
		display: flex;
	}

	.switch-buttons--vertical {
		flex-direction: column;
	}

	.switch-buttons--horizontal {
		flex-direction: row;
		flex-wrap: wrap;
	}

	.switch-btn {
		min-width: 18px;
		height: 11px;
		padding: 0 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #ccc;
		border: 1px solid #333;
		cursor: pointer;
		white-space: nowrap;
	}

	.switch-btn:hover {
		border-color: #666;
	}

	.switch-btn.active {
		background: #6df2f2;
	}
</style>
