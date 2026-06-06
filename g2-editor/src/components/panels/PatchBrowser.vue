<template>
	<div class="h-full flex flex-col overflow-hidden">
		<!-- Tab switcher -->
		<BtnGroup :options="viewOptions" :model-value="browser.view" variant="tab" @update:model-value="onViewChange" class="mb-2" />

		<!-- ── DISK VIEW ─────────────────────────────────────── -->
		<template v-if="browser.view === 'disk'">
			<!-- Folder header -->
			<div class="flex items-center gap-1 px-2 py-1.5 border-b border-neutral-700 shrink-0 min-w-0">
				<button
					v-if="diskParentName"
					class="text-neutral-400 hover:text-white px-1 shrink-0 cursor-pointer"
					:title="`Up to ${diskParentName}`"
					@click="browser.navigateUp()"
				>
					↑
				</button>
				<span class="text-neutral-300 truncate flex-1 min-w-0 font-medium">
					{{ diskFolderName || 'No folder selected' }}
				</span>
				<button class="text-neutral-400 hover:text-white px-1 shrink-0 cursor-pointer" title="Choose folder" @click="browser.chooseDiskFolder()">…</button>
			</div>

			<template v-if="browser.diskFolder">
				<div class="px-2 pt-2 shrink-0">
					<SearchInput v-model="searchQuery" placeholder="Search files..." :isActive="isActive && browser.view === 'disk'" @enter="handleEnter" />
				</div>

				<StateMessage v-if="browser.loading" variant="loading" message="Loading..." />
				<StateMessage v-else-if="browser.error" variant="error" :message="browser.error" />
				<ul v-else class="flex-1 overflow-y-auto list-none m-0 p-0">
					<ListItem
						v-for="entry in filteredDiskDirs"
						:key="entry.path"
						@click="selectDisk(entry)"
					>
						<template #icon><span class="text-neutral-400">▶</span></template>
						<template #label>{{ entry.name }}</template>
					</ListItem>
					<ListItem
						v-for="entry in filteredDiskFiles"
						:key="entry.path"
						@click="selectDisk(entry)"
					>
						<template #icon><span /></template>
						<template #label>{{ formatFileName(entry) }}</template>
						<template #meta><span class="text-neutral-600">{{ entry.name.split('.').pop() }}</span></template>
					</ListItem>
					<StateMessage
						v-if="filteredDiskDirs.length === 0 && filteredDiskFiles.length === 0"
						variant="empty"
						:message="searchQuery ? 'No files match' : 'Empty folder'"
					/>
				</ul>
			</template>
			<StateMessage v-else variant="empty" message="Click … to choose a folder" />
		</template>

		<!-- ── SYNTH PATCHES / PERFORMANCES ──────────────────── -->
		<template v-else>
			<StateMessage v-if="!device.connected" variant="empty" message="Connect G2 to browse synth patches" />
			<template v-else>
				<div class="px-2 pt-2 shrink-0">
					<SearchInput v-model="searchQuery" placeholder="Search..." :isActive="isActive" @enter="handleEnter" />
				</div>

				<StateMessage v-if="browser.loading" variant="loading" message="Loading from G2..." />
				<StateMessage v-else-if="browser.error" variant="error" :message="browser.error" />
				<ul v-else class="flex-1 overflow-y-auto list-none m-0 p-0">
					<!-- Patches grouped by bank -->
					<template v-for="group in browser.view === 'patches' ? patchGroups : perfGroups" :key="group.bank">
						<!-- Bank header (collapsible) -->
						<li
							class="flex items-center gap-2 px-3 py-1 bg-neutral-800 cursor-pointer select-none border-b border-neutral-700 sticky top-0 z-10"
							@click="browser.toggleBank(group.bank)"
						>
							<span class="text-neutral-500 w-3">
								{{ browser.isBankCollapsed(group.bank) ? '▶' : '▼' }}
							</span>
							<span class="text-neutral-400 font-medium">Bank {{ group.bank }}</span>
							<span class="text-neutral-600 ml-auto">{{ group.patches.length }}</span>
						</li>
						<!-- Patch entries -->
						<template v-if="!browser.isBankCollapsed(group.bank)">
							<ListItem
								v-for="p in group.patches"
								:key="`${p.bank}-${p.location}`"
								@click="selectSynth(p, browser.view === 'performances' ? 'performance' : 'patch')"
							>
								<template #icon><span class="text-neutral-600">{{ p.location }}</span></template>
								<template #label>{{ p.name }}</template>
							</ListItem>
						</template>
					</template>
					<StateMessage
						v-if="(browser.view === 'patches' ? patchGroups : perfGroups).length === 0"
						variant="empty"
						:message="searchQuery ? 'No patches match' : 'No patches found'"
					/>
				</ul>
			</template>
		</template>
	</div>
</template>

<script setup lang="ts">
	import { ref, computed } from 'vue';
	import { useBrowserStore, type SynthPatch, type DiskEntry } from '../../store/browser';
	import { useDeviceStore } from '../../store/device';
	import { useSettingsStore } from '@/store/settings';
	import BtnGroup from '../toolbar/BtnGroup.vue';
	import SearchInput from '../common/SearchInput.vue';
	import StateMessage from '../browser/StateMessage.vue';
	import ListItem from '../browser/ListItem.vue';

	defineProps<{
		isActive: boolean;
	}>();

	const emit = defineEmits<{
		select: [item: { type: 'disk'; filepath: string; kind?: 'patch' | 'performance' } | { type: 'synth'; bank: number; location: number; kind?: 'patch' | 'performance' }];
	}>();

	const browser = useBrowserStore();
	const device = useDeviceStore();
	const settings = useSettingsStore();

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
		if (v === 'disk' && !browser.diskFolder && settings.path) {
			await browser.loadDiskList(settings.path);
		}
	}

	function selectDisk(entry: DiskEntry) {
		if (entry.isDir) {
			browser.loadDiskList(entry.path);
		} else {
			const kind = entry.name.toLowerCase().endsWith('.prf2') ? 'performance' : 'patch';
			emit('select', { type: 'disk', filepath: entry.path, kind });
		}
	}

	function selectSynth(p: SynthPatch, kind?: 'patch' | 'performance') {
		emit('select', { type: 'synth', bank: p.bank, location: p.location, kind });
	}

	function handleEnter() {
		if (browser.view === 'disk' && filteredDiskFiles.value.length > 0) {
			const entry = filteredDiskFiles.value[0];
			const kind = entry.name.toLowerCase().endsWith('.prf2') ? 'performance' : 'patch';
			emit('select', { type: 'disk', filepath: entry.path, kind });
		} else if (browser.view === 'patches' && filteredPatches.value.length > 0) {
			selectSynth(filteredPatches.value[0], 'patch');
		} else if (browser.view === 'performances' && filteredPerformances.value.length > 0) {
			selectSynth(filteredPerformances.value[0], 'performance');
		}
	}

	function formatFileName(entry: DiskEntry): string {
		return entry.isDir ? entry.name : entry.name.replace(/\.(pch2|prf2)$/i, '');
	}
</script>
