<template>
	<div class="flex items-center gap-2">
		<div class="flex gap-1">
			<button
				v-for="color in cableColors"
				:key="color.name"
				class="w-5 h-5 border-2 border-solid rounded cursor-pointer p-0 flex items-center justify-center transition-all duration-200 opacity-40 hover:opacity-70 hover:scale-110"
				:class="{
					'opacity-100 shadow-sm': cableVisibility[color.name],
				}"
				:style="{
					backgroundColor: color.hex,
					borderColor: color.hex,
				}"
				:title="color.label + (cableVisibility[color.name] ? ' (visible)' : ' (hidden)')"
				@click="toggleCableVisibility(color.name)"
			>
				<span
					class="w-2 h-2 rounded-full opacity-0 transition-opacity duration-200"
					:class="{
						'opacity-100': cableVisibility[color.name],
					}"
					:style="{ backgroundColor: 'rgba(0,0,0,0.5)' }"
				></span>
			</button>
			<button
				class="w-6 h-5 border-2 border-neutral-600 rounded bg-gray-300 text-gray-800 text-xs font-bold hover:bg-gray-200"
				:class="{
					'bg-gray-500 border-neutral-500 text-white shadow': allCablesVisible,
				}"
				:title="allCablesVisible ? 'Hide all cables' : 'Show all cables'"
				@click="toggleShowHideAll"
			>
				H
			</button>
			<button
				class="w-6 h-5 border-2 border-neutral-500 rounded bg-gray-200 text-gray-800 text-xs font-bold ml-1 hover:bg-gray-300 active:bg-gray-400"
				title="Re-render cables"
				@click="shakeCables"
			>
				S
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { useCableVisibility } from '../../composables/useCableVisibility';

	const { cableColors, cableVisibility, allCablesVisible, toggleCableVisibility, toggleShowHideAll, shakeCables } = useCableVisibility();
</script>
