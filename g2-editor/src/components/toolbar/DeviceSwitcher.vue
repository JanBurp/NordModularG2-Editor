<template>
	<template v-if="store.list.length > 1">
		<ToolBarDivider />
		<Button
			v-for="d in store.list"
			:key="d.id"
			variant="toggle"
			size="small"
			:active="d.id === store.thisId"
			:title="d.id === store.thisId ? 'This window' : `Switch to ${d.name ?? 'this device'}`"
			@click="d.id === store.thisId ? undefined : focus(d.id)"
		>
			{{ d.name ?? `bus ${d.bus} dev ${d.device}` }}
		</Button>
	</template>
	<Button variant="default" size="small" title="Connect another G2" @click="connectAnother">+</Button>
</template>

<script setup lang="ts">
	import Button from './Button.vue';
	import ToolBarDivider from './ToolBarDivider.vue';
	import { useConnectedDevicesStore } from '@/store/connectedDevices';

	const store = useConnectedDevicesStore();

	function focus(id: string): void {
		window.electronAPI.devices.focusWindow(id).catch((err: unknown) => console.error('focusWindow failed:', err));
	}

	function connectAnother(): void {
		window.electronAPI.devices.openWindow().catch((err: unknown) => console.error('openWindow failed:', err));
	}
</script>
