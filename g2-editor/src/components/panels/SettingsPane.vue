<template>
	<div class="flex flex-col gap-4">
		<div class="p-2 bg-neutral-900">
			<h3 class="mb-4">Synth Settings:</h3>

			<div class="flex gap-2 items-center">
				<span class="w-20">Name:</span>
				<input v-model="name" placeholder="Synth Name" />
			</div>

			<div v-if="deviceStore.device?.midi" class="mt-2">
				<h4>Midi:</h4>
				<div class="ml-2 flex gap-2 items-center"><span class="w-16 text-sm">Slot A</span><input class="w-10" v-model="midiA" /></div>
				<div class="ml-2 flex gap-2 items-center"><span class="w-16 text-sm">Slot B</span><input class="w-10" v-model="midiB" /></div>
				<div class="ml-2 flex gap-2 items-center"><span class="w-16 text-sm">Slot C</span><input class="w-10" v-model="midiC" /></div>
				<div class="ml-2 flex gap-2 items-center"><span class="w-16 text-sm">Slot D</span><input class="w-10" v-model="midiD" /></div>
				<div class="ml-2 flex gap-2 items-center"><span class="w-16 text-sm">Global</span><input class="w-10" v-model="midiGlobal" /></div>
			</div>
		</div>
		<div class="p-2 bg-neutral-900">
			<h3 class="mb-4">Performance settings</h3>
		</div>
		<div class="p-2 bg-neutral-900">
			<h3 class="mb-4">Patch settings</h3>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref } from 'vue';
	import { useDeviceStore } from '@/store/device';

	const deviceStore = useDeviceStore();
	const name = ref(deviceStore.device?.synthName);
	const midiA = ref(deviceStore.device?.midi.slots.A as string | undefined);
	const midiB = ref(deviceStore.device?.midi.slots.B as string | undefined);
	const midiC = ref(deviceStore.device?.midi.slots.C as string | undefined);
	const midiD = ref(deviceStore.device?.midi.slots.D as string | undefined);
	const midiGlobal = ref(deviceStore.device?.midi.slots.global as string | undefined);
</script>
