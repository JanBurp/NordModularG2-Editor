<template>
	<div class="flex gap-0">
		<button
			v-for="color in cableColors"
			:key="color.name"
			class="btn btn-toggle btn-small btn-group-item w-6 h-6 btn-cable-select"
			:style="{ backgroundColor: color.hex, borderColor: color.hex }"
			:data-testid="`cable-toggle-${color.name}`"
			:title="color.label + (getVisibility(color.name) ? ' (visible)' : ' (hidden)')"
			@click="toggle(color.name)"
		>
			<span
				class="w-2 h-2 rounded-full opacity-0 transition-opacity duration-200"
				:class="{ 'opacity-100': getVisibility(color.name) }"
				:style="{ backgroundColor: 'rgba(0,0,0,0.5)' }"
			></span>
		</button>
		<button
			class="btn btn-toggle btn-small btn-group-item w-6 h-6 btn-cable-select"
			:class="{ 'btn-active': allCablesVisible }"
			data-testid="cable-toggle-all"
			:title="allCablesVisible ? 'Hide all cables' : 'Show all cables'"
			@click="toggleShowHideAll"
		>
			H
		</button>
		<button class="btn btn-toggle btn-small btn-group-item w-6 h-6 btn-cable-select" title="Re-render cables" @click="uiStore.shakeCables()">S</button>
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
