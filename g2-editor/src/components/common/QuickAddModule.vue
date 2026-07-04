<template>
	<Teleport to="body">
		<div class="fixed inset-0 z-50" @mousedown.self="emit('close')">
			<div class="absolute w-80 bg-surface-1 border border-line-default rounded shadow-xl p-3" :style="panelStyle">
				<SearchInput ref="searchRef" v-model="query" placeholder="Add module..." @up="navigate(-1)" @down="navigate(1)" @enter="handleEnter" />
				<div v-if="query" class="max-h-64 overflow-y-auto mt-1">
					<div
						v-for="(m, i) in filtered"
						:key="m.id"
						:ref="(el) => setItemRef(el, i)"
						:class="[
							'flex items-baseline gap-2 px-2 py-1 text-xs cursor-pointer rounded',
							i === navIndex ? 'bg-blue-500 dark:bg-blue-400 text-white' : 'hover:bg-surface-3',
						]"
						@mousedown.prevent="addAndClose(m.id)"
					>
						<span class="font-medium">{{ m.long || m.short }}</span>
						<span :class="['text-xs', i === navIndex ? 'text-white/70' : 'text-content-muted']">{{ m.page?.name }}</span>
					</div>
					<div v-if="filtered.length === 0" class="px-2 py-2 text-xs text-content-muted">No modules found</div>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
	import SearchInput from './SearchInput.vue';
	import { getAllCategories, getModulesByCategory } from '../../renderer/nmg2mods';
	import { useSettingsStore } from '../../store/settings';
	import { useAddModule } from '../../composables/useAddModule';

	const props = defineProps<{ x: number; y: number }>();
	const emit = defineEmits<{ close: [] }>();

	const settings = useSettingsStore();

	const PANEL_W = 320; // w-80
	const PANEL_H = 360; // search + list estimate

	const panelStyle = computed(() => {
		const x = Math.min(Math.max(props.x + 8, 8), window.innerWidth - PANEL_W - 8);
		const y = Math.min(Math.max(props.y + 8, 8), window.innerHeight - PANEL_H - 8);
		return { left: `${x}px`, top: `${y}px` };
	});
	const { addModuleAtMousePos } = useAddModule();

	const searchRef = ref();
	const query = ref('');
	const navIndex = ref(0);
	const itemRefs = ref<(Element | null)[]>([]);

	onMounted(async () => {
		await nextTick();
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

	const allModules = computed(() => {
		const cats = settings.hidden_modules ? getAllCategories() : getAllCategories().filter((c) => c !== 'Hidden');
		return cats.flatMap((cat) => getModulesByCategory(cat));
	});

	const filtered = computed(() => {
		const q = query.value.toLowerCase().trim();
		if (!q) return allModules.value;
		return allModules.value.filter((m) => (m.short || '').toLowerCase().includes(q) || (m.long || '').toLowerCase().includes(q));
	});

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
