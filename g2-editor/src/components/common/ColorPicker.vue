<template>
	<div class="relative" @mouseleave="closePicker()">
		<div :style="currentColorStyle" class="border border-neutral-600 rounded w-8 h-8 cursor-pointer" @click.stop="handleClick"></div>
		<div v-if="pickerOpen" class="z-50 absolute bg-neutral-200 grid grid-cols-4 border border-neutral-600 rounded w-40">
			<div class="col-span-4 h-8 border border-neutral-600" :style="colorStyle(0)" @click.stop="setColor(0)" />
			<template v-for="index in MODULE_COLORS_ORDER">
				<div v-if="index > 0" class="w-10 h-8 border border-neutral-600" :style="colorStyle(index)" @click.stop="setColor(index)" />
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed } from 'vue';
	import { getModuleColor, MODULE_COLORS_ORDER } from '../../constants/moduleColors';
	import { useUiStore } from '@/store/ui';
	import { useSlotsStore } from '@/store/slots';
	import { useDoubleClick } from '@/composables/useDoubleClick';

	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	const pickerOpen = ref(false);

	const { handleClick } = useDoubleClick(
		() => setColor(uiStore.moduleColor),
		() => togglePicker(),
	);

	function colorStyle(index: number): string {
		return 'background:' + getModuleColor(index) + ';';
	}

	function setColor(index: number) {
		uiStore.setModuleColor(index);
		if (uiStore.selectedModules.length > 0) {
			const area = uiStore.area === 1 ? 'voice' : 'fx';
			slotsStore.setModuleColors(uiStore.selectedModules, index, area as 'voice' | 'fx');
		}
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
