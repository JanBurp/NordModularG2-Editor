<template>
	<div class="flex items-center h-6 gap-2 bg-neutral-500 border-b border-neutral-700 text-xs text-neutral-900">
		<BtnGroup v-model="uiStore.area" size="small" :options="AREA_OPTIONS" variant="toggle" />
		<span>Voice: {{ areaCount('voice', 'modules') }} modules / {{ areaCount('voice', 'cables') }} cables</span>
		<StatusBarDivider />
		<span>FX: {{ areaCount('fx', 'modules') }} modules / {{ areaCount('fx', 'cables') }} cables</span>
		<div class="ml-auto h-full flex items-center justify-center gap-2 px-2 border-l-4 border-r-4 cursor-pointer w-30" :class="device.statusClass" @click="emit('toggle-connection')">
			<span class="text-sm">{{ device.statusLabel }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import { useUiStore } from '../../store/ui';
	import { useSlotsStore } from '../../store/slots';
	import { useDeviceStore } from '../../store/device';
	import BtnGroup from './BtnGroup.vue';
	import StatusBarDivider from './StatusBarDivider.vue';
	import { AREA_OPTIONS } from '../../constants';

	const emit = defineEmits<{ 'toggle-connection': [] }>();

	const uiStore = useUiStore();
	const slotsStore = useSlotsStore();
	const device = useDeviceStore();

	const currentPatch = computed(() => slotsStore.getPatchForSlot(uiStore.activeSlot));

	function areaCount(area: 'voice' | 'fx', type: 'modules' | 'cables'): number {
		const i = area === 'voice' ? 1 : 0;
		return type === 'modules' ? (currentPatch.value?.areas?.[i]?.modules?.length ?? 0) : (currentPatch.value?.areas?.[i]?.cableList?.length ?? 0);
	}
</script>
