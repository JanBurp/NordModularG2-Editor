<template>
	<template v-if="otherDevices.length > 0">
		<ToolBarDivider />
		<Button v-for="d in otherDevices" :key="d.id" variant="toggle" size="small" :title="`Switch to ${d.name ?? 'this device'}`" @click="focus(d.id)">
			{{ d.name ?? `bus ${d.bus} dev ${d.device}` }}
		</Button>
	</template>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import Button from './Button.vue';
	import ToolBarDivider from './ToolBarDivider.vue';
	import { useConnectedDevicesStore } from '@/store/connectedDevices';

	const store = useConnectedDevicesStore();
	const otherDevices = computed(() => store.list.filter((d) => d.id !== store.thisId));

	function focus(id: string): void {
		window.electronAPI.devices.focusWindow(id).catch((err: unknown) => console.error('focusWindow failed:', err));
	}
</script>
