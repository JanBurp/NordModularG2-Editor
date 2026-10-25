<template>
	<ToolBar>
		<div class="flex flex-col gap-1 -ml-1">
			<UndoRedo />
			<Button variant="default" size="xs" hint="newPatch" @click="patchFile.newPatch()">New</Button>
			<Button variant="default" size="xs" hint="initPatch" @click="patchFile.loadInitPatch(1)">Init 1</Button>
			<Button variant="default" size="xs" hint="initPatch" @click="patchFile.loadInitPatch(2)">Init 2</Button>
		</div>

		<template v-if="mode === 'classic'">
			<ModulePicker />
		</template>

		<ParameterPagesGroup v-if="mode === 'compact'" compact />

		<div class="self-stretch ml-4">
			<CPU :compact="mode === 'compact'" />
		</div>

		<MorphGroups class="ml-4" @morph-group-label-edit="(info) => emit('morphGroupLabelEdit', info)" />

		<span class="ml-auto"></span>
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

	withDefaults(defineProps<{ mode?: 'classic' | 'compact' }>(), { mode: 'classic' });
	const emit = defineEmits<{ morphGroupLabelEdit: [info: { groupIndex: number; currentLabel: string }] }>();

	const patchFile = usePatchFile();
</script>
