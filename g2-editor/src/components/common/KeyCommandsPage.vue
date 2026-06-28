<template>
	<Teleport to="body">
		<div class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" @click.self="emit('close')">
			<div class="bg-surface-1 border border-line-default rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
				<div class="flex items-center justify-between mb-5">
					<h2 class="text-content-primary text-lg font-semibold">Keyboard Shortcuts</h2>
					<button class="text-content-secondary hover:text-content-primary text-xl leading-none px-2" @click="emit('close')">&times;</button>
				</div>

				<div class="grid grid-cols-2 gap-6 text-sm">
					<div v-for="group in groups" :key="group.title">
						<h3 class="text-content-secondary uppercase text-xs font-semibold tracking-wide mb-2">{{ group.title }}</h3>
						<table class="w-full">
							<tbody>
								<tr v-for="row in group.rows" :key="row.action" class="border-t border-line-default/40">
									<td class="py-1 pr-3 font-mono text-xs whitespace-nowrap">
										<span v-for="(k, i) in row.keys" :key="i">
											<kbd class="px-1.5 py-0.5 bg-surface-2 border border-line-default rounded text-xs font-mono">{{ k }}</kbd>
											<span v-if="i < row.keys.length - 1" class="text-content-secondary mx-0.5">/</span>
										</span>
									</td>
									<td class="py-1 text-content-secondary">{{ row.action }}</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	const emit = defineEmits<{ close: [] }>();

	const groups = [
		{
			title: 'File',
			rows: [
				{ keys: ['⌘ N'], action: 'New patch' },
				{ keys: ['⌘ O'], action: 'Open file' },
				{ keys: ['⌘ S'], action: 'Save' },
				{ keys: ['⇧ ⌘ S'], action: 'Save As' },
			],
		},
		{
			title: 'Edit',
			rows: [
				{ keys: ['⌘ C'], action: 'Copy selected modules' },
				{ keys: ['⌘ X'], action: 'Cut selected modules' },
				{ keys: ['⌘ V'], action: 'Paste modules' },
				{ keys: ['⌘ A'], action: 'Select all modules' },
				{ keys: ['Del', 'Backspace'], action: 'Delete selection' },
				{ keys: ['⌘ Z'], action: 'Undo' },
				{ keys: ['⇧ ⌘ Z'], action: 'Redo' },
			],
		},
		{
			title: 'Slots & Variations',
			rows: [
				{ keys: ['A-D'], action: 'Select slot A - D' },
				{ keys: ['1–8'], action: 'Select variation 1–8' },
				{ keys: ['R'], action: 'Toggle clock run / stop' },
			],
		},
		{
			title: 'View & Areas',
			rows: [
				{ keys: ['V'], action: 'Toggle Voice area ↔ Split' },
				{ keys: ['F'], action: 'Toggle FX area ↔ Split' },
				{ keys: ['Space'], action: 'Show / hide all cables' },
				{ keys: ['Ctrl+Space'], action: 'Shake cables' },
			],
		},
		{
			title: 'Panels',
			rows: [
				{ keys: ['⌘ M'], action: 'Toggle Modules pane' },
				{ keys: ['⌘ B'], action: 'Toggle Browser pane' },
				{ keys: ['⌘ I'], action: 'Toggle Midi CC pane' },
				{ keys: ['⌘ ,'], action: 'Toggle Settings pane' },
			],
		},
		{
			title: 'Overlays',
			rows: [
				{ keys: ['F5'], action: 'Show parameter values (hold)' },
				{ keys: ['F8'], action: 'Show Midi CC assignments (hold)' },
			],
		},
		{
			title: 'Modules & Parameters',
			rows: [
				{ keys: ['M'], action: 'Quick add module' },
				{ keys: ['Shift + ← → ↑ ↓'], action: 'Navigate between modules' },
				{ keys: ['←', '→'], action: 'Navigate parameters' },
				{ keys: ['↑', '↓'], action: 'Adjust parameter ±1' },
				{ keys: ['Alt + ↑ / ↓'], action: 'Adjust parameter ±16' },
			],
		},
		{
			title: 'Other',
			rows: [
				{ keys: ['ESC'], action: 'Abort / close dialog / clear filter' },
				{ keys: ['F1'], action: 'Show module help' },
			],
		},
	];
</script>
