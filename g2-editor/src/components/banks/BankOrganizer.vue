<template>
	<div class="flex flex-col flex-1 min-h-0 bg-surface-1" data-testid="bank-organizer">
		<!-- Slots left · Patches/Performances centred · Trash and close right -->
		<div class="relative flex items-end gap-3 px-3 py-2 border-b border-line-subtle text-xs text-content-primary">
			<div class="flex flex-col gap-1.5 shrink-0">
				<!-- bracket from the centre of the first box to the centre of the last (half a box = 56 px) -->
				<BracketLabel title="Slots" class="px-14" />
				<div class="flex gap-1">
					<OrganizerBox
						v-for="slot in slotIndices"
						:key="slot"
						:label="slot === 4 ? 'Perf' : SLOT_LABELS[slot]"
						:name="org.slotName(slot) || '—'"
						:dimmed="!slotEnabled(slot)"
						:highlighted="dropSlot === slot"
						:draggable="slotDraggable(slot)"
						:data-testid="`organizer-slot-${slot}`"
						@dragstart="org.start($event, { type: 'slot', slot })"
						@dragend="org.end()"
						@dragover="onSlotDragOver($event, slot)"
						@dragleave="dropSlot = null"
						@drop.prevent="onSlotDrop(slot)"
						@contextmenu.prevent="onSlotContextMenu($event, slot)"
						@mouseenter="showHint('organizerSlot')"
						@mouseleave="clearHint()"
					/>
				</div>
			</div>

			<div class="flex-1 flex justify-center self-center">
				<BtnGroup :model-value="uiStore.organizerKind" :options="kindOptions" variant="toggle" @update:model-value="(v) => setKind(v as BankKind)" />
			</div>

			<!-- close pinned to the top-right corner; Trash under it, in line with the slot boxes -->
			<Button
				variant="default"
				size="xs"
				class="absolute! top-1 right-3 w-5 h-5! px-0!"
				title="Close"
				hint="organizerClose"
				@click="uiStore.showBankOrganizer = false"
			>
				<Icon name="close" class="w-2.5 h-2.5" />
			</Button>
			<!-- Trash: drop a location or storage item (or the selection it belongs to) here; asks for confirmation -->
			<OrganizerBox
				label=""
				name=""
				danger
				:highlighted="dropTrash"
				data-testid="organizer-trash"
				@dragover="onTrashDragOver"
				@dragleave="dropTrash = false"
				@drop.prevent="onTrashDrop"
				@mouseenter="showHint('organizerTrash')"
				@mouseleave="clearHint()"
			>
				<span class="flex items-center gap-1.5"><Icon name="trash" class="w-3.5 h-3.5" />Trash</span>
			</OrganizerBox>
		</div>

		<!-- Temporary Storage: full width, one row of places; a new row appears once all are used. -->
		<div class="flex flex-col gap-1.5 px-3 py-2 border-b border-line-subtle text-xs text-content-primary">
			<!-- bracket over the places of one row, centre of the first to centre of the last -->
			<BracketLabel title="Temporary Storage" class="px-14" :style="{ width: `${storageCols * 116 - 4}px` }" />
			<div
				ref="storageRef"
				class="flex flex-wrap content-start gap-1 min-w-0 max-h-32 overflow-y-auto rounded-xs"
				:class="{ 'outline-2 outline-input': dropStorage }"
				data-testid="organizer-storage"
				@dragover="onStorageDragOver"
				@dragleave="dropStorage = false"
				@drop.prevent="onStorageDrop"
			>
				<OrganizerBox
					v-for="item in storageItems"
					:key="item.file"
					:label="item.kind === 'performance' ? 'Perf' : getCategoryNameFromSlug(item.category) || 'No Cat'"
					:name="item.name || 'Untitled'"
					:tint="categoryTint(item.category)"
					:selected="org.isSelected(asStorage(item))"
					:cursor="org.isCursor(asStorage(item))"
					draggable="true"
					data-testid="storage-item"
					@click="(e: MouseEvent) => org.select(asStorage(item), clickMode(e), STORAGE_AREA)"
					@contextmenu.prevent="onStorageContextMenu($event, item)"
					@dragstart="org.startItem($event, asStorage(item), STORAGE_AREA)"
					@dragend="org.end()"
					@mouseenter="showHint('organizerStorage')"
					@mouseleave="clearHint()"
				/>
				<OrganizerBox v-for="i in emptyPlaces" :key="`empty-${i}`" label="" name="" empty />
			</div>
		</div>

		<div class="flex flex-1 min-h-0 gap-3 p-3">
			<BankGrid
				v-for="(side, i) in SIDES"
				:key="side"
				:side="side"
				:kind="uiStore.organizerKind"
				:bank="uiStore.organizerBanks[i]"
				:sort="settings.organizerSortModes[i]"
				:same-bank="uiStore.organizerBanks[0] === uiStore.organizerBanks[1]"
				@update:bank="(b) => (uiStore.organizerBanks[i] = b)"
				@update:sort="(s) => (settings.organizerSortModes[i] = s)"
			/>
		</div>

		<Dialog v-model="roomOpen" title="Not enough room" :show-cancel="false">
			<p class="text-sm text-content-primary">{{ roomText }}</p>
		</Dialog>

		<!-- Several patches take a while (two flash operations each): show how far it is -->
		<Dialog :model-value="progressOpen" :title="progressTitle" :show-confirm="false" :show-cancel="false" prevent-close>
			<ProgressBar
				v-if="browser.organizerProgress"
				:text="`${browser.organizerProgress.done + 1} of ${browser.organizerProgress.total}`"
				:value="browser.organizerProgress.done"
				:max="browser.organizerProgress.total"
				:detail="browser.organizerProgress.name"
			/>
		</Dialog>

		<Dialog v-model="clearOpen" :title="clearText.title" confirm-label="Delete" @confirm="org.confirmClear()">
			<p class="text-sm text-content-primary mb-2">{{ clearText.body }}</p>
			<p v-for="line in clearText.lines" :key="line" class="text-xs text-content-secondary font-mono">{{ line }}</p>
		</Dialog>
	</div>
