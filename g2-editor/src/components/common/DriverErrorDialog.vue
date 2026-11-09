<template>
	<Teleport to="body">
		<div v-if="device.status === DeviceStatus.DriverError && !dismissed" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div class="bg-surface-1 border border-line-default rounded shadow-xl max-w-md w-full mx-4 p-5 flex flex-col gap-4">
				<div class="text-sm font-semibold text-red-400">USB Driver Problem</div>
				<p v-if="isWindows" class="text-sm text-content-secondary leading-relaxed">
					The G2 was found on USB but its interface could not be claimed.<br /><br />
					Install <strong class="text-content-primary">WinUSB</strong> using
					<a href="#" class="underline text-blue-400 hover:text-blue-300" @click.prevent="openZadig">Zadig</a>: select the Nord G2, choose
					<strong class="text-content-primary">WinUSB</strong>, and click <strong class="text-content-primary">Replace Driver</strong>. Then click
					Retry. NOTE: This will replace Clavia's USB Driver. See also
					<a href="#" class="underline text-blue-400 hover:text-blue-300" @click.prevent="openDriverDocs">Windows USB driver</a>.
				</p>
				<p v-else-if="needsUsbHelper" class="text-sm text-content-secondary leading-relaxed">
					The G2 was found on USB but this user has no permission to open it.<br /><br />
					Click <strong class="text-content-primary">Install USB helper</strong> to install a udev rule that gives you access (asks for your password
					once). Then the editor retries automatically.
					<span v-if="helperError" class="block mt-2 text-red-400">Install failed: {{ helperError }}</span>
				</p>
				<div v-else class="text-sm text-content-secondary leading-relaxed">
					The G2 was found on USB but its interface could not be claimed. Possible solutions:
					<ul class="list-disc pl-4">
						<li>G2 is claimed by another application. Quit other app and retry.</li>
						<li>Try unplugging the G2 and plugging it back in.</li>
						<li v-if="isMac">Restart your Mac to reset the USB subsystem.</li>
					</ul>
				</div>
				<div class="flex justify-end gap-2">
					<button
						v-if="needsUsbHelper"
						class="px-3 py-1 text-xs border border-line-default rounded bg-surface-2 text-content-primary hover:bg-surface-3 cursor-pointer disabled:opacity-50 disabled:cursor-default"
						:disabled="installing"
						@click="installUsbHelper"
					>
						{{ installing ? 'Installing…' : 'Install USB helper' }}
					</button>
					<button
						class="px-3 py-1 text-xs border border-line-default rounded bg-surface-2 text-content-primary hover:bg-surface-3 cursor-pointer"
						@click="emit('retry')"
					>
						Retry
					</button>
					<button
						class="px-3 py-1 text-xs border border-line-default rounded bg-surface-2 text-content-primary hover:bg-surface-3 cursor-pointer"
						@click="dismissed = true"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import { computed, ref, watch } from 'vue';
	import { DeviceStatus, useDeviceStore } from '@/store/device';
	import { isLinux, isMac, isWindows } from '@/utils/platform';

	const device = useDeviceStore();
	// Linux needs no driver, only permission: libusb_open fails with ACCESS until the udev rule is in place.
	const needsUsbHelper = computed(() => isLinux && device.driverErrorCode === 'LIBUSB_ERROR_ACCESS');
	const installing = ref(false);
	const helperError = ref('');
	// Closed by the user: stays closed until the next driver error.
	const dismissed = ref(false);

	watch(
		() => device.status,
		(status) => {
			if (status === DeviceStatus.DriverError) dismissed.value = false;
		},
		{ immediate: true },
	);

	const emit = defineEmits<{ retry: [] }>();

	function openZadig() {
		window.electronAPI.openExternal('https://zadig.akeo.ie/');
	}

	function openDriverDocs() {
		window.electronAPI.openExternal('https://janburp.github.io/NordModularG2-Editor/getting-started/windows-driver');
	}

	async function installUsbHelper() {
		installing.value = true;
		helperError.value = '';
		const res = await window.electronAPI.installUsbHelper();
		installing.value = false;
		if (res.ok) emit('retry');
		else helperError.value = res.error ?? 'unknown error';
	}
</script>
