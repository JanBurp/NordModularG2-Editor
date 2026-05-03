<script setup lang="ts">
	import { ref, computed } from 'vue';
	import { useBrowserStore, type SynthPatch, type DiskEntry } from '../../store/browser';
	import { useDeviceStore } from '../../store/device';
	import BtnGroup from '../toolbar/BtnGroup.vue';
	import SearchInput from '../common/SearchInput.vue';

	const props = defineProps<{ isActive: boolean }>();

	const emit = defineEmits<{
		select: [item: { type: 'disk'; filepath: string } | { type: 'synth'; bank: number; location: number }];
	}>();

	const browser = useBrowserStore();
	const device = useDeviceStore();

	const searchQuery = ref('');

	const viewOptions = [
		{ label: 'Patches', value: 'patches' },
		{ label: 'Performances', value: 'performances' },
		{ label: 'Disk', value: 'disk' },
	];

	/* Group a flat SynthPatch list by bank number */
	function groupByBank(list: SynthPatch[]): { bank: number; patches: SynthPatch[] }[] {
		const map = new Map<number, SynthPatch[]>();
		for (const p of list) {
			let arr = map.get(p.bank);
			if (!arr) {
				arr = [];
				map.set(p.bank, arr);
			}
			arr.push(p);
		}
		return Array.from(map.entries())
			.sort(([a], [b]) => a - b)
			.map(([bank, patches]) => ({ bank, patches }));
	}

	const filteredPatches = computed(() => {
		const q = searchQuery.value.toLowerCase();
		return q ? browser.synthPatches.filter((p) => p.name.toLowerCase().includes(q)) : browser.synthPatches;
	});

	const filteredPerformances = computed(() => {
		const q = searchQuery.value.toLowerCase();
		return q ? browser.synthPerformances.filter((p) => p.name.toLowerCase().includes(q)) : browser.synthPerformances;
	});

	const patchGroups = computed(() => groupByBank(filteredPatches.value));
	const perfGroups = computed(() => groupByBank(filteredPerformances.value));

	const filteredDiskDirs = computed(() => browser.diskEntries.filter((e) => e.isDir));
	const filteredDiskFiles = computed(() => {
		const q = searchQuery.value.toLowerCase();
		const files = browser.diskEntries.filter((e) => !e.isDir);
		return q ? files.filter((e) => e.name.toLowerCase().includes(q)) : files;
	});

	const diskFolderName = computed(() => browser.diskFolder.split('/').pop() || browser.diskFolder);
	const diskParentName = computed(() => {
		const parts = browser.diskFolder.split('/');
		return parts.length > 1 ? parts[parts.length - 2] || '/' : '';
	});

	async function onViewChange(view: string | number | null | (string | number)[]) {
		const v = view as 'patches' | 'performances' | 'disk';
		browser.view = v;
		searchQuery.value = '';
		if ((v === 'patches' || v === 'performances') && browser.synthPatches.length === 0 && device.connected) {
			await browser.loadSynthList();
		}
	}

	function selectDisk(entry: DiskEntry) {
		if (entry.isDir) {
			browser.loadDiskList(entry.path);
		} else {
			emit('select', { type: 'disk', filepath: entry.path });
		}
	}

	function selectSynth(p: SynthPatch) {
		emit('select', { type: 'synth', bank: p.bank, location: p.location });
	}

	function handleEnter() {
		if (browser.view === 'disk' && filteredDiskFiles.value.length > 0) {
			emit('select', {
				type: 'disk',
				filepath: filteredDiskFiles.value[0].path,
			});
		} else if (browser.view === 'patches' && filteredPatches.value.length > 0) {
			selectSynth(filteredPatches.value[0]);
		} else if (browser.view === 'performances' && filteredPerformances.value.length > 0) {
			selectSynth(filteredPerformances.value[0]);
		}
	}

	function formatFileName(entry: DiskEntry): string {
		return entry.isDir ? entry.name : entry.name.replace(/\.(pch2|prf2)$/i, '');
	}
</script>

