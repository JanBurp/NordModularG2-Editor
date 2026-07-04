<template>
	<div class="absolute inset-0 bg-surface-0 z-50 overflow-auto p-8">
		<div class="max-w-7xl mx-auto">
			<div class="flex items-center justify-between mb-6">
				<h1 class="text-2xl font-bold text-content-primary">SVG Element Viewer</h1>
				<button @click="uiStore.toggleSvgViewer()" class="px-4 py-2 bg-surface-2 hover:bg-surface-3 text-content-primary rounded">Close</button>
			</div>

			<SearchInput v-model="searchQuery" :is-active="true"></SearchInput>

			<h2 class="text-xl font-semibold text-content-secondary mb-4">Paths & Icons</h2>
			<div class="grid grid-cols-4 gap-6">
				<div v-for="path in filteredPaths" :key="path.id" class="bg-surface-1 p-4 rounded">
					<p class="text-content-secondary text-sm mb-2">{{ path.id }}</p>
					<svg width="128" height="160" class="border border-line-default bg-neutral-200">
						<use :href="'#' + path.id" />
					</svg>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed } from 'vue';
	import { useUiStore } from '@/store/ui';
	import SearchInput from '../common/SearchInput.vue';

	const uiStore = useUiStore();
	const searchQuery = ref('');

	const paths = [
		{ id: 'BitmapHVCA' },
		{ id: 'BitmapVVCA' },
		{ id: 'BitmapADD' },
		{ id: 'BitmapWSAW' },
		{ id: 'BitmapWSQR1' },
		{ id: 'BitmapWSQR2' },
		{ id: 'BitmapINV' },
		{ id: 'BitmapSW12' },
		{ id: 'BitmapSH' },
		{ id: 'BitmapSWcon' },
		{ id: 'BitmapSWMcon' },
		{ id: 'BitmapLMOD' },
		{ id: 'BitmapRect' },
		{ id: 'BitmapShpStatic' },
		{ id: 'BitmapLfoAWave' },
		{ id: 'BitmapLfoBWave' },
		{ id: 'BitmapLfoShpAWave' },
		{ id: 'BitmapOscAWave' },
		{ id: 'BitmapOscShpAWave' },
		{ id: 'BitmapOscBWave' },
		{ id: 'Bitmapff1' },
		{ id: 'Bitmapff2' },
		{ id: 'Bitmappwr' },
		{ id: 'Bitmapsharp' },
		{ id: 'Bitmapbox' },
		{ id: 'BitmapCurve' },
		{ id: 'BitmapSeqLp' },
		{ id: 'BitmapOutputMode' },
		{ id: 'ModeLfoC' },
		{ id: 'ModeWave2' },
		{ id: 'ModeShpB' },
		{ id: 'ModeFF' },
		{ id: 'ModeDelay' },
		{ id: 'ModePulse' },
		{ id: 'ModeGate' },
		{ id: 'check' },
		{ id: 'onoff' },
		{ id: 'input' },
		{ id: 'output' },
		{ id: 'levelshift' },
		{ id: 'KnobSlider' },
		{ id: 'KnobSpin' },
		{ id: 'KnobSpinH' },
		{ id: 'KnobSmall' },
		{ id: 'KnobMedium' },
		{ id: 'KnobReset' },
		{ id: 'KnobBig' },
	];

	const filteredPaths = computed(() => {
		let filtered = paths;
		const query = searchQuery.value.toLowerCase();
		if (query !== '') {
			filtered = filtered.filter((g) => {
				return g.id.toLowerCase().includes(query);
			});
		}
		return filtered;
	});
</script>
