<template>
	<Teleport to="body">
		<div v-if="device.status === DeviceStatus.DriverError" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div class="bg-neutral-800 border border-neutral-600 rounded shadow-xl max-w-md w-full mx-4 p-5 flex flex-col gap-4">
				<div class="text-sm font-semibold text-red-400">USB Driver Problem</div>
				<p v-if="isWindows" class="text-sm text-neutral-300 leading-relaxed">
					The G2 was found on USB but its interface could not be claimed.<br /><br />
					Install <strong class="text-white">WinUSB</strong> using
					<a href="#" class="underline text-blue-400 hover:text-blue-300" @click.prevent="openZadig">Zadig</a>: select the Nord G2, choose
					<strong class="text-white">WinUSB</strong>, and click <strong class="text-white">Replace Driver</strong>. Then click Retry. NOTE: This will
					replace Clavia's USB Driver.
				</p>
				<p v-else class="text-sm text-neutral-300 leading-relaxed">
					The G2 was found on USB but its interface could not be claimed.<br /><br />
					Try unplugging the G2 and plugging it back in. If that doesn't help, restart your Mac to reset the USB subsystem.
				</p>
				<div class="flex justify-end">
					<button
						class="px-3 py-1 text-xs border border-neutral-500 rounded bg-gray-300 text-gray-800 hover:bg-gray-200 cursor-pointer"
						@click="emit('retry')"
					>
						Retry
					</button>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import { DeviceStatus, useDeviceStore } from '@/store/device';

	const device = useDeviceStore();
	const isWindows = navigator.platform.startsWith('Win');

	const emit = defineEmits<{ retry: [] }>();

	function openZadig() {
		window.electronAPI.openExternal('https://zadig.akeo.ie/');
	}
</script>
