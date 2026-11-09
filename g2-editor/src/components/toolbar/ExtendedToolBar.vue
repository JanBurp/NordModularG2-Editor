<template>
	<!-- Narrowing steps, by the toolbar's width (@container/toolbar in ToolBar.vue):
	       < 1550px  the Undo/New/Init column hides
	       < 1502px  the 'Hidden' category hides (ModulePicker.vue)
	       < 1414px  the load meter goes compact (CPU.vue, CPUpart.vue)
	       < 1356px  the load meter moves to PatchToolBar.vue as a mini meter, and every ToolBarLabel hides
	       then      the ModulePicker shrinks, icons scaled so every module stays visible, down to its flex basis
	       then      the groups wrap
	     Spacing is gap, not margins, so wrapped rows start flush left.
	     Short window (useShortWindow): slim rows — Undo/New/Init as a 2×2 grid, mini load meter; ModulePicker and
	     MorphGroups slim themselves. -->
	<ToolBar class="gap-x-6!">
		<div class="gap-1 -ml-1 -mr-4 @max-[1550px]/toolbar:hidden" :class="short ? 'grid grid-cols-2' : 'flex flex-col'">
			<UndoRedo />
			<Button variant="default" size="xs" hint="newPatch" @click="patchFile.newPatch()">New</Button>
			<Button variant="default" size="xs" hint="initPatch" @click="patchFile.loadInitPatch(1)">Init 1</Button>
			<Button variant="default" size="xs" hint="initPatch" @click="patchFile.loadInitPatch(2)">Init 2</Button>
		</div>

		<template v-if="mode === 'classic'">
			<ModulePicker />
		</template>

		<ParameterPagesGroup v-if="mode === 'compact'" compact />

		<div class="@max-[1356px]/toolbar:hidden" :class="short ? 'self-center' : 'self-stretch'">
			<CPU :compact="mode === 'compact'" :mini="short" />
		</div>

		<MorphGroups @morph-group-label-edit="(info) => emit('morphGroupLabelEdit', info)" />
	</ToolBar>
</template>

<script setup lang="ts">
	import ToolBar from './ToolBar.vue';
	import Button from './Button.vue';
	import ModulePicker from './ModulePicker.vue';
	import UndoRedo from './UndoRedo.vue';
	import CPU from './CPU.vue';
	import MorphGroups from './MorphGroups.vue';
	import ParameterPagesGroup from './ParameterPagesGroup.vue';
	import { usePatchFile } from '../../composables/usePatchFile';
	import { useShortWindow } from '../../composables/useShortWindow';

	withDefaults(defineProps<{ mode?: 'classic' | 'compact' }>(), { mode: 'classic' });
	const emit = defineEmits<{ morphGroupLabelEdit: [info: { groupIndex: number; currentLabel: string }] }>();

	const patchFile = usePatchFile();
	const short = useShortWindow();
</script>
