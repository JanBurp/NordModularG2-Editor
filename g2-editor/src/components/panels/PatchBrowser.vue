<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import SearchInput from "../common/SearchInput.vue";

const props = defineProps({
	isActive: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(["select"]);

const patchFiles = ref([]);
const loading = ref(true);
const error = ref("");
const searchQuery = ref("");

const filteredFiles = computed(() => {
	if (!searchQuery.value) return patchFiles.value;
	const query = searchQuery.value.toLowerCase();
	return patchFiles.value.filter((file) => file.toLowerCase().includes(query));
});

async function loadPatchList() {
	if (!window.electronAPI) {
		error.value = "Electron API not available";
		loading.value = false;
		return;
	}

	try {
		const result = await window.electronAPI.patches.list();
		if (result.success && result.files) {
			patchFiles.value = result.files;
		} else {
			error.value = result.error || "Failed to load patches";
		}
	} catch (e) {
		error.value = e.message;
	}
	loading.value = false;
}

function selectPatch(filename) {
	emit("select", filename);
}

function handleEnter() {
	if (filteredFiles.value.length > 0) {
		selectPatch(filteredFiles.value[0]);
	}
}

function formatName(filename) {
	return filename.replace(".pch2", "").replace(".prf2", "");
}

onMounted(() => {
	loadPatchList();
});
</script>

<template>
	<div class="h-full overflow-y-auto p-2">
		<SearchInput
			v-model="searchQuery"
			placeholder="Search patches..."
			:isActive="isActive"
			@enter="handleEnter"
		/>
		<div v-if="loading" class="p-4 text-center text-neutral-500">
			Loading patches...
		</div>
		<div v-else-if="error" class="p-4 text-center text-red-500">
			{{ error }}
		</div>
		<div
			v-else-if="filteredFiles.length === 0"
			class="p-4 text-center text-neutral-500"
		>
			{{
				searchQuery ? "No patches match your search" : "No patch files found"
			}}
		</div>
		<ul v-else class="list-none m-0 p-0">
			<li
				v-for="file in filteredFiles"
				:key="file"
				class="flex items-center gap-2 py-2.5 px-3 cursor-pointer rounded transition-colors duration-150 hover:bg-neutral-700"
				@click="selectPatch(file)"
			>
				<span class="text-sm">📄</span>
				<span
					class="text-sm text-neutral-200 whitespace-nowrap overflow-hidden text-ellipsis"
					>{{ formatName(file) }}</span
				>
			</li>
		</ul>
	</div>
</template>
