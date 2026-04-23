<template>
	<div class="h-full overflow-y-auto p-2 bg-neutral-900">
		<SearchInput
			v-model="searchQuery"
			placeholder="Search modules..."
		/>
		<div v-for="category in categories" :key="category" class="mb-4">
			<div v-if="getModulesByCategory(category).length > 0">
				<div
					class="flex items-center gap-2 py-2 px-1 cursor-pointer text-xs font-semibold text-neutral-400 border-b border-neutral-700 hover:text-neutral-200"
					@click="toggleCategory(category)"
				>
					<span class="text-xs w-3 text-neutral-500">{{
						isExpanded(category) ? "▼" : "▶"
					}}</span>
					{{ category }}
					<span class="font-normal text-neutral-500 text-xs"
						>({{ getModulesByCategory(category).length }})</span
					>
				</div>

				<div
					v-if="isExpanded(category)"
					class="flex flex-col gap-2 py-2"
				>
					<div
						v-for="module in getModulesByCategory(category)"
						:key="module.id"
						class="w-64 bg-neutral-600 rounded overflow-visible shadow"
						:style="{ height: getModuleHeight(module) + 'px' }"
					>
						<svg
							width="256"
							:height="getModuleHeight(module)"
							xmlns="http://www.w3.org/2000/svg"
						>
							<Module
								:type="module.id"
								:instance="getModuleInstance(module.id)"
								@param-change="
									(modIdx, paramIdx, val) =>
										onParamChange(module.id, paramIdx, val)
								"
							/>
						</svg>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>


<script setup>
import { ref, reactive, computed } from "vue";
import Module from "../canvas/Module.vue";
import SearchInput from "../common/SearchInput.vue";
import { getModule, getAllCategories, getModulesByCategory as getModulesByCategoryRaw } from "../../renderer/nmg2mods";
import { getParam } from "../../renderer/parammap";

const categories = computed(() => getAllCategories());
const expandedCategories = ref(getAllCategories());
const searchQuery = ref("");

const moduleInstances = reactive(new Map());

function toggleCategory(category) {
	const idx = expandedCategories.value.indexOf(category);
	if (idx >= 0) {
		expandedCategories.value.splice(idx, 1);
	} else {
		expandedCategories.value.push(category);
	}
}

function isExpanded(category) {
	return expandedCategories.value.includes(category);
}

function getModulesByCategory(category) {
	let modules = getModulesByCategoryRaw(category);

	if (searchQuery.value) {
		const query = searchQuery.value.toLowerCase();
		modules = modules.filter((m) => {
			const name = (m.short || "").toLowerCase();
			return name.includes(query);
		});
	}

	return modules;
}

function getModuleHeight(module) {
	return (module.height || 2) * 16;
}

function getModuleInstance(moduleId) {
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
				if (paramType?.includes("Freq")) return 64;
				if (paramType?.includes("Res")) return 30;
				if (paramName?.includes("Slope") || paramName?.includes("Gain"))
					return 64;
				return 64;
			}) || [];

		moduleInstances.set(moduleId, {
			index: 0,
			type: moduleId,
			horiz: 0,
			vert: 0,
			colour: 0,
			lv: defaultLv,
			modes: [],
		});
	}
	return moduleInstances.get(moduleId);
}

function onParamChange(moduleId, paramIndex, value) {
	const instance = moduleInstances.get(moduleId);
	if (instance) {
		instance.lv[paramIndex] = value;
	}
}

function resetAllModules() {
	moduleInstances.clear();
}
</script>
