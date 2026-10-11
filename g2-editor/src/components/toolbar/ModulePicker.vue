<template>
	<ToolBarGroup
		class="flex flex-col gap-1 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-0 focus-visible:outline-none"
		:style="{ width: toolbarWidthPx + 'px' }"
		tabindex="0"
		@keydown="onKeydown"
	>
		<div class="flex flex-col gap-px">
			<div v-for="(row, i) in categoryRows" :key="i" class="flex gap-px">
				<button
					v-for="cat in row"
					:key="cat"
					type="button"
					class="text-xs leading-none px-1 h-6 truncate cursor-pointer border-b-2 shrink-0"
					:class="cat === selectedCategory ? 'bg-input text-black' : 'bg-surface-3 text-content-primary hover:bg-surface-2'"
					:style="{
						borderBottomColor: getCategoryColor(cat),
						width: categoryCellWidthPx + 'px',
					}"
					@click="selectedCategory = cat"
				>
					{{ cat }}
				</button>
			</div>
		</div>
		<div class="flex items-center gap-1 h-8 overflow-hidden">
			<template v-for="(m, i) in modules" :key="m.id">
				<img
					v-if="graphics[m.id]"
					:src="graphics[m.id]"
					:title="m.long || m.short"
					:class="['w-8 h-8 shrink-0 bg-white cursor-grab', i === focusedIndex ? 'ring-2 ring-amber-300' : '']"
					draggable="true"
					@dragstart="(e) => handleDragStart(e, m.id)"
					@dragend="handleDragEnd"
					:alt="m.long || m.short"
				/>
				<div
					v-else
					:title="m.long || m.short"
					:class="[
						'w-8 h-8 shrink-0 flex items-center justify-center text-center text-[8px] leading-none bg-surface-2 border border-line-default rounded cursor-grab overflow-hidden px-0.5',
						i === focusedIndex ? 'ring-2 ring-amber-300' : '',
					]"
					draggable="true"
					@dragstart="(e) => handleDragStart(e, m.id)"
					@dragend="handleDragEnd"
				>
					{{ m.short }}
				</div>
			</template>
		</div>
	</ToolBarGroup>
</template>

<script setup lang="ts">
	import { ref, computed, watch } from 'vue';
	import { getModulesByCategory } from '../../renderer/nmg2mods';
	import { useModuleGraphics } from '../../composables/useModuleGraphics';
	import { useModuleDragSource } from '../../composables/useModuleDragSource';
	import { useVisibleCategories } from '../../composables/useVisibleCategories';
	import { useListNav } from '../../composables/useListNav';
	import { useAddModule } from '../../composables/useAddModule';
	import { getCategoryColor } from '../../constants/moduleCategoryColors';
	import ToolBarGroup from './ToolBarGroup.vue';

	const { graphics } = useModuleGraphics();
	const { handleDragStart, handleDragEnd } = useModuleDragSource();
	const { categories } = useVisibleCategories();
	const { addModuleAtMousePos } = useAddModule();

	const selectedCategory = ref(categories.value[0]);
	// Always exactly 2 rows of (up to) 8: row 1 never changes size/width when Hidden is toggled;
	// a 9th category (Hidden) only extends row 2, keeping every cell's width identical.
	const categoryRows = computed(() => [categories.value.slice(0, 8), categories.value.slice(8)]);

	const modules = computed(() => getModulesByCategory(selectedCategory.value));

	const { selectedIndex: focusedIndex, navigate, reset: resetFocusedIndex } = useListNav(() => modules.value.length);
	watch(selectedCategory, () => resetFocusedIndex());
	// Hidden category can disappear (toggle); fall back instead of showing a stale/empty selection
	watch(categories, (cats) => {
		if (!cats.includes(selectedCategory.value)) selectedCategory.value = cats[0];
	});

	function cycleCategory(direction: 1 | -1) {
		const idx = categories.value.indexOf(selectedCategory.value);
		const len = categories.value.length;
		selectedCategory.value = categories.value[(idx + direction + len) % len];
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab') {
			// Cycle through categories, but let Tab leave past the first/last one
			const idx = categories.value.indexOf(selectedCategory.value);
			if (e.shiftKey ? idx <= 0 : idx === categories.value.length - 1) return;
			e.preventDefault();
			cycleCategory(e.shiftKey ? -1 : 1);
		} else if (e.key === '.' || e.key === '>') {
			e.preventDefault();
			navigate(1);
		} else if (e.key === ',' || e.key === '<') {
			e.preventDefault();
			navigate(-1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const mod = modules.value[focusedIndex.value];
			if (mod) addModuleAtMousePos(mod.id).catch(console.error);
		}
	}

	// Fixed to the widest category's icon row so switching categories never resizes the toolbar.
	const ICON_SIZE = 33;
	const ICON_GAP = 4; // gap-1
	const maxModuleCount = computed(() => Math.max(1, ...categories.value.map((c) => getModulesByCategory(c).length)));
	const pickerWidthPx = computed(() => maxModuleCount.value * ICON_SIZE + (maxModuleCount.value - 1) * ICON_GAP);

	// Category cells are sized to fill 8 columns of pickerWidthPx; a 9th (row 2 only, Hidden) extends the toolbar instead of shrinking cells.
	const CATEGORY_GAP = 1; // gap-px
	const categoryCellWidthPx = computed(() => (pickerWidthPx.value - 7 * CATEGORY_GAP) / 8);
	const toolbarWidthPx = computed(() =>
		categoryRows.value[1].length > 8 ? pickerWidthPx.value + categoryCellWidthPx.value + CATEGORY_GAP : pickerWidthPx.value,
	);
</script>
