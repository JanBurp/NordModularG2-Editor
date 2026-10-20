<template>
	<template v-if="otherDevices.length > 0">
		<ToolBarDivider />
		<Button
			v-for="d in otherDevices"
			:key="d.id"
			variant="toggle"
			size="small"
			:title="`Switch to ${d.name ?? 'this device'}`"
			hint="deviceSwitch"
			class="flex items-center gap-1.5"
			@click="switchTo(d)"
		>
			<ConnectionDot :status="d.status" />
			{{ d.name ?? `bus ${d.bus} dev ${d.device}` }}
		</Button>
	</template>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import Button from './Button.vue';
	import ToolBarDivider from './ToolBarDivider.vue';
	import ConnectionDot from '@/components/common/ConnectionDot.vue';
	import { useConnectedDevicesStore, type ConnectedDeviceInfo } from '@/store/connectedDevices';

	const store = useConnectedDevicesStore();
	const otherDevices = computed(() => store.list.filter((d) => d.id !== store.thisId));

	function switchTo(d: ConnectedDeviceInfo): void {
		window.electronAPI.devices.switchTo(d.bus, d.device).catch((err: unknown) => console.error('switchTo failed:', err));
	}
</script>
