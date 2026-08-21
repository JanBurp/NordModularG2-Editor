<template>
	<div class="flex flex-col gap-0.5" :style="{ width: pickerWidthPx + 'px' }">
		<div class="grid grid-cols-8 gap-px">
			<button
				v-for="cat in categories"
				:key="cat"
				type="button"
				class="text-[10px] leading-none px-1 h-5 truncate cursor-pointer border-b-2"
				:class="cat === selectedCategory ? 'bg-surface-1' : 'bg-surface-3 text-content-primary hover:bg-surface-3'"
				:style="{
					borderBottomColor: getCategoryColor(cat),
				}"
				@click="selectedCategory = cat"
			>
				{{ cat }}
			</button>
		</div>
		<div class="flex items-center gap-1 h-7 overflow-x-auto">
			<template v-for="m in modules" :key="m.id">
				<img
					v-if="graphics[m.id]"
					:src="graphics[m.id]"
					:title="m.long || m.short"
					class="w-6 h-6 shrink-0 bg-white cursor-grab"
					draggable="true"
					@dragstart="(e) => handleDragStart(e, m.id)"
					@dragend="handleDragEnd"
				/>
				<div
					v-else
					:title="m.long || m.short"
					class="w-6 h-6 shrink-0 flex items-center justify-center text-center text-[8px] leading-none bg-surface-2 border border-line-default rounded-sm cursor-grab overflow-hidden px-0.5"
					draggable="true"
					@dragstart="(e) => handleDragStart(e, m.id)"
					@dragend="handleDragEnd"
				>
					{{ m.short }}
				</div>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed } from 'vue';
	import { getAllCategories, getModulesByCategory } from '../../renderer/nmg2mods';
	import { useSettingsStore } from '../../store/settings';
	import { useModuleGraphics } from '../../composables/useModuleGraphics';
	import { useModuleDragSource } from '../../composables/useModuleDragSource';
	import { getCategoryColor } from '../../constants/moduleCategoryColors';

	const settings = useSettingsStore();
	const { graphics } = useModuleGraphics();
	const { handleDragStart, handleDragEnd } = useModuleDragSource();

	const categories = computed(() => {
		const all = getAllCategories();
		return settings.hidden_modules ? all : all.filter((c) => c !== 'Hidden');
	});

	const selectedCategory = ref(categories.value[0]);

	const modules = computed(() => getModulesByCategory(selectedCategory.value));

	// Fixed to the widest category's icon row so switching categories never resizes the toolbar.
	const ICON_SIZE = 24; // w-6/h-6
	const ICON_GAP = 4; // gap-1
	const maxModuleCount = computed(() => Math.max(1, ...categories.value.map((c) => getModulesByCategory(c).length)));
	const pickerWidthPx = computed(() => maxModuleCount.value * ICON_SIZE + (maxModuleCount.value - 1) * ICON_GAP);
</script>
