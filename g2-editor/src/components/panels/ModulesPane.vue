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
					<div
						v-for="module in getModulesByCategory(category)"
						:key="module.id"
						class="w-64 bg-neutral-600 rounded overflow-visible shadow"
						:style="{
							height: getModuleHeight(module) + 'px',
							cursor: 'grab',
						}"
						:data-testid="`module-item-${module.short}`"
						draggable="true"
						@dragstart="(e) => handleModuleDragStart(e, module.id)"
						@dragend="handleModuleDragEnd"
					>
						<svg width="256" :height="getModuleHeight(module)" xmlns="http://www.w3.org/2000/svg" style="pointer-events: none">
							<Module :instance="getModuleInstance(module.id)" />
						</svg>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { ref, reactive, computed } from 'vue';
	import Module from '../canvas/Module.vue';
	import SearchInput from '../common/SearchInput.vue';
	import { getModule, getAllCategories, getModulesByCategory as getModulesByCategoryRaw } from '../../renderer/nmg2mods';
	import type { ModuleDefinition } from '@/types';
	import { getParam } from '../../renderer/parammap';
	import { useUiStore } from '@/store/ui';

	const ui = useUiStore();

	const categories = computed(() => getAllCategories());
	const expandedCategories = ref(getAllCategories());
	const searchQuery = ref('');

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

	function handleModuleDragStart(e: DragEvent, moduleId: number) {
		if (e.dataTransfer) e.dataTransfer.setData('text/plain', String(moduleId));
		ui.draggedModuleId = moduleId;
	}

	function handleModuleDragEnd() {
		ui.draggedModuleId = null;
	}
</script>
