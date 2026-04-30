<template>
	<div class="relative" @mouseleave="closePicker()">
		<div :style="currentColorStyle" class="border border-neutral-600 rounded min-w-10 h-8 cursor-pointer" @dblclick.stop="togglePicker()"></div>
		<div v-if="pickerOpen" class="z-50 absolute bg-neutral-200 grid grid-cols-4 grid-rows-4 border border-neutral-600 rounded w-40">
			<template v-for="index in MODULE_COLORS_ORDER">
				<div v-if="index > 0" class="w-10 h-8 border border-neutral-600" :style="colorStyle(index)" @click.stop="setColor(index)"></div>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed } from 'vue';
	import { getModuleColor, MODULE_COLORS_ORDER } from '../../constants/moduleColors';
	import { useUiStore } from '@/store/ui';

	const uiStore = useUiStore();
	const pickerOpen = ref(false);

	function colorStyle(index: number): string {
		return 'background:' + getModuleColor(index) + ';';
	}

	function setColor(index: number) {
		uiStore.setModuleColor(index);
		pickerOpen.value = false;
	}

	const currentColorStyle = computed(() => {
		return colorStyle(uiStore.moduleColor);
	});

	function togglePicker() {
		pickerOpen.value = !pickerOpen.value;
	}

	function closePicker() {
		pickerOpen.value = false;
	}
</script>