<template>
	<div class="h-full flex flex-col overflow-hidden">
		<!-- Tab switcher -->
		<div class="p-2 border-b border-neutral-700 shrink-0">
			<BtnGroup :options="viewOptions" :model-value="browser.view" variant="tab" size="small" @update:model-value="onViewChange" />
		</div>

		<!-- ── DISK VIEW ─────────────────────────────────────── -->
		<template v-if="browser.view === 'disk'">
			<!-- Folder header -->
			<div class="flex items-center gap-1 px-2 py-1.5 border-b border-neutral-700 shrink-0 min-w-0">
				<button
					v-if="diskParentName"
					class="text-neutral-400 hover:text-white text-xs px-1 shrink-0"
					:title="`Up to ${diskParentName}`"
					@click="browser.navigateUp()"
				>
					↑
				</button>
				<span class="text-xs text-neutral-300 truncate flex-1 min-w-0 font-medium">
					{{ diskFolderName || 'No folder selected' }}
				</span>
				<button class="text-sm text-neutral-400 hover:text-white px-1 shrink-0" title="Choose folder" @click="browser.chooseDiskFolder()">…</button>
			</div>

			<template v-if="browser.diskFolder">
				<div class="px-2 pt-2 shrink-0">
					<SearchInput v-model="searchQuery" placeholder="Search files..." :isActive="isActive && browser.view === 'disk'" @enter="handleEnter" />
				</div>

				<div v-if="browser.loading" class="p-4 text-center text-neutral-500 text-sm">Loading...</div>
				<div v-else-if="browser.error" class="p-4 text-center text-red-500 text-xs">
					{{ browser.error }}
				</div>
				<ul v-else class="flex-1 overflow-y-auto list-none m-0 p-0">
					<!-- Directories first -->
					<li
						v-for="entry in filteredDiskDirs"
						:key="entry.path"
						class="flex items-center gap-2 py-1.5 px-3 cursor-pointer hover:bg-neutral-700 transition-colors"
						@click="selectDisk(entry)"
					>
						<span class="text-neutral-400 text-xs shrink-0">▶</span>
						<span class="text-xs text-neutral-300 truncate">{{ entry.name }}</span>
					</li>
					<!-- Files -->
					<li
						v-for="entry in filteredDiskFiles"
						:key="entry.path"
						class="flex items-center gap-2 py-1.5 px-3 cursor-pointer hover:bg-neutral-700 transition-colors"
						@click="selectDisk(entry)"
					>
						<span class="text-neutral-600 text-xs shrink-0 w-3"></span>
						<span class="text-xs text-neutral-200 truncate flex-1">{{ formatFileName(entry) }}</span>
						<span class="text-neutral-600 text-xs shrink-0">{{ entry.name.split('.').pop() }}</span>
					</li>
					<li v-if="filteredDiskDirs.length === 0 && filteredDiskFiles.length === 0" class="p-4 text-center text-neutral-500 text-sm">
						{{ searchQuery ? 'No files match' : 'Empty folder' }}
					</li>
				</ul>
			</template>
			<div v-else class="p-4 text-center text-neutral-500 text-sm">Click … to choose a folder</div>
		</template>

		<!-- ── SYNTH PATCHES / PERFORMANCES ──────────────────── -->
		<template v-else>
			<div v-if="!device.connected" class="p-4 text-center text-neutral-500 text-sm">Connect G2 to browse synth patches</div>
			<template v-else>
				<div class="px-2 pt-2 shrink-0">
					<SearchInput v-model="searchQuery" placeholder="Search..." :isActive="isActive" @enter="handleEnter" />
				</div>

				<div v-if="browser.loading" class="p-4 text-center text-neutral-500 text-sm">Loading from G2...</div>
				<div v-else-if="browser.error" class="p-4 text-center text-red-500 text-xs">
					{{ browser.error }}
				</div>
				<ul v-else class="flex-1 overflow-y-auto list-none m-0 p-0">
					<!-- Patches grouped by bank -->
					<template v-for="group in browser.view === 'patches' ? patchGroups : perfGroups" :key="group.bank">
						<!-- Bank header (collapsible) -->
						<li
							class="flex items-center gap-2 px-3 py-1 bg-neutral-800 cursor-pointer select-none border-b border-neutral-700 sticky top-0 z-10"
							@click="browser.toggleBank(group.bank)"
						>
							<span class="text-neutral-500 text-xs w-3">
								{{ browser.isBankCollapsed(group.bank) ? '▶' : '▼' }}
							</span>
							<span class="text-xs text-neutral-400 font-medium">Bank {{ group.bank }}</span>
							<span class="text-xs text-neutral-600 ml-auto">{{ group.patches.length }}</span>
						</li>
						<!-- Patch entries -->
						<template v-if="!browser.isBankCollapsed(group.bank)">
							<li
								v-for="p in group.patches"
								:key="`${p.bank}-${p.location}`"
								class="flex items-center gap-2 py-1.5 px-3 cursor-pointer hover:bg-neutral-700 transition-colors"
								@click="selectSynth(p)"
							>
								<span class="text-neutral-600 text-xs shrink-0 w-5">{{ p.location }}</span>
								<span class="text-xs text-neutral-200 truncate flex-1">{{ p.name }}</span>
							</li>
						</template>
					</template>
					<li v-if="(browser.view === 'patches' ? patchGroups : perfGroups).length === 0" class="p-4 text-center text-neutral-500 text-sm">
						{{ searchQuery ? 'No patches match' : 'No patches found' }}
					</li>
				</ul>
			</template>
		</template>
	</div>
</template>
