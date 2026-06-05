<template>
	<Dialog v-model="showDialog" title="Set Value" @confirm="confirmParamEdit" @cancel="showDialog = false">
		<select
			v-if="isEnumParam && editingParamDef"
			v-model="editingValue"
			class="w-full px-2 py-1 text-sm border border-neutral-500 rounded bg-neutral-700 text-neutral-100 focus:outline-none focus:border-neutral-400"
		>
			<option v-for="(name, i) in editingParamDef.names" :key="i" :value="editingParamDef.low + i">
				{{ name || String(editingParamDef.low + i) }}
			</option>
		</select>
		<input
			v-else-if="isMidiNoteParam"
			v-model="editingNoteText"
			class="w-full px-2 py-1 text-sm border border-neutral-500 rounded bg-neutral-700 text-neutral-100 focus:outline-none focus:border-neutral-400"
			placeholder="e.g. C4"
		/>
		<input
			v-else
			v-model.number="editingValue"
			type="number"
			:min="editingParamDef?.low ?? 0"
			:max="editingParamDef?.high ?? 127"
			class="w-full px-2 py-1 text-sm border border-neutral-500 rounded bg-neutral-700 text-neutral-100 focus:outline-none focus:border-neutral-400"
		/>
	</Dialog>
</template>
<script setup lang="ts">
	import Dialog from './Dialog.vue';
	import { useParamEditDialog } from '../../composables/useParamEditDialog';

	const { showDialog, editingParamDef, editingValue, editingNoteText, isEnumParam, isMidiNoteParam, confirmParamEdit } = useParamEditDialog();
</script>
