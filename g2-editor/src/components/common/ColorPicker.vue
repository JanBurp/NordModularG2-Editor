<template>
	<div class="relative flex items-center" @mouseleave="closePicker()">
		<div :style="currentColorStyle" class="border border-neutral-600 rounded w-6 h-6 cursor-pointer" title="Apply color" @click.stop="setColor(uiStore.moduleColor)"></div>
		<div class="cursor-pointer px-0.5 text-neutral-400 hover:text-neutral-200" title="Choose color" @click.stop="togglePicker()">
			<svg viewBox="0 0 10 10" class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="2,3 5,7 8,3"/>
			</svg>
		</div>
		<div v-if="pickerOpen" class="z-50 absolute top-full left-0 bg-neutral-200 grid grid-cols-4 border border-neutral-600 rounded w-40">
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

	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	const pickerOpen = ref(false);

	function colorStyle(index: number): string {
		return 'background:' + getModuleColor(index) + ';';
	}

	function setColor(index: number) {
		uiStore.setModuleColor(index);
		if (uiStore.selectedModules.length > 0) {
			const area: 'voice' | 'fx' = uiStore.selectedModulesArea === 'va' ? 'voice' : 'fx';
			slotsStore.setModuleColors(uiStore.selectedModules, index, area);
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
