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
				<div class="ml-2 flex gap-2 items-center"><span class="w-16 label">Slot A</span><input class="w-10 text" v-model="midiA" /></div>
				<div class="ml-2 flex gap-2 items-center"><span class="w-16 label">Slot B</span><input class="w-10 text" v-model="midiB" /></div>
				<div class="ml-2 flex gap-2 items-center"><span class="w-16 label">Slot C</span><input class="w-10 text" v-model="midiC" /></div>
				<div class="ml-2 flex gap-2 items-center"><span class="w-16 label">Slot D</span><input class="w-10 text" v-model="midiD" /></div>
				<div class="ml-2 flex gap-2 items-center"><span class="w-16 label">Global</span><input class="w-10 text" v-model="midiGlobal" /></div>
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
	import { OptionsType } from 'flowbite-vue/components/FwbSelect/types';

	const midiOptions = [
		{ value: '0', name: '1' },
		{ value: '1', name: '2' },
		{ value: '2', name: '3' },
		{ value: '3', name: '4' },
		{ value: '4', name: '5' },
		{ value: '5', name: '6' },
		{ value: '6', name: '7' },
		{ value: '7', name: '8' },
		{ value: '8', name: '9' },
		{ value: '9', name: '10' },
		{ value: '10', name: '11' },
		{ value: '11', name: '12' },
		{ value: '12', name: '13' },
		{ value: '13', name: '14' },
		{ value: '14', name: '15' },
		{ value: '15', name: '16' },
	] as OptionsType[];

	const deviceStore = useDeviceStore();
	const name = ref(deviceStore.device?.synthName);
	const midiA = ref(deviceStore.device?.midi.slots.a as string | undefined);
	const midiB = ref(deviceStore.device?.midi.slots.b as string | undefined);
	const midiC = ref(deviceStore.device?.midi.slots.c as string | undefined);
	const midiD = ref(deviceStore.device?.midi.slots.d as string | undefined);
	const midiGlobal = ref(deviceStore.device?.midi.slots.global as string | undefined);
</script>