</template>

<script setup lang="ts">
	import { computed, onMounted, onUnmounted, ref } from 'vue';
	import BankGrid from './BankGrid.vue';
	import BtnGroup from '../toolbar/BtnGroup.vue';
	import Button from '../toolbar/Button.vue';
	import Icon from '../common/Icon.vue';
	import OrganizerBox from './OrganizerBox.vue';
	import BracketLabel from '../panels/BracketLabel.vue';
	import Dialog from '../common/Dialog.vue';
	import ProgressBar from '../common/ProgressBar.vue';
	import { SLOT_LABELS } from '@/constants';
	import { useBrowserStore, type BankKind, type StorageItem } from '@/store/browser';
	import { useDeviceStore, DeviceStatus } from '@/store/device';
	import { useSettingsStore } from '@/store/settings';
	import { useUiStore } from '@/store/ui';
	import { useStatusHint } from '@/composables/useStatusHint';
	import { useContextMenu } from '@/composables/useContextMenu';
	import { asStorage, clickMode, useOrganizer } from './useOrganizer';
	import { getCategoryNameFromSlug } from '@/constants/categories';
	import { categoryTint } from './categoryTint';
	import type { ContextMenuItem } from '@/types';

	const SIDES = ['left', 'right'] as const;
	const STORAGE_AREA = 'storage';
	const slotIndices = [0, 1, 2, 3, 4];
	const kindOptions = [
		{ label: 'Patches', value: 'patch' },
		{ label: 'Performances', value: 'performance' },
	];

	const browser = useBrowserStore();
	const device = useDeviceStore();
	const settings = useSettingsStore();
	const uiStore = useUiStore();
	const org = useOrganizer();
	const { showHint, clearHint } = useStatusHint();
	const { open: openContextMenu } = useContextMenu();

	const dropSlot = ref<number | null>(null);
	const dropStorage = ref(false);
	const dropTrash = ref(false);

	const clearOpen = computed({
		get: () => org.clearRequest.value !== null,
		set: (open) => {
			if (!open) org.clearRequest.value = null;
		},
	});
	// Bank locations and storage items are never mixed in one request (see useOrganizer's select).
	const clearText = computed(() => {
		const list = org.clearRequest.value ?? [];
		const n = list.length;
		const storage = list[0]?.type === 'storage';
		const names = list.map((s) =>
			s.type === 'cell' ? `${s.loc.bank}-${s.loc.location}  ${browser.entryAt(s.loc)?.name ?? ''}` : s.item.name || 'Untitled',
		);
		// Up to 8 named, then a count of the rest.
		const lines = names.slice(0, 8);
		if (n > 8) lines.push(`… and ${n - 8} more`);
		return storage
			? {
					title: n === 1 ? 'Delete from Temporary Storage' : `Delete ${n} from Temporary Storage`,
					body: 'This deletes the copies on this computer and cannot be undone:',
					lines,
				}
			: { title: n === 1 ? 'Delete location' : `Delete ${n} locations`, body: "This deletes from the G2's memory and cannot be undone:", lines };
	});

	const storageItems = computed(() => browser.storage.filter((h) => h.kind === uiStore.organizerKind));

	const roomOpen = computed({
		get: () => org.roomWarning.value !== null,
		set: (open) => {
			if (!open) org.roomWarning.value = null;
		},
	});
	const roomText = computed(() => {
		const w = org.roomWarning.value;
		if (!w) return '';
		const where = w.from === 1 ? `Bank ${w.bank}` : `Bank ${w.bank} from ${w.bank}-${w.from} to ${w.bank}-128`;
		return `${w.needed} patches don't fit: ${where} has ${w.free} free location${w.free === 1 ? '' : 's'}. Nothing was moved or copied.`;
	});

	// Only for operations on more than one patch; single ones are quick enough to show as busy cells.
	const progressOpen = computed(() => (browser.organizerProgress?.total ?? 0) > 1);
	const progressTitle = computed(() => {
		const p = browser.organizerProgress;
		return p ? `${p.verb} ${p.total} patches…` : '';
	});

	// Places per row, from the storage area's width (box w-28 = 112 px + gap-1 = 4 px).
	const storageRef = ref<HTMLElement>();
	const storageCols = ref(1);
	const resizeObserver = new ResizeObserver(([entry]) => {
		storageCols.value = Math.max(1, Math.floor((entry.contentRect.width + 4) / 116));
	});
	// Always at least one free place: when every place is used, a new row of empty ones appears.
	onUnmounted(org.registerArea({ id: STORAGE_AREA, items: () => storageItems.value.map(asStorage), cols: () => storageCols.value }));
	const emptyPlaces = computed(() => {
		const rows = Math.floor(storageItems.value.length / storageCols.value) + 1;
		return rows * storageCols.value - storageItems.value.length;
	});

	function setKind(kind: BankKind) {
		uiStore.organizerKind = kind;
		// Performance banks only go up to 8.
		if (kind === 'performance') uiStore.organizerBanks = uiStore.organizerBanks.map((b) => Math.min(b, 8)) as [number, number];
	}

	// Patch slots A-D for patch banks, the Perf slot for performance banks.
	const slotEnabled = (slot: number) => (slot === 4) === (uiStore.organizerKind === 'performance');
	// Storing a performance needs Performance mode, same rule as the Patch Browser's Store.
	const slotDraggable = (slot: number) =>
		slotEnabled(slot) && device.status === DeviceStatus.Connected && (slot < 4 || device.device?.mode === 'Performance');

	// "… Bank n (at n-17)" entries for the banks shown left and right, into their first empty location.
	function toBankItems(verb: string, disabled: boolean, act: (dst: NonNullable<ReturnType<typeof org.firstEmpty>>) => void): ContextMenuItem[] {
		return [...new Set(uiStore.organizerBanks)].map((bank) => {
			const dst = org.firstEmpty(uiStore.organizerKind, bank);
			return {
				label: dst ? `${verb} Bank ${bank} (at ${bank}-${dst.location})` : `${verb} Bank ${bank} (full)`,
				disabled: disabled || !dst,
				action: () => dst && act(dst),
			};
		});
	}

	function onSlotContextMenu(e: MouseEvent, slot: number) {
		if (!slotEnabled(slot)) return;
		openContextMenu(
			e,
			toBankItems('Store in', !slotDraggable(slot), (dst) => browser.storeSlotAt(org.storeSlot(slot), dst, org.slotName(slot))),
		);
	}

	// Acts on the whole selection when the item is part of it (else selects just this item).
	function onStorageContextMenu(e: MouseEvent, item: StorageItem) {
		const self = asStorage(item);
		if (!org.isSelected(self)) org.select(self, 'single', STORAGE_AREA);
		const targets = org.targetsFor(self);
		const multi = targets.length > 1;
		openContextMenu(e, [
			...(multi
				? [...new Set(uiStore.organizerBanks)].map((bank) => ({
						label: `Copy ${targets.length} to Bank ${bank}`,
						action: () => org.placeInto(targets, uiStore.organizerKind, bank, 1, false),
					}))
				: toBankItems('Copy to', false, (dst) => browser.fromStorage(item, dst))),
			{ type: 'separator' },
			{ label: targets.length > 1 ? `Delete ${targets.length}…` : 'Delete…', action: () => org.requestClear(targets) },
		]);
	}

	function onSlotDragOver(e: DragEvent, slot: number) {
		org.over(e, (src) => src.type === 'cell' && slotEnabled(slot));
		if (e.defaultPrevented) dropSlot.value = slot;
	}

	function onSlotDrop(slot: number) {
		dropSlot.value = null;
		org.dropOnSlot(slot);
	}

	function onStorageDragOver(e: DragEvent) {
		org.over(e, (src) => src.type === 'cell' || (src.type === 'many' && src.items[0].type === 'cell'));
		if (e.defaultPrevented) dropStorage.value = true;
	}

	function onStorageDrop() {
		dropStorage.value = false;
		org.dropOnStorage();
	}

	function onTrashDragOver(e: DragEvent) {
		org.over(e, (src) => src.type !== 'slot');
		if (e.defaultPrevented) dropTrash.value = true;
	}

	function onTrashDrop() {
		dropTrash.value = false;
		org.dropOnTrash();
	}

	// Delete/Backspace: delete the selection (after confirming). Escape: drop the selection, else close.
	// Cmd/Ctrl-A: select all filled items of the last clicked area. Arrows move the cursor; Shift extends.
	// Nothing while a dialog or context menu is open: they handle their own keys (their Escape has
	// already closed them by now, but they are still in the DOM during this event).
	function onKeydown(e: KeyboardEvent) {
		if (document.querySelector('[role="dialog"], [role="menu"]')) return;
		const t = e.target as HTMLElement;
		if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
		const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (!org.selection.value.length) return;
			e.preventDefault();
			org.requestClear(org.selection.value);
		} else if (e.key === 'Escape') {
			if (org.selection.value.length) org.clearSelection();
			else uiStore.showBankOrganizer = false;
		} else if (e.key.toLowerCase() === 'a' && (e.metaKey || e.ctrlKey) && !e.altKey) {
			e.preventDefault();
			org.selectAll();
		} else if (arrows[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			org.moveCursor(...arrows[e.key], e.shiftKey);
		}
	}

	const reloadStorage = () => browser.loadStorage();

	onMounted(() => {
		if (storageRef.value) resizeObserver.observe(storageRef.value);
		window.addEventListener('keydown', onKeydown);
		window.electronAPI?.patches.onStorageChanged(reloadStorage);
		browser.loadStorage();
		if (!browser.synthPatches.length && !browser.loading && device.status === DeviceStatus.Connected) browser.loadSynthList();
	});

	onUnmounted(() => {
		resizeObserver.disconnect();
		window.removeEventListener('keydown', onKeydown);
		window.electronAPI?.patches.offStorageChanged();
	});
</script>
