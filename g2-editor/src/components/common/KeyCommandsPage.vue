<template>
	<Teleport to="body">
		<div class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" @click.self="emit('close')">
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Keyboard Shortcuts"
				class="bg-surface-1 border border-line-default rounded shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"
			>
				<div class="flex items-center justify-between mb-5">
					<h2 class="text-content-primary text-lg font-semibold">Keyboard Shortcuts</h2>
					<button class="text-content-secondary hover:text-content-primary text-xl leading-none px-2" aria-label="Close" @click="emit('close')">
						&times;
					</button>
				</div>

				<div class="grid grid-cols-2 gap-6 text-sm">
					<KeyCommandTable v-for="group in groups" :key="group.title" :title="group.title" :rows="group.rows" />
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import { useSettingsStore } from '../../store/settings';
	import KeyCommandTable from './KeyCommandTable.vue';
	import { isMac } from '../../utils/platform';
	import { MOD, ALT, SHIFT } from '../../constants/statusHints';

	const emit = defineEmits<{ close: [] }>();

	const settingsStore = useSettingsStore();

	// Mac: glyphs separated by spaces (⇧ ⌘ S); elsewhere: key names joined with '+' (Ctrl+Shift+S).
	const key = (...parts: string[]) => parts.join(isMac ? ' ' : '+');
	const CMD_CTRL = isMac ? '⌘/⌃' : 'Ctrl';
	const CTRL = isMac ? '⌃' : 'Ctrl';
	const SHIFT_MOD = isMac ? key(SHIFT, MOD) : key(MOD, SHIFT); // ⇧ ⌘ on Mac, Ctrl+Shift elsewhere

	const groups = computed(() => [
		{
			title: 'File',
			rows: [
				{ keys: [key(MOD, 'N')], action: 'New patch' },
				{ keys: [key(MOD, 'O')], action: 'Open file' },
				{ keys: [key(MOD, 'S')], action: 'Save' },
				{ keys: [key(SHIFT_MOD, 'S')], action: 'Save As' },
			],
		},
		{
			title: 'Synth',
			rows: [
				{ keys: [key(MOD, 'G')], action: 'Open Synth Settings' },
				{ keys: [key(MOD, 'U')], action: 'Upload Active Slot' },
				{ keys: [key(MOD, 'M')], action: 'Send Controller Snapshot' },
				{ keys: [key(MOD, '1')], action: 'Dump One' },
				{ keys: [key(ALT, 'S')], action: 'Save in Synth' },
			],
		},
		{
			title: 'Patch & Performance',
			rows: [
				{ keys: [key(MOD, 'P')], action: 'Open Patch Settings' },
				{ keys: [key(MOD, 'D')], action: 'Download to Slot' },
				{ keys: [key(MOD, 'R')], action: 'Open Performance Settings' },
				{ keys: [key(SHIFT, 'Click Perf')], action: 'Toggle Performance mode with SHIFT' },
			],
		},
		{
			title: 'Edit',
			rows: [
				{ keys: [key(MOD, 'C')], action: 'Copy selected modules' },
				{ keys: [key(MOD, 'X')], action: 'Cut selected modules' },
				{ keys: [key(MOD, 'V')], action: 'Paste modules' },
				{ keys: [key(MOD, 'A')], action: 'Select all modules' },
				{ keys: [key(MOD, 'E')], action: 'Paste Params' },
				{ keys: ['Backspace'], action: 'Delete selection (or hovered jack’s cable/nest)' },
				{ keys: [key(MOD, 'Z')], action: 'Undo' },
				{ keys: [key(SHIFT_MOD, 'Z')], action: 'Redo' },
				{ keys: [key(SHIFT, 'Click'), key(SHIFT, 'Drag')], action: 'Add module(s) to selection' },
				{ keys: [key(CMD_CTRL, 'Drag')], action: 'Copy module(s)' },
				{ keys: [key(ALT, 'Click')], action: 'Module context menu' },
			],
		},
		{
			title: 'Slots & Variations',
			rows: [
				{ keys: ['A-D'], action: 'Select slot A - D' },
				{ keys: [key(CTRL, 'Tab'), key(CTRL, SHIFT, 'Tab')], action: 'Cycle to next / previous slot' },
				{ keys: [key(SHIFT, 'Click slot')], action: 'Toggle slot Active' },
				{ keys: [key(CMD_CTRL, 'Click slot')], action: 'Toggle slot Keyboard' },
				{ keys: ['1–8'], action: 'Select variation 1–8' },
				{ keys: ['R'], action: 'Toggle clock run / stop' },
			],
		},
		{
			title: 'View & Areas',
			rows: [
				{ keys: ['V'], action: 'Show Voice area (Split if already Voice-only)' },
				{ keys: ['F'], action: 'Show FX area (Split if already FX-only)' },
				{ keys: ['Space', 'H'], action: 'Show / hide all cables' },
				{ keys: ['S', key(SHIFT, 'Space')], action: 'Shake cables' },
				{ keys: [key(MOD, '='), key(MOD, '-'), key(MOD, '0')], action: 'Zoom in / out / actual size' },
			],
		},
		{
			title: 'Panels',
			rows: [
				{ keys: [key(MOD, 'L')], action: 'Toggle Modules pane' },
				{ keys: [key(MOD, 'B')], action: 'Toggle Browser pane' },
				{ keys: [key(MOD, 'I')], action: 'Toggle Midi CC pane' },
				{ keys: [key(MOD, 'J')], action: 'Toggle Text pane' },
				{ keys: [key(MOD, 'K')], action: 'Toggle Keyboard pane' },
				{ keys: [key(MOD, ',')], action: 'Toggle Settings pane' },
				{ keys: [key(MOD, 'T')], action: 'Toggle Extended Toolbar' },
				{ keys: [key(MOD, 'F')], action: 'Toggle Parameter Pages' },
				{ keys: [key(SHIFT_MOD, 'F')], action: 'Toggle Parameter Overview' },
				{ keys: [key(MOD, '2')], action: 'Toggle Patch Mutator' },
				{ keys: ['/'], action: 'Focus search (Modules / Browser pane)' },
			],
		},
		{
			title: 'Browser Pane',
			rows: [
				{ keys: ['↑', '↓'], action: 'Move cursor over banks / folders and items' },
				{ keys: ['←', '→'], action: 'Switch Disk/Patches/Performances tab (while no cursor is set)' },
				{ keys: ['←'], action: 'Collapse bank under cursor / go up one folder (Disk)' },
				{ keys: ['→', '↵', 'Space'], action: 'Expand bank / open folder / load item under cursor' },
				{ keys: ['ESC'], action: 'Reset cursor' },
				{ keys: ['Double-click'], action: 'Load file / patch / performance (a single click only selects)' },
			],
		},
		{
			title: 'Keyboard Pane',
			rows: [
				{ keys: ['Hold + glide'], action: 'Play notes in succession' },
				{ keys: ['Click sounding key'], action: 'Turn off a Drone / Repeat note' },
			],
		},
		{
			title: 'Morph Groups',
			rows: [
				{ keys: [key(CMD_CTRL, 'Click')], action: 'Assign / deassign parameter to selected Morph Group' },
				{ keys: [key(CMD_CTRL, 'Drag')], action: 'Set morph range (assigned knob/slider)' },
				{ keys: [key(CMD_CTRL, '↑'), key(CMD_CTRL, '↓')], action: 'Nudge morph range of selected parameter' },
				{ keys: [key(ALT, '1–8')], action: 'Select active Morph Group' },
				{ keys: [key(CMD_CTRL, '↵')], action: 'Assign / deassign selected parameter to active Morph Group' },
			],
		},
		{
			title: 'Overlays',
			rows: [
				{ keys: ['F5'], action: 'Show parameter values (hold)' },
				{ keys: ['F6'], action: 'Show morph ranges (hold)' },
				{ keys: ['F7'], action: 'Show morph group assignments (hold)' },
				{ keys: ['F8'], action: 'Show Midi CC assignments (hold)' },
			],
		},
		{
			title: 'Modules & Parameters',
			rows: [
				{ keys: ['M'], action: 'Quick add module' },
				{ keys: [key(SHIFT, '← → ↑ ↓')], action: 'Navigate between modules' },
				{ keys: ['←', '→'], action: 'Navigate parameters (original editor’s order)' },
				{ keys: ['↑', '↓'], action: 'Adjust parameter ±1 (hovered one with Focus on hover)' },
				{ keys: [key(ALT, '↑ / ↓')], action: 'Adjust parameter ±16' },
				{ keys: ['Click / hold ▲▼'], action: 'Spinner under a selected knob: ±1' },
				{ keys: [key(SHIFT, 'Drag knob')], action: 'Fine adjust' },
				{ keys: ['Double-click', 'Enter'], action: 'Set parameter to its default value (Enter: hovered one with Focus on hover)' },
				{ keys: [key(SHIFT, 'Click'), '='], action: 'Set parameter value: type it in its own units (Hz, ms, note, …)' },
				{ keys: ['L'], action: 'Assign last received MIDI CC to selected parameter' },
				{ keys: ['Tab', key(SHIFT, 'Tab')], action: 'Cycle module category (Module Picker toolbar)' },
				{ keys: [',', '.'], action: 'Select module (Module Picker toolbar)' },
				{ keys: ['Enter'], action: 'Add selected module (Module Picker toolbar)' },
			],
		},
		{
			title: 'Parameter Pages',
			rows: [
				{ keys: ['Drag display box', key(ALT, 'Drag')], action: 'Drag a page cell onto a canvas parameter or another cell to assign it' },
				{ keys: ['Right-click module'], action: 'Assign / Global Assign all its parameters (Page ▸ Multi Column / Column N)' },
			],
		},
		{
			title: 'Cabling',
			rows: [
				...(settingsStore.cableConnectMode === 'click'
					? [
							{ keys: ['Click jack → Click jack'], action: 'Arm a jack, then click another to connect (click armed jack again to cancel)' },
							{ keys: ['Enter'], action: 'Connect armed jack to the snap-highlighted jack' },
						]
					: [
							{ keys: ['Drag'], action: 'Drag from one jack to another to connect' },
							{ keys: ['Click'], action: 'Cycle through a connected jack’s connections' },
						]),
				...(settingsStore.autoSuggestCable
					? [
							{ keys: ['Click', 'Enter'], action: 'Confirm the auto-suggested cable after adding or deleting a module' },
							{ keys: ['Space'], action: 'Cycle to the next-best auto-suggested cable' },
						]
					: []),
				{ keys: [key(CMD_CTRL, 'Click')], action: 'Grab a connected jack’s cable(s) to re-route' },
				{ keys: [key(CMD_CTRL, 'Drag')], action: 'Move the grabbed cable' },
				{ keys: ['Right-click'], action: 'Jack menu: Delete connected / Break out of nest' },
			],
		},
		{
			title: 'Other',
			rows: [
				{ keys: ['ESC'], action: 'Close dialog / menu / overlay, cancel an armed jack / ghost cable, or clear search filter' },
				{ keys: ['F1'], action: 'Show module help' },
				...(isMac ? [{ keys: ['⌘ `'], action: 'Cycle to next device window (macOS default, not app-registered)' }] : []),
			],
		},
	]);
</script>
