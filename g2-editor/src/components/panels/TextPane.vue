<template>
	<div class="flex flex-col h-full overflow-hidden text-xs bg-surface-0">
		<textarea
			class="flex-1 resize-none bg-surface-0 text-content-primary p-2 outline-none disabled:opacity-40 disabled:bg-surface-1 disabled:text-content-muted"
			:value="text"
			:disabled="!hasPatch"
			placeholder="Patch notes…"
			@input="handleInput"
		></textarea>
		<div v-if="device.connected" class="flex items-center justify-between gap-2 px-2 py-1 border-t border-line-subtle shrink-0">
			<span v-if="textDirty" class="text-content-muted">Not yet saved to device — saves when you leave this pane</span>
			<span v-else class="text-green-600">Saved to device</span>
			<button
				class="px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
				:disabled="!textDirty"
				@click="saveNow"
			>
				Save now
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed, watch, onUnmounted } from 'vue';
	import { useSlotsStore } from '@/store/slots';
	import { useUiStore } from '@/store/ui';
	import { useSettingsStore } from '@/store/settings';
	import { useDeviceStore } from '@/store/device';

	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();
	const settingsStore = useSettingsStore();
	const device = useDeviceStore();

	const slot = computed(() => uiStore.slotInFocus);
	const hasPatch = computed(() => !!(slot.value && slotsStore.slots[slot.value].patch));
	const text = computed(() => (slot.value ? (slotsStore.slots[slot.value].patch?.text ?? '') : ''));
	const textDirty = computed(() => !!(slot.value && slotsStore.slots[slot.value].textDirty));

	function handleInput(e: Event) {
		const s = slot.value;
		if (!s) return;
		slotsStore.setPatchText(s, (e.target as HTMLTextAreaElement).value);
	}

	function saveNow() {
		if (slot.value) slotsStore.pushPatchToDevice(slot.value);
	}

	// Pushes notes to the device whenever the notes pane stops being visible — tab switch, slot
	// switch, or the panel closing. There's no live "set patch notes" command (see setPatchText's
	// comment); this plus the explicit "Save now" button above are the only ways edits reach
	// hardware.

	// TextPane never unmounts on a tab switch (SidePanel toggles panels with v-show), so this is
	// the only way to catch "the user switched to another tab while the panel stayed open".
	watch(
		() => settingsStore.rightPaneTab,
		(_next, prev) => {
			if (prev === 'text' && slot.value) slotsStore.pushPatchToDevice(slot.value);
		},
	);

	// Catches "switched slots while still on the notes tab" — pushes the slot being left (`prev`),
	// not the one being switched to.
	watch(
		() => uiStore.slotInFocus,
		(_next, prev) => {
			if (settingsStore.rightPaneTab === 'text' && prev) slotsStore.pushPatchToDevice(prev);
		},
	);

	// Catches the panel actually closing (App.vue's SidePanel is v-if'd, a real unmount).
	onUnmounted(() => {
		if (slot.value) slotsStore.pushPatchToDevice(slot.value);
	});
</script>
