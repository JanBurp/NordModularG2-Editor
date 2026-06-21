<template>
	<Dialog v-model="showDialog" title="Set Value" @confirm="confirmParamEdit" @cancel="showDialog = false">
		<select
			v-if="isEnumParam && editingParamDef"
			v-model="editingValue"
			class="w-full px-2 py-1 text-sm border border-line-default rounded bg-surface-2 text-content-primary focus:outline-none focus:border-line-default"
		>
			<option v-for="(name, i) in editingParamDef.names" :key="i" :value="editingParamDef.low + i">
				{{ name || String(editingParamDef.low + i) }}
			</option>
		</select>
		<NumberInput
			v-else
			v-model="editingValue"
			:min="editingParamDef?.low ?? 0"
			:max="editingParamDef?.high ?? 127"
			:midi-note="isMidiNoteParam"
			class="w-full"
		/>
	</Dialog>
</template>
<script setup lang="ts">
	import Dialog from './Dialog.vue';
	import NumberInput from './NumberInput.vue';
	import { useParamEditDialog } from '../../composables/useParamEditDialog';

	const { showDialog, editingParamDef, editingValue, isEnumParam, isMidiNoteParam, confirmParamEdit } = useParamEditDialog();
</script>
