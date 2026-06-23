<template>
	<div class="h-full overflow-y-auto overflow-x-hidden p-2 bg-surface-0">
		<SearchInput ref="searchRef" v-model="searchQuery" :isActive="isActive" placeholder="Search modules... (/)" @up="navigate(-1)" @down="navigate(1)" @enter="handleEnter" />
		<div class="flex justify-between items-center">
			<div data-testid="module-count" class="text-content-muted py-1 px-1">{{ totalModuleCount }} modules</div>
			<Button variant="toggle" size="xs" @click="toggleAllCategories">{{ allExpanded ? 'Collapse All' : 'Expand All' }}</Button>
		</div>
		<div v-for="category in categories" :key="category" class="mb-4">
			<div v-if="categoryMatchesSearch(category)">
				<div
					class="flex items-center gap-2 py-2 px-1 cursor-pointer text-xs font-semibold text-content-secondary border-b border-line-subtle hover:text-content-primary"
					@click="toggleCategory(category)"
				>
					<span class="text-xs w-3 text-content-muted">{{ isExpanded(category) ? '▼' : '▶' }}</span>
					{{ category }}
					<span class="font-normal text-content-muted text-xs">({{ getModulesByCategory(category).length }})</span>
				</div>

				<div v-if="isExpanded(category)" class="flex flex-col gap-2 py-2">
					<template v-for="module in getModulesByCategory(category)" :key="module.id">
						<div
							:class="['w-64 bg-surface-3 rounded overflow-visible shadow', module.id === selectedNavModuleId ? 'ring-2 ring-accent-primary' : '']"
							:style="{
								height: getModuleHeight(module) + 'px',
								cursor: 'grab',
							}"
							:data-testid="`module-item-${module.short}`"
							draggable="true"
							@dragstart="(e) => handleModuleDragStart(e, module.id)"
							@dragend="handleModuleDragEnd"
							@click="handleModuleClick(module.id)"
						>
							<svg width="256" :height="getModuleHeight(module)" xmlns="http://www.w3.org/2000/svg" style="pointer-events: none">
								<Module :instance="getModuleInstance(module.id)" />
							</svg>
						</div>
						<div
							v-if="(ui.helpAllModules && helpCache.get(module.id)) || (helpModule?.id === module.id && helpHtml)"
							class="module-help w-64 bg-surface-1 rounded p-3 text-xs text-content-secondary"
							v-html="ui.helpAllModules ? helpCache.get(module.id) || '' : helpHtml"
						/>
					</template>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, reactive, computed, watch } from 'vue';
	import Module from '../canvas/Module.vue';
	import SearchInput from '../common/SearchInput.vue';
	import Button from '../toolbar/Button.vue';
	import { getModule, getAllCategories, getModulesByCategory as getModulesByCategoryRaw } from '../../renderer/nmg2mods';
	import type { ModuleDefinition } from '@/types';
	import { getParam } from '../../renderer/parammap';
	import { useUiStore } from '@/store/ui';
	import { useSettingsStore } from '@/store/settings';
	import { useSlotsStore } from '@/store/slots';
	import { useModuleHelp } from '../../composables/useModuleHelp';

	const ui = useUiStore();
	const settings = useSettingsStore();
	const slotsStore = useSlotsStore();
	const { helpHtml, loadHelp } = useModuleHelp();
	const searchRef = ref();

	defineExpose({ focusSearch: () => searchRef.value?.focus() });

	const categories = computed(() => {
		const all = getAllCategories();
		return settings.hidden_modules ? all : all.filter((c) => c !== 'Hidden');
	});
	const expandedCategories = ref(settings.categoriesExpanded ? getAllCategories() : []);
	const searchQuery = ref('');
	const selectedModuleId = ref<number | null>(null);
	const selectedNavIndex = ref(-1);

	defineProps<{
		isActive: boolean;
	}>();

	const totalModuleCount = computed(() => {
		let count = 0;
		for (const category of categories.value) {
			if (categoryMatchesSearch(category)) {
				count += getModulesByCategory(category).length;
			}
		}
		return count;
	});

	const helpModule = computed<ModuleDefinition | null>(() => {
		if (selectedModuleId.value !== null) {
			return getModule(selectedModuleId.value) ?? null;
		}
		if (totalModuleCount.value === 1) {
			for (const cat of categories.value) {
				if (categoryMatchesSearch(cat)) {
					const mods = getModulesByCategory(cat);
					if (mods.length === 1) return mods[0];
				}
			}
		}
		return null;
	});

	watch(helpModule, (mod) => {
		if (mod) loadHelp(mod.short);
		else helpHtml.value = '';
	});

	const flatNavModules = computed(() => {
		if (!searchQuery.value) {
			return categories.value
				.filter((c) => categoryMatchesSearch(c) && isExpanded(c))
				.flatMap((c) => getModulesByCategory(c));
		}
		return categories.value.filter((c) => categoryMatchesSearch(c)).flatMap((c) => getModulesByCategory(c));
	});

	const selectedNavModuleId = computed(() =>
		selectedNavIndex.value >= 0 ? (flatNavModules.value[selectedNavIndex.value]?.id ?? null) : null,
	);

	watch(searchQuery, () => {
		selectedModuleId.value = null;
		selectedNavIndex.value = -1;
	});

	watch(
		() => ui.helpModuleTypeId,
		(typeId) => {
			if (typeId === null) {
				selectedModuleId.value = null;
				return;
			}
			selectedModuleId.value = typeId;
			for (const cat of getAllCategories()) {
				if (getModulesByCategoryRaw(cat).some((m) => m.id === typeId)) {
					if (!expandedCategories.value.includes(cat)) {
						expandedCategories.value.push(cat);
					}
					break;
				}
			}
			requestAnimationFrame(() => {
				const mod = getModule(typeId);
				if (mod) {
					document.querySelector(`[data-testid="module-item-${mod.short}"]`)?.scrollIntoView({ behavior: 'instant', block: 'start' });
				}
			});
		},
		{ flush: 'post' },
	);

	const helpCache = ref(new Map<number, string>());

	async function loadAllHelp() {
		const { marked } = await import('marked');
		const allMods = getAllCategories().flatMap((cat) => getModulesByCategoryRaw(cat));
		await Promise.all(
			allMods.map(async (mod) => {
				if (helpCache.value.has(mod.id)) return;
				const raw = await window.electronAPI.loadHelp(mod.short);
				if (!raw) return;
				helpCache.value.set(mod.id, (await marked(raw)) as string);
			}),
		);
	}

	// Pre-load cache whenever the modules pane becomes visible so F1 "show all" is instant
	watch(
		[() => settings.showRightPane, () => settings.rightPaneTab],
		([show, tab]) => {
			if (show && tab === 'modules') loadAllHelp();
		},
		{ immediate: true },
	);

	watch(
		() => ui.helpAllModules,
		(val) => {
			if (val) loadAllHelp();
		},
	);

	const moduleInstances = reactive(new Map());

	const allExpanded = computed(() => categories.value.every((c) => expandedCategories.value.includes(c)));

	function toggleAllCategories() {
		const next = !allExpanded.value;
		expandedCategories.value = next ? [...categories.value] : [];
		settings.setCategoriesExpanded(next);
	}

	function toggleCategory(category: string) {
		const idx = expandedCategories.value.indexOf(category);
		if (idx >= 0) {
			expandedCategories.value.splice(idx, 1);
		} else {
			expandedCategories.value.push(category);
		}
	}

	function isExpanded(category: string) {
		return expandedCategories.value.includes(category);
	}

	function categoryMatchesSearch(category: string): boolean {
		if (!searchQuery.value) return true;

		const query = searchQuery.value.toLowerCase();

		if (query.includes(' ')) {
			const [catQuery, modQuery] = query.split(' ');
			if (category.toLowerCase().includes(catQuery)) {
				if (!modQuery) return true;
				const modules = getModulesByCategoryRaw(category);
				return modules.some((m) => (m.short || '').toLowerCase().includes(modQuery) || (m.long || '').toLowerCase().includes(modQuery));
			}
			return false;
		}

		if (category.toLowerCase().includes(query)) return true;

		const modules = getModulesByCategoryRaw(category);
		return modules.some((m) => (m.short || '').toLowerCase().includes(query) || (m.long || '').toLowerCase().includes(query));
	}

	function getModulesByCategory(category: string): ModuleDefinition[] {
		let modules = getModulesByCategoryRaw(category);

		if (searchQuery.value) {
			const query = searchQuery.value.toLowerCase();
			let modQuery = query;

			if (query.includes(' ')) {
				const [catQuery, mod] = query.split(' ');
				if (category.toLowerCase().includes(catQuery)) {
					modQuery = mod;
				} else {
					return [];
				}
			}

			if (modQuery) {
				modules = modules.filter((m) => {
					const name = (m.short || '').toLowerCase();
					return name.includes(modQuery);
				});
			}
		}

		return modules;
	}

	function getModuleHeight(module: ModuleDefinition) {
		return (module.height || 2) * 16;
	}

	function getModuleInstance(moduleId: number) {
		if (!moduleInstances.has(moduleId)) {
			const modDef = getModule(moduleId);
			const defaultLv =
				modDef?.params?.map((param) => {
					const paramType = param.type;
					const paramName = param.name;
					const p = getParam(paramType);
					if (p?.def !== undefined) {
						return p.def;
					}
					if (paramType?.includes('Freq')) return 64;
					if (paramType?.includes('Res')) return 30;
					if (paramName?.includes('Slope') || paramName?.includes('Gain')) return 64;
					return 64;
				}) || [];

			moduleInstances.set(moduleId, {
				type: moduleId,
				index: 0,
				horiz: 0,
				vert: 0,
				colour: 0,
				lv: defaultLv,
				modes: [],
			});
		}
		return moduleInstances.get(moduleId);
	}

	function navigate(direction: 1 | -1) {
		const count = flatNavModules.value.length;
		if (!count) return;
		selectedNavIndex.value =
			selectedNavIndex.value < 0
				? direction === 1
					? 0
					: count - 1
				: Math.max(0, Math.min(count - 1, selectedNavIndex.value + direction));

		const mod = flatNavModules.value[selectedNavIndex.value];
		if (!mod) return;

		for (const cat of categories.value) {
			if (getModulesByCategoryRaw(cat).some((m) => m.id === mod.id)) {
				if (!expandedCategories.value.includes(cat)) expandedCategories.value.push(cat);
				break;
			}
		}
		requestAnimationFrame(() => {
			document.querySelector(`[data-testid="module-item-${mod.short}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});
	}

	let isAddingModule = false;

	function handleEnter() {
		if (isAddingModule || selectedNavIndex.value < 0) return;
		const mod = flatNavModules.value[selectedNavIndex.value];
		if (!mod) return;
		isAddingModule = true;
		addModuleAtMousePos(mod.id)
			.catch(console.error)
			.finally(() => {
				isAddingModule = false;
			});
	}

	async function addModuleAtMousePos(typeId: number) {
		const pos = ui.lastMousePos;
		const col = pos?.col ?? 0;
		const row = pos?.row ?? 0;
		const isVoice = !pos || pos.area === 'va';
		const area = isVoice ? 'voice' : 'fx';
		const areaNum: 0 | 1 = isVoice ? 1 : 0;
		const modules = slotsStore.getAreaModules(ui.slotInFocus, areaNum);
		await slotsStore.dropModuleWithCollision(typeId, col, row, area, modules);
	}

	function handleModuleClick(moduleId: number) {
		selectedModuleId.value = selectedModuleId.value === moduleId ? null : moduleId;
	}

	function handleModuleDragStart(e: DragEvent, moduleId: number) {
		if (e.dataTransfer) e.dataTransfer.setData('text/plain', String(moduleId));
		ui.draggedModuleId = moduleId;
	}

	function handleModuleDragEnd() {
		ui.draggedModuleId = null;
	}
</script>

<style scoped>
	.module-help :deep(h1) {
		font-size: 0.85rem;
		font-weight: 600;
		color: #e5e5e5;
		margin-bottom: 0.5rem;
	}
	.module-help :deep(h2) {
		font-size: 0.75rem;
		font-weight: 600;
		color: #d4d4d4;
		margin-top: 0.75rem;
		margin-bottom: 0.25rem;
	}
	.module-help :deep(p) {
		margin-bottom: 0.5rem;
		line-height: 1.5;
	}
	.module-help :deep(strong) {
		color: #e5e5e5;
		font-weight: 600;
	}
	.module-help :deep(ul) {
		list-style: disc;
		padding-left: 1rem;
		margin-bottom: 0.5rem;
	}
	.module-help :deep(li) {
		margin-bottom: 0.2rem;
		line-height: 1.5;
	}
</style>
