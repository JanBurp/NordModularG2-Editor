<template>
	<div class="h-full flex flex-col overflow-hidden" data-testid="library-pane">
		<!-- Folder header -->
		<div class="flex items-center gap-1 px-2 py-1.5 border-b border-line-subtle shrink-0 min-w-0">
			<button
				v-if="folder !== root"
				class="text-content-secondary hover:text-content-primary px-1 shrink-0 cursor-pointer"
				title="Up one folder"
				@click="up()"
				@mouseenter="showHint('browserUp')"
				@mouseleave="clearHint"
			>
				<Icon name="arrowUp" class="w-2.5 h-2.5" />
			</button>
			<span class="text-content-secondary truncate flex-1 min-w-0 font-medium" :title="folder">{{ folder.split('/').pop() }}</span>
			<button
				class="text-content-secondary hover:text-content-primary px-1 shrink-0 cursor-pointer"
				title="Choose blocks folder"
				@click="chooseFolder()"
				@mouseenter="showHint('browserChooseFolder')"
				@mouseleave="clearHint"
			>
				<Icon name="folder" class="w-3 h-3" />
			</button>
		</div>

		<div class="p-2 shrink-0">
			<SearchInput
				ref="searchRef"
				v-model="searchQuery"
				placeholder="Search blocks... (/)"
				:isActive="isActive"
				@enter="activate(filtered[selectedIndex])"
				@up="navigate(-1)"
				@down="navigate(1)"
			/>
		</div>

		<ul class="flex-1 overflow-y-auto list-none m-0 p-0">
			<template v-for="(item, i) in filtered" :key="item.path">
				<ListItem
					v-if="item.isDir"
					:data-nav-idx="i"
					:selected="i === selectedIndex"
					@click="enter(item.path)"
					@mouseenter="showHint('browserFolder')"
					@mouseleave="clearHint"
				>
					<template #icon><Icon name="folder" class="w-3 h-3 text-content-secondary" /></template>
					<template #label>{{ item.name }}</template>
				</ListItem>
				<li
					v-else
					:data-nav-idx="i"
					:data-testid="`library-block-${item.name}`"
					:class="['px-2 py-1 hover:bg-surface-2', i === selectedIndex ? 'bg-surface-3 ring-1 ring-inset ring-accent-primary' : '']"
					:draggable="!!item.block"
					:style="{ cursor: item.block ? 'grab' : 'default' }"
					@dragstart="(e) => onDragStart(e, item)"
					@dragend="ui.draggedBlock = null"
					@click="onClick(i, item)"
					@contextmenu.prevent="(e) => onContextMenu(e, item)"
					@mouseenter="showHint('libraryBlock')"
					@mouseleave="clearHint"
				>
					<div class="flex items-center gap-1 text-sm">
						<span class="truncate flex-1">{{ item.name }}</span>
						<span class="text-content-secondary text-xs">{{ item.block ? `${item.block.modules.length} modules` : 'unreadable' }}</span>
					</div>
					<BlockPreview v-if="item.block && item.block.modules.length > 0" :block="item.block" class="mt-1" />
				</li>
			</template>
			<StateMessage
				v-if="filtered.length === 0"
				variant="empty"
				:message="searchQuery ? 'No blocks match' : 'No blocks yet — select modules, right-click one and choose Save Selection as Block'"
			/>
		</ul>
	</div>
</template>

<script setup lang="ts">
	import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
	import Icon from '../common/Icon.vue';
	import SearchInput from '../common/SearchInput.vue';
	import ListItem from '../browser/ListItem.vue';
	import StateMessage from '../browser/StateMessage.vue';
	import BlockPreview from './BlockPreview.vue';
	import { useUiStore } from '@/store/ui';
	import { useBlockLibrary, type BlockItem } from '../../composables/useBlockLibrary';
	import { insertEntry } from '../../composables/usePatchClipboard';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { useListNav } from '../../composables/useListNav';
	import { useStatusHint } from '../../composables/useStatusHint';
	import { createDoubleClickDetector } from '../../utils/doubleClick';

	const props = defineProps<{ isActive: boolean }>();

	const ui = useUiStore();
	const { root, folder, items, init, refresh, chooseFolder, enter, up, remove } = useBlockLibrary();
	const { open: openContextMenu } = useContextMenu();
	const { showHint, clearHint } = useStatusHint();
	const searchRef = ref();
	const searchQuery = ref('');

	defineExpose({ focusSearch: () => searchRef.value?.focus() });

	const filtered = computed(() => {
		const q = searchQuery.value.toLowerCase();
		return q ? items.value.filter((i) => i.name.toLowerCase().includes(q)) : items.value;
	});
	const { selectedIndex, navigate, reset } = useListNav(() => filtered.value.length);
	watch([searchQuery, folder], reset);

	// Listed when the tab opens; re-read each time, as files may have changed on disk in between.
	watch(
		() => props.isActive,
		(active) => active && init(),
		{ immediate: true },
	);

	function insert(item: BlockItem): void {
		if (item.block) insertEntry(item.block).catch(console.error);
	}

	function activate(item: BlockItem | undefined): void {
		if (item?.isDir) enter(item.path);
		else if (item) insert(item);
	}

	const isDoubleClick = createDoubleClickDetector();
	function onClick(i: number, item: BlockItem): void {
		selectedIndex.value = i;
		if (isDoubleClick(item.path)) insert(item);
	}

	function onDragStart(e: DragEvent, item: BlockItem): void {
		e.dataTransfer?.setData('text/plain', item.path);
		ui.draggedBlock = item.block ?? null;
	}

	function onContextMenu(e: MouseEvent, item: BlockItem): void {
		openContextMenu(e, [
			{ label: 'Add to Patch', disabled: !item.block, action: () => insert(item) },
			{ label: 'Show in Folder', action: () => window.electronAPI.patches.reveal(item.path) },
			{ type: 'separator' },
			{ label: 'Move to Trash', action: () => remove(item).catch(console.error) },
		]);
	}

	// Catches blocks added or removed in another window or in the Finder.
	const onFocus = () => props.isActive && refresh();
	onMounted(() => window.addEventListener('focus', onFocus));
	onUnmounted(() => window.removeEventListener('focus', onFocus));
</script>
