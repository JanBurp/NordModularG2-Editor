<template>
	<Teleport to="body">
		<div v-if="device.status === DeviceStatus.DriverError && !dismissed" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div class="bg-surface-1 border border-line-default rounded shadow-xl max-w-md w-full mx-4 p-5 flex flex-col gap-4">
				<div class="text-sm font-semibold text-red-400">USB Driver Problem</div>
				<p v-if="isWindows && needsRestart" class="text-sm text-content-secondary leading-relaxed">
					The USB helper (UsbDk) is installed but not active yet. <strong class="text-content-primary">Restart Windows</strong>, then start the editor
					again.
				</p>
				<p v-else-if="isWindows && helperState === 'running' && needsUsbHelper" class="text-sm text-content-secondary leading-relaxed">
					The USB helper (UsbDk) is installed and running, but the editor could not use it. Please send us the log files (Help → Open Log Folder), see
					also
					<a href="#" class="underline text-blue-400 hover:text-blue-300" @click.prevent="openDriverDocs">Windows USB driver</a>.
				</p>
				<p v-else-if="needsUsbHelper" class="text-sm text-content-secondary leading-relaxed">
					<template v-if="isWindows">
						The G2 was found on USB but the USB helper (UsbDk) the editor needs is not installed.<br /><br />
						Click <strong class="text-content-primary">Install USB helper</strong> to install it (asks for administrator permission once). Clavia's
						driver stays installed, so the original editor keeps working. On Windows on ARM UsbDk doesn't work: see
						<a href="#" class="underline text-blue-400 hover:text-blue-300" @click.prevent="openDriverDocs">Windows USB driver</a>.
					</template>
					<template v-else>
						The G2 was found on USB but this user has no permission to open it.<br /><br />
						Click <strong class="text-content-primary">Install USB helper</strong> to install a udev rule that gives you access (asks for your
						password once).
					</template>
					Then the editor retries automatically.
					<span v-if="helperError" class="block mt-2 text-red-400">Install failed: {{ helperError }}</span>
				</p>
				<div v-else class="text-sm text-content-secondary leading-relaxed">
					The G2 was found on USB but its interface could not be claimed. Possible solutions:
					<ul class="list-disc pl-4">
						<li>G2 is claimed by another application. Quit other app and retry.</li>
						<li>Try unplugging the G2 and plugging it back in.</li>
						<li v-if="isMac">Restart your Mac to reset the USB subsystem.</li>
						<li v-if="isWindows">
							See
							<a href="#" class="underline text-blue-400 hover:text-blue-300" @click.prevent="openDriverDocs">Windows USB driver</a>
							troubleshooting.
						</li>
					</ul>
				</div>
				<div class="flex justify-end gap-2">
					<button
						v-if="canInstall"
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
	// Windows: the CLI falls back to WinUSB when UsbDk isn't installed, which can't open a G2 bound to Clavia's driver.
	// Linux needs no driver, only permission: libusb_open fails with ACCESS until the udev rule is in place.
	const needsUsbHelper = computed(
		() => (isWindows && device.driverErrorBackend !== 'usbdk') || (isLinux && device.driverErrorCode === 'LIBUSB_ERROR_ACCESS'),
	);
	const installing = ref(false);
	const helperError = ref('');
	// Closed by the user: stays closed until the next driver error.
	const dismissed = ref(false);
	// Windows: UsbDk service state, so an installed-but-inactive UsbDk isn't offered for install again.
	const helperState = ref<'missing' | 'running' | 'stopped' | null>(null);
	const restartNeeded = ref(false);
	const needsRestart = computed(() => restartNeeded.value || helperState.value === 'stopped');
	// Windows: after a failed install the error (with the msiexec log path) is shown instead of the same button again.
	// Linux keeps the button: a failure there is usually the dismissed password prompt.
	const canInstall = computed(() => needsUsbHelper.value && !needsRestart.value && helperState.value !== 'running' && !(isWindows && helperError.value));

	watch(
		() => device.status,
		async (status) => {
			if (status !== DeviceStatus.DriverError) return;
			dismissed.value = false;
			if (isWindows) helperState.value = await window.electronAPI.usbHelperState();
		},
		{ immediate: true },
	);

	const emit = defineEmits<{ retry: [] }>();

	function openDriverDocs() {
		window.electronAPI.openExternal('https://janburp.github.io/NordModularG2-Editor/getting-started/windows-driver');
	}

	async function installUsbHelper() {
		installing.value = true;
		helperError.value = '';
		const res = await window.electronAPI.installUsbHelper();
		installing.value = false;
		if (res.ok) emit('retry');
		else if (res.restart) restartNeeded.value = true;
		else helperError.value = res.error ?? 'unknown error';
	}
</script>
