<template>
	<!-- A text input that also offers `options`: while focused, the ones matching the typed text are listed; click one to use it.
	     Not a <datalist>: its native popup crashes the Electron renderer. -->
	<div class="relative">
		<input
			v-model="value"
			v-bind="$attrs"
			class="w-full px-2 py-1 border border-line-default rounded bg-surface-2 text-content-primary focus:outline-none focus:border-line-default"
			@focus="open = true"
			@blur="open = false"
		/>
		<ul
			v-if="open && matches.length > 0"
			class="absolute z-10 left-0 right-0 mt-0.5 max-h-40 overflow-y-auto list-none m-0 p-0 rounded border border-line-default bg-surface-1 shadow"
			data-testid="combo-options"
		>
			<li v-for="option in matches" :key="option" class="px-2 py-1 cursor-pointer hover:bg-surface-3 truncate" @mousedown.prevent="value = option">
				{{ option }}
			</li>
		</ul>
	</div>
</template>

<script setup lang="ts">
	import { computed, ref } from 'vue';

	defineOptions({ inheritAttrs: false });
	const props = defineProps<{ options: string[] }>();
	const value = defineModel<string>({ required: true });
	const open = ref(false);

	const matches = computed(() => {
		const q = value.value.trim().toLowerCase();
		return props.options.filter((o) => o.toLowerCase().includes(q) && o.toLowerCase() !== q);
	});
</script>
