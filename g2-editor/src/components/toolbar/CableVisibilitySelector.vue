<template>
	<div class="flex items-center gap-2">
		<div class="flex gap-1">
			<button
				v-for="color in cableColors"
				:key="color.name"
				class="w-6 h-6 border-2 border-solid rounded cursor-pointer flex items-center justify-center transition-all duration-200 opacity-40 hover:opacity-70 hover:scale-110"
				:class="{
					'opacity-100 shadow-sm': getVisibility(color.name),
				}"
				:style="{
					backgroundColor: color.hex,
					borderColor: color.hex,
				}"
				:data-testid="`cable-toggle-${color.name}`"
				:title="color.label + (getVisibility(color.name) ? ' (visible)' : ' (hidden)')"
				@click="toggle(color.name)"
			>
				<span
					class="w-2 h-2 rounded-full opacity-0 transition-opacity duration-200"
					:class="{
						'opacity-100': getVisibility(color.name),
					}"
					:style="{ backgroundColor: 'rgba(0,0,0,0.5)' }"
				></span>
			</button>
			<button
				class="w-6 h-6 border-2 border-solid rounded cursor-pointer flex items-center justify-center transition-all duration-200 opacity-40 hover:opacity-70 hover:scale-110"
				:class="{
					'bg-gray-500 border-neutral-500 text-white shadow': allCablesVisible,
				}"
				data-testid="cable-toggle-all"
				:title="allCablesVisible ? 'Hide all cables' : 'Show all cables'"
				@click="toggleShowHideAll"
			>
				H
			</button>
			<button
				class="w-6 h-6 border-2 border-solid rounded cursor-pointer flex items-center justify-center transition-all duration-200 opacity-40 hover:opacity-70 hover:scale-110"
				title="Re-render cables"
				@click="uiStore.shakeCables()"
			>
				S
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { useCableVisibility } from '../../composables/useCableVisibility';
	import { useUiStore } from '../../store/ui';
	import type { CableVisibility } from '../../composables/useCableVisibility';

	const { cableColors, cableVisibility, allCablesVisible, toggleCableVisibility, toggleShowHideAll } = useCableVisibility();
	const uiStore = useUiStore();

	function getVisibility(colorName: string): boolean {
		return cableVisibility.value[colorName as keyof CableVisibility];
	}

	function toggle(colorName: string) {
		toggleCableVisibility(colorName as keyof CableVisibility);
	}
</script>
