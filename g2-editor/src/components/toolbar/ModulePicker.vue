<template>
	<!-- Toolbar steps (see ExtendedToolBar.vue): the 'Hidden' category hides first (picker back to 8 columns),
	     later the picker shrinks from its full width down to MIN_PICKER_WIDTH (its flex basis). -->
	<ToolBarGroup
		class="flex gap-1 min-w-0 max-w-(--picker-full) @max-[1502px]/toolbar:max-w-(--picker-base) focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-0 focus-visible:outline-none"
		:class="short ? 'h-auto! flex-row items-center gap-2' : 'flex-col'"
		:style="{ flex: `1 1 ${MIN_PICKER_WIDTH}px`, '--picker-full': fullWidthPx + 'px', '--picker-base': pickerWidthPx + 'px' }"
		tabindex="0"
		@keydown="onKeydown"
	>
		<!-- short window (useShortWindow): the category rows become a dropdown in front of the icon strip -->
		<Select
			v-if="short"
			v-model="selectedCategory"
			:options="categories.map((c) => ({ id: c, name: c }))"
			title="Module category"
			class="shrink-0"
			@mouseenter="showHint('modulePickerCategory')"
			@mouseleave="clearHint"
		/>
		<!-- 2 rows filled column by column like the official toolbar (In/Out above Note, Osc above LFO, …);
		     a 17th category (Hidden) extends row 2 by a column, until the toolbar gets narrow -->
		<div v-else class="grid grid-rows-2 grid-flow-col auto-cols-fr gap-px">
			<button
				v-for="cat in categories"
				:key="cat"
				type="button"
				class="text-xs leading-none px-1 h-6 truncate cursor-pointer border-b-2"
				:class="[
					cat === selectedCategory ? 'bg-input text-black' : 'bg-surface-3 text-content-primary hover:bg-surface-2',
					{ 'row-start-2 @max-[1502px]/toolbar:hidden': cat === HIDDEN_CATEGORY },
				]"
				:style="{ borderBottomColor: getCategoryColor(cat) }"
				@click="selectedCategory = cat"
				@mouseenter="showHint('modulePickerCategory')"
				@mouseleave="clearHint"
			>
				{{ cat }}
			</button>
		</div>
		<!-- @container: icons, gaps and spacers scale together with the strip's width, so even the widest
		     category always shows every module -->
		<div class="@container flex items-center h-8 min-w-0 overflow-hidden" :class="{ 'flex-1': short }" :style="iconVars">
			<template v-for="(m, i) in modules" :key="m.id">
				<img
					v-if="graphics[m.id]"
					:src="graphics[m.id]"
					:title="m.long || m.short"
					:class="['w-(--icon) h-(--icon) shrink-0 bg-white cursor-grab', i === focusedIndex ? 'ring-2 ring-amber-300' : '']"
					:style="{ marginLeft: i === 0 ? undefined : hasToolbarGapBefore(modules, i) ? 'var(--spacer)' : 'var(--gap)' }"
					draggable="true"
					@dragstart="(e) => handleDragStart(e, m.id)"
					@dragend="handleDragEnd"
					@mouseenter="showHint('modulePickerModule')"
					@mouseleave="clearHint"
					:alt="m.long || m.short"
				/>
				<div
					v-else
					:title="m.long || m.short"
					:class="[
						'w-(--icon) h-(--icon) shrink-0 flex items-center justify-center text-center text-[8px] leading-none bg-surface-2 border border-line-default rounded cursor-grab overflow-hidden px-0.5',
						i === focusedIndex ? 'ring-2 ring-amber-300' : '',
					]"
					:style="{ marginLeft: i === 0 ? undefined : hasToolbarGapBefore(modules, i) ? 'var(--spacer)' : 'var(--gap)' }"
					draggable="true"
					@dragstart="(e) => handleDragStart(e, m.id)"
					@dragend="handleDragEnd"
					@mouseenter="showHint('modulePickerModule')"
					@mouseleave="clearHint"
				>
					{{ m.short }}
				</div>
			</template>
		</div>
	</ToolBarGroup>
</template>

<script setup lang="ts">
	import { ref, computed, watch } from 'vue';
	import { getModulesByCategory, hasToolbarGapBefore } from '../../renderer/nmg2mods';
	import { useModuleGraphics } from '../../composables/useModuleGraphics';
	import { useModuleDragSource } from '../../composables/useModuleDragSource';
	import { useVisibleCategories } from '../../composables/useVisibleCategories';
	import { useListNav } from '../../composables/useListNav';
	import { useAddModule } from '../../composables/useAddModule';
	import { useStatusHint } from '../../composables/useStatusHint';
	import { getCategoryColor } from '../../constants/moduleCategoryColors';
	import { useShortWindow } from '../../composables/useShortWindow';
	import Select from '../common/Select.vue';
	import ToolBarGroup from './ToolBarGroup.vue';

	const { showHint, clearHint } = useStatusHint();
	const short = useShortWindow();

	const { graphics } = useModuleGraphics();
	const { handleDragStart, handleDragEnd } = useModuleDragSource();
	const { categories } = useVisibleCategories();
	const { addModuleAtMousePos } = useAddModule();

	const HIDDEN_CATEGORY = 'Hidden';
	const selectedCategory = ref(categories.value[0]);

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

	// Base width = the widest category's icon row at full icon size, so switching categories never resizes the
	// toolbar; the Hidden category adds one more category column (fullWidthPx).
	const ICON_SIZE = 33; // incl. rounding slack
	const ICON_GAP = 4;
	const TOOLBAR_SPACER = 8; // official editor: 5px spacer view + 1px button spacing
	function rowWidthPx(category: string) {
		const mods = getModulesByCategory(category);
		const gaps = mods.filter((_, i) => hasToolbarGapBefore(mods, i)).length;
		return mods.length * ICON_SIZE + Math.max(0, mods.length - 1) * ICON_GAP + gaps * TOOLBAR_SPACER;
	}
	const pickerWidthPx = computed(() => Math.max(ICON_SIZE, ...categories.value.filter((c) => c !== HIDDEN_CATEGORY).map(rowWidthPx)));
	const CATEGORY_GAP = 1; // gap-px
	const fullWidthPx = computed(() =>
		categories.value.includes(HIDDEN_CATEGORY) ? pickerWidthPx.value + (pickerWidthPx.value - 7 * CATEGORY_GAP) / 8 + CATEGORY_GAP : pickerWidthPx.value,
	);

	// Narrower than the base width (down to MIN_PICKER_WIDTH, the flex basis): icon, gap and spacer all scale by
	// strip width / base width (cqw of the strip), never above their full size.
	const MIN_PICKER_WIDTH = 380;
	const scaled = (px: number) => `min(${px}px, calc(100cqw * ${px / pickerWidthPx.value}))`;
	const iconVars = computed(() => ({ '--icon': scaled(ICON_SIZE - 1), '--gap': scaled(ICON_GAP), '--spacer': scaled(TOOLBAR_SPACER) }));
</script>
