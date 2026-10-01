<template>
	<Teleport to="body">
		<div class="fixed inset-0 z-50" @mousedown.self="emit('close')">
			<div class="absolute w-80 bg-surface-1 border border-line-default rounded shadow-xl p-3" :style="panelStyle">
				<SearchInput ref="searchRef" v-model="query" placeholder="Add module..." @up="navigate(-1)" @down="navigate(1)" @enter="handleEnter" />
				<div v-if="query" class="max-h-64 overflow-y-auto mt-1" role="listbox">
					<div
						v-for="(m, i) in filtered"
						:key="m.id"
						:ref="(el) => setItemRef(el, i)"
						role="option"
						:aria-selected="i === navIndex"
						:class="[
							'flex items-center gap-2 px-2 py-1 text-xs cursor-pointer rounded',
							i === navIndex ? 'bg-blue-500 dark:bg-blue-400 text-white' : 'hover:bg-surface-3',
						]"
						@mousedown.prevent="addAndClose(m.id)"
					>
						<img v-if="graphics[m.id]" :src="graphics[m.id]" class="w-8 h-8 shrink-0 bg-white" :alt="m.long || m.short" />
						<span class="font-medium">{{ m.long || m.short }}</span>
						<span :class="['text-xs', i === navIndex ? 'text-white/70' : 'text-content-muted']">{{ m.page?.name }}</span>
					</div>
					<div v-if="filtered.length === 0" class="px-2 py-2 text-xs text-content-muted">No modules found</div>
					<div v-else-if="matchingModules.length > MAX_RESULTS" class="px-2 py-1 text-xs text-content-muted">
						+{{ matchingModules.length - MAX_RESULTS }} more — keep typing to narrow
					</div>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
	import SearchInput from './SearchInput.vue';
	import { getModulesByCategory } from '../../renderer/nmg2mods';
	import { useAddModule } from '../../composables/useAddModule';
	import { useModuleGraphics } from '../../composables/useModuleGraphics';
	import { useVisibleCategories } from '../../composables/useVisibleCategories';

	const props = defineProps<{ x: number; y: number }>();
	const emit = defineEmits<{ close: [] }>();

	const { categories } = useVisibleCategories();

	const PANEL_W = 320; // w-80
	const PANEL_H = 360; // search + list estimate

	const panelStyle = computed(() => {
		const x = Math.min(Math.max(props.x + 8, 8), window.innerWidth - PANEL_W - 8);
		const y = Math.min(Math.max(props.y + 8, 8), window.innerHeight - PANEL_H - 8);
		return { left: `${x}px`, top: `${y}px` };
	});
	const { addModuleAtMousePos } = useAddModule();
	const { graphics } = useModuleGraphics();

	const searchRef = ref();
	const query = ref('');
	const navIndex = ref(0);
	const itemRefs = ref<(Element | null)[]>([]);

	onMounted(() => {
		searchRef.value?.focus();
	});

	function onDocKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			emit('close');
		}
	}

	onMounted(() => document.addEventListener('keydown', onDocKeydown, true));
	onUnmounted(() => document.removeEventListener('keydown', onDocKeydown, true));

	function setItemRef(el: unknown, i: number) {
		itemRefs.value[i] = el instanceof Element ? el : null;
	}

	const allModules = computed(() => categories.value.flatMap((cat) => getModulesByCategory(cat)));

	// Each module icon is an SVG with an embedded font, so rendering dozens at once (e.g. every
	// module matching a single-letter query) blocks the main thread for hundreds of ms. Capping
	// keeps typing responsive; users narrow further by typing more.
	const MAX_RESULTS = 10;

	const matchingModules = computed(() => {
		const q = query.value.toLowerCase().trim();
		if (!q) return allModules.value;
		return allModules.value.filter((m) => (m.short || '').toLowerCase().includes(q) || (m.long || '').toLowerCase().includes(q));
	});

	const filtered = computed(() => matchingModules.value.slice(0, MAX_RESULTS));

	watch(query, () => {
		navIndex.value = 0;
	});

	watch(navIndex, async (i) => {
		await nextTick();
		itemRefs.value[i]?.scrollIntoView({ block: 'nearest' });
	});

	function navigate(dir: 1 | -1) {
		const count = filtered.value.length;
		if (!count) return;
		navIndex.value = Math.max(0, Math.min(count - 1, navIndex.value + dir));
	}

	async function addAndClose(typeId: number) {
		emit('close');
		await addModuleAtMousePos(typeId).catch(console.error);
	}

	function handleEnter() {
		const mod = filtered.value[navIndex.value];
		if (mod) addAndClose(mod.id);
	}
</script>
