<template>
	<div class="h-full overflow-y-auto p-2 bg-neutral-900">
		<SearchInput v-model="searchQuery" :isActive="isActive" placeholder="Search modules..." />
		<div data-testid="module-count" class="text-xs text-neutral-500 py-1 px-1">{{ totalModuleCount }} modules</div>
		<div v-for="category in categories" :key="category" class="mb-4">
			<div v-if="categoryMatchesSearch(category)">
				<div
					class="flex items-center gap-2 py-2 px-1 cursor-pointer text-xs font-semibold text-neutral-400 border-b border-neutral-700 hover:text-neutral-200"
					@click="toggleCategory(category)"
				>
					<span class="text-xs w-3 text-neutral-500">{{ isExpanded(category) ? '▼' : '▶' }}</span>
					{{ category }}
					<span class="font-normal text-neutral-500 text-xs">({{ getModulesByCategory(category).length }})</span>
				</div>

				<div v-if="isExpanded(category)" class="flex flex-col gap-2 py-2">
					<template v-for="module in getModulesByCategory(category)" :key="module.id">
						<div
							class="w-64 bg-neutral-600 rounded overflow-visible shadow"
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
							v-if="helpModule?.id === module.id && helpHtml"
							class="module-help w-64 bg-neutral-800 rounded p-3 text-xs text-neutral-300"
							v-html="helpHtml"
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
	import { getModule, getAllCategories, getModulesByCategory as getModulesByCategoryRaw } from '../../renderer/nmg2mods';
	import type { ModuleDefinition } from '@/types';
	import { getParam } from '../../renderer/parammap';
	import { useUiStore } from '@/store/ui';
	import { useSettingsStore } from '@/store/settings';
	import { useModuleHelp } from '../../composables/useModuleHelp';

	const ui = useUiStore();
	const settings = useSettingsStore();
	const { helpHtml, loadHelp } = useModuleHelp();

	const categories = computed(() => {
		const all = getAllCategories();
		return settings.hidden_modules ? all : all.filter((c) => c !== 'Hidden');
	});
	const expandedCategories = ref(getAllCategories());
	const searchQuery = ref('');
	const selectedModuleId = ref<number | null>(null);

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

	watch(searchQuery, () => {
		selectedModuleId.value = null;
	});

	const moduleInstances = reactive(new Map());

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
