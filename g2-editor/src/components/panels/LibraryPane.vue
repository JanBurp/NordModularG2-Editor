<template>
	<!-- Canvas modules dragged onto the pane are saved to the library (see useModuleDrag's data-library-drop) -->
	<div
		:class="['h-full flex flex-col overflow-hidden bg-surface-0', ui.draggingModules && dropHover ? 'ring-2 ring-inset ring-accent-primary' : '']"
		data-testid="library-pane"
		data-library-drop
		@mouseenter="dropHover = true"
		@mouseleave="dropHover = false"
	>
		<div class="px-2 pt-2 pb-1 shrink-0">
			<div class="flex items-center gap-1 mb-1">
				<SearchInput
					ref="searchRef"
					v-model="searchQuery"
					:isActive="isActive"
					placeholder="Search library... (/)"
					class="flex-1 min-w-0"
					data-testid="library-search"
					@up="navigate(-1)"
					@down="navigate(1)"
					@enter="handleEnter"
				/>
				<button
					:class="[
						'shrink-0 px-1 cursor-pointer',
						settings.libraryFavoritesOnly ? 'text-amber-300' : 'text-content-secondary hover:text-content-primary',
					]"
					:title="settings.libraryFavoritesOnly ? 'Show All Items' : 'Show Favorites Only'"
					data-testid="library-favorites-only"
					@click="settings.libraryFavoritesOnly = !settings.libraryFavoritesOnly"
					@mouseenter="showHint('libraryFavoritesOnly')"
					@mouseleave="clearHint"
				>
					<Icon name="star" :class="['w-3 h-3', settings.libraryFavoritesOnly && 'fill-current']" />
				</button>
				<button
					class="shrink-0 text-content-secondary hover:text-content-primary px-1 cursor-pointer"
					:title="allExpanded ? 'Collapse All' : 'Expand All'"
					@click="toggleAllGroups"
					@mouseenter="showHint('expandCollapseAll')"
					@mouseleave="clearHint"
				>
					<Icon :name="allExpanded ? 'chevronDown' : 'chevronRight'" class="w-2.5 h-2.5" />
				</button>
			</div>
			<div data-testid="library-count" class="text-content-muted py-0.5 px-1 text-xs">{{ filtered.length }} items</div>
		</div>
		<div class="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2" data-library-scroll>
			<!-- Filtered with v-show: typing in the search mustn't unmount and remount the previews -->
			<div v-for="group in allGroups" v-show="filteredByGroup.has(group)" :key="group" class="mb-2">
				<div
					class="flex items-center gap-2 py-2 px-1 cursor-pointer text-xs font-semibold text-content-secondary border-b border-line-subtle hover:text-content-primary"
					@click="toggleGroup(group)"
					@mouseenter="showHint('expandCollapse')"
					@mouseleave="clearHint"
				>
					<span class="w-3 text-content-muted"><Icon :name="isExpanded(group) ? 'chevronDown' : 'chevronRight'" class="w-2.5 h-2.5" /></span>
					{{ groupLabel(group) }}
					<span class="font-normal text-content-muted text-xs">({{ itemsOf(group).length }})</span>
				</div>

				<div v-if="isExpanded(group)" class="flex flex-col gap-2 py-2">
					<template v-for="item in itemsByGroup.get(group)" :key="item.path">
						<div
							v-show="shownPaths.has(item.path)"
							:class="['w-64 bg-surface-3 shadow', item.path === selectedNavPath ? 'ring-2 ring-amber-300' : '']"
							:style="{ cursor: item.entry ? 'grab' : 'default' }"
							:data-testid="`library-item-${item.name}`"
							:data-library-path="item.path"
							:draggable="!!item.entry"
							@dragstart="(e) => onDragStart(e, item)"
							@dragend="ui.draggedLibraryItem = null"
							@click="onClick(item)"
							@contextmenu.prevent="(e) => onContextMenu(e, item)"
							@mouseenter="showHint('libraryItem')"
							@mouseleave="clearHint"
						>
							<div class="flex items-center gap-1 px-1 py-0.5 text-xs">
								<span class="truncate flex-1 font-semibold"
									>{{ item.name
									}}<span v-if="item.entry?.notes.author" class="font-normal text-content-secondary">
										(<span
											class="cursor-pointer hover:text-accent-primary"
											title="Search for this author"
											data-testid="library-item-author"
											@click.stop="searchQuery = item.entry.notes.author"
											>{{ item.entry.notes.author }}</span
										>)</span
									></span
								>
								<span v-if="!item.entry" class="text-content-secondary">unreadable</span>
								<button
									:class="['shrink-0 cursor-pointer', isFavorite(item) ? 'text-amber-300' : 'text-content-muted hover:text-content-primary']"
									:title="isFavorite(item) ? 'Remove from Favorites' : 'Add to Favorites'"
									data-testid="library-favorite"
									@click.stop="toggleFavorite(item)"
									@mouseenter="showHint('libraryFavorite')"
									@mouseleave="showHint('libraryItem')"
								>
									<Icon name="star" :class="['w-3 h-3', isFavorite(item) && 'fill-current']" />
								</button>
							</div>
							<div
								v-if="item.entry && item.entry.modules.length > 0"
								class="overflow-hidden"
								:style="{ maxHeight: item.path === notesItem?.path ? 'none' : `${PREVIEW_MAX_HEIGHT}px` }"
								data-testid="library-preview"
							>
								<LibraryPreview :entry="item.entry" />
							</div>
						</div>
						<div v-if="item.path === notesItem?.path" class="relative w-64 bg-surface-1 rounded p-3 text-xs text-content-secondary">
							<template v-if="item.entry">
								<div class="pr-3" data-testid="library-modules">
									<span class="text-content-muted">Modules:</span> {{ item.entry.modules.length }}
								</div>
								<!-- Not v-show: over the constant NOTE_FIELDS that compiles to a stable fragment, so the rows never updated after an edit -->
								<div v-for="key in NOTE_FIELDS.filter((k) => item.entry!.notes[k])" :key="key" class="break-words pr-3">
									<span class="text-content-muted capitalize">{{ key }}:</span>
									<span
										v-if="key === 'author'"
										class="cursor-pointer hover:text-accent-primary"
										title="Search for this author"
										@click="searchQuery = item.entry.notes.author"
										>{{ item.entry.notes.author }}</span
									>
									<span
										v-else-if="key === 'source' && isUrl(item.entry.notes.source)"
										class="cursor-pointer hover:text-accent-primary"
										title="Open in browser"
										data-testid="library-source-link"
										@click="openExternal(item.entry.notes.source)"
										>{{ item.entry.notes.source }}</span
									>
									<template v-else>{{ item.entry.notes[key] }}</template>
								</div>
								<div v-if="item.entry.notes.tags.length" class="flex flex-wrap gap-1 my-2 pr-3" data-testid="library-tags">
									<span
										v-for="tag in item.entry.notes.tags"
										:key="tag"
										class="px-1.5 rounded bg-surface-3 text-content-primary cursor-pointer hover:text-accent-primary"
										title="Search for this tag"
										@click="searchQuery = tag"
										>{{ tag }}</span
									>
								</div>
							</template>
							<div class="whitespace-pre-wrap break-words pr-3 mt-1" data-testid="library-notes">{{ item.entry?.notes.body || 'No notes.' }}</div>
							<button
								v-if="item.entry"
								class="absolute top-1.5 right-1.5 p-0.5 text-content-secondary hover:text-content-primary cursor-pointer"
								title="Edit group, name and notes"
								data-testid="library-edit"
								@click="openEditDialog(item)"
							>
								<Icon name="pencil" class="w-3 h-3" />
							</button>
						</div>
					</template>
				</div>
			</div>
			<StateMessage
				v-if="filtered.length === 0"
				variant="empty"
				:message="
					settings.libraryFavoritesOnly && !searchQuery
						? 'No favorites'
						: searchQuery
							? 'Nothing matches'
							: 'Empty — drag modules here, or right-click one and choose Save Selection to Library'
				"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
	import Icon from '../common/Icon.vue';
	import SearchInput from '../common/SearchInput.vue';
	import StateMessage from '../browser/StateMessage.vue';
	import LibraryPreview from './LibraryPreview.vue';
	import { useUiStore } from '@/store/ui';
	import { useSettingsStore } from '@/store/settings';
	import { groupLabel, isFavorite, useLibrary, type LibraryItem } from '../../composables/useLibrary';
	import { useContextMenu } from '../../composables/useContextMenu';
	import { useListNav } from '../../composables/useListNav';
	import { useStatusHint } from '../../composables/useStatusHint';
	import { parseGroupQuery } from '../../renderer/moduleSearch';
	import { MODULE_ROW_HEIGHT } from '@/constants';

	const props = defineProps<{ isActive: boolean }>();

	// Previews show at most 8.5 module rows; the item showing its notes shows all of it.
	const PREVIEW_MAX_HEIGHT = 8.5 * MODULE_ROW_HEIGHT;
	const NOTE_FIELDS = ['author', 'license', 'source'] as const;

	const ui = useUiStore();
	const settings = useSettingsStore();
	const { items, lastSaved, init, refresh, remove, toggleFavorite, openEditDialog, insertItem } = useLibrary();
	const { open: openContextMenu } = useContextMenu();
	const { showHint, clearHint } = useStatusHint();
	const searchRef = ref();
	const searchQuery = ref('');
	const collapsedGroups = ref<string[]>([]);
	const selectedPath = ref<string | null>(null);
	const dropHover = ref(false);

	defineExpose({ focusSearch: () => searchRef.value?.focus() });

	// Same search as the Modules pane: "<group> <term>" picks the groups (folders) first, then filters within them.
	// The term matches an item's name or notes. Groups: the subfolders, the library folder's own items ('Saved') first.
	// A query that is exactly an item's author or one of its tags also matches it, so multi-word ones (clicked) work.
	// With 'favorites only' on, only the favorites are searched.
	const filtered = computed(() => {
		const { group, term } = parseGroupQuery(searchQuery.value);
		const exact = searchQuery.value.trim().toLowerCase();
		return items.value.filter(
			(i) =>
				(!settings.libraryFavoritesOnly || isFavorite(i)) &&
				(!!i.entry?.notes.tags.includes(exact) ||
					i.entry?.notes.author.toLowerCase() === exact ||
					((group === null || groupLabel(i.group).toLowerCase().includes(group)) &&
						(!term || i.name.toLowerCase().includes(term) || !!i.entry?.text.toLowerCase().includes(term)))),
		);
	});
	function byGroup(list: LibraryItem[]): Map<string, LibraryItem[]> {
		const map = new Map<string, LibraryItem[]>();
		for (const i of list) map.set(i.group, [...(map.get(i.group) ?? []), i]);
		return map;
	}
	const filteredByGroup = computed(() => byGroup(filtered.value));
	const shownPaths = computed(() => new Set(filtered.value.map((i) => i.path)));
	const itemsByGroup = computed(() => byGroup(items.value));
	const allGroups = computed(() => [...itemsByGroup.value.keys()].sort());
	const groups = computed(() => allGroups.value.filter((g) => filteredByGroup.value.has(g)));
	const itemsOf = (group: string) => filteredByGroup.value.get(group) ?? [];

	// While searching every matching group is open; the collapsed ones close again afterwards.
	const isExpanded = (group: string) => !!searchQuery.value || !collapsedGroups.value.includes(group);
	const allExpanded = computed(() => groups.value.every(isExpanded));
	function toggleGroup(group: string) {
		const i = collapsedGroups.value.indexOf(group);
		if (i >= 0) collapsedGroups.value.splice(i, 1);
		else collapsedGroups.value.push(group);
	}
	function toggleAllGroups() {
		collapsedGroups.value = allExpanded.value ? [...groups.value] : [];
	}

	const flatNavItems = computed(() => groups.value.filter(isExpanded).flatMap(itemsOf));
	const { selectedIndex: selectedNavIndex, navigate: navStep, reset: resetNavIndex } = useListNav(() => flatNavItems.value.length);
	const selectedNavPath = computed(() => flatNavItems.value[selectedNavIndex.value]?.path ?? null);

	// Notes like a module's help: of the clicked item, or of the only search match.
	const notesItem = computed(
		() => items.value.find((i) => i.path === selectedPath.value) ?? (searchQuery.value && filtered.value.length === 1 ? filtered.value[0] : null),
	);

	// Show the item just saved: search "<first word of its group> <name>" (a name may contain spaces), and show its notes:
	// selected, as the search may match other items too (by their notes). After the search's watcher has unselected.
	watch(lastSaved, async (saved) => {
		if (!saved) return;
		searchQuery.value = `${groupLabel(saved.group).split(' ')[0]} ${saved.name}`;
		await nextTick();
		selectedPath.value = saved.path;
	});

	watch(searchQuery, () => {
		selectedPath.value = null;
		resetNavIndex();
	});

	// Listed when the tab opens; re-read each time, as files may have changed on disk in between.
	watch(
		() => props.isActive,
		(active) => active && init(),
		{ immediate: true },
	);

	// A source that's a web address opens in the browser (the main process opens https only).
	const isUrl = (s: string) => /^https:\/\/\S+$/.test(s.trim());
	const openExternal = (url: string) => window.electronAPI.openExternal(url.trim());

	function insert(item: LibraryItem | undefined): void {
		if (item?.entry) insertItem(item.entry).catch(console.error);
	}

	function navigate(direction: 1 | -1) {
		navStep(direction);
		const item = flatNavItems.value[selectedNavIndex.value];
		if (!item) return;
		requestAnimationFrame(() => {
			const el = [...document.querySelectorAll('[data-library-path]')].find((e) => e.getAttribute('data-library-path') === item.path);
			el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});
	}

	function handleEnter() {
		insert(flatNavItems.value[selectedNavIndex.value]);
	}

	function onClick(item: LibraryItem) {
		selectedPath.value = selectedPath.value === item.path ? null : item.path;
	}

	function onDragStart(e: DragEvent, item: LibraryItem): void {
		e.dataTransfer?.setData('text/plain', item.path);
		ui.draggedLibraryItem = item.entry ?? null;
	}

	function onContextMenu(e: MouseEvent, item: LibraryItem): void {
		openContextMenu(e, [
			{ label: 'Add to Patch', disabled: !item.entry, action: () => insert(item) },
			{ label: 'Edit…', disabled: !item.entry, action: () => openEditDialog(item) },
			{ label: 'Show in Folder', action: () => window.electronAPI.patches.reveal(item.path) },
			{ type: 'separator' },
			{ label: 'Move to Trash', action: () => remove(item).catch(console.error) },
		]);
	}

	// Catches items added or removed in another window or in the Finder.
	const onFocus = () => props.isActive && refresh();
	onMounted(() => window.addEventListener('focus', onFocus));
	onUnmounted(() => window.removeEventListener('focus', onFocus));
</script>
