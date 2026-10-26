<template>
	<ToolBar data-search-replace @keydown.esc.stop="uiStore.showSearchReplace = false">
		<ToolBarLabel class="w-10">Find:</ToolBarLabel>
		<TextInput
			ref="findInput"
			v-model="term"
			class="w-40!"
			:class="{ 'border-red-500!': regexError }"
			:title="regexError ?? 'Module names, switch labels and Morph Group labels'"
			placeholder="Name or label"
			data-testid="search-term"
			@keydown.enter.prevent="$event.shiftKey ? prev() : next()"
		/>
		<Button variant="toggle" size="xs" :active="caseSensitive" title="Match case" @click="caseSensitive = !caseSensitive">Aa</Button>
		<Button variant="toggle" size="xs" :active="regex" title="Regular expression" @click="regex = !regex">.*</Button>
		<Button
			v-for="(t, kind) in SCOPES"
			:key="kind"
			variant="toggle"
			size="xs"
			:active="include[kind]"
			:title="t.title"
			@click="include[kind] = !include[kind]"
		>
			{{ t.label }}
		</Button>

		<ToolBarDivider></ToolBarDivider>

		<ToolBarLabel>Replace:</ToolBarLabel>
		<TextInput
			v-model="replacement"
			class="w-40!"
			:title="regex ? '$1, $2… insert capture groups' : undefined"
			data-testid="search-replacement"
			@keydown.enter.prevent="replaceCurrent"
		/>

		<span v-if="term && !regexError" class="text-xs text-content-secondary whitespace-pre" :title="countTitle" data-testid="search-count">{{
			countText
		}}</span>

		<Button variant="default" size="xs" title="Previous match (⇧Enter)" :disabled="!matches.length" @click="prev">▲</Button>
		<Button variant="default" size="xs" title="Next match (Enter)" :disabled="!matches.length" @click="next">▼</Button>
		<ToolBarDivider />
		<Button variant="default" title="Replace the current match (Enter)" :disabled="!current" @click="replaceCurrent">Replace</Button>
		<Button variant="default" :disabled="!matches.length" data-testid="search-replace-all" @click="replaceAll">Replace All</Button>
		<ToolBarDivider />
		<Button
			variant="default"
			:disabled="!foundModuleCount"
			:title="`Delete the ${foundModuleCount} modules with a match (Undo restores them)`"
			data-testid="search-delete-found"
			@click="deleteFound"
		>
			Delete Found Modules
		</Button>

		<span class="flex-1" />
		<Button variant="default" size="xs" title="Close (Esc)" @click="uiStore.showSearchReplace = false">×</Button>
	</ToolBar>
</template>

<script setup lang="ts">
	import { computed, onMounted, ref } from 'vue';
	import ToolBar from './ToolBar.vue';
	import ToolBarLabel from './ToolBarLabel.vue';
	import ToolBarDivider from './ToolBarDivider.vue';
	import Button from './Button.vue';
	import TextInput from '../common/TextInput.vue';
	import { useUiStore } from '@/store/ui';
	import { useSearchReplace } from '@/composables/useSearchReplace';

	const uiStore = useUiStore();
	const SCOPES = {
		module: { label: 'Modules', title: 'Search module names' },
		param: { label: 'Labels', title: 'Search switch labels' },
		morph: { label: 'Morph', title: 'Search Morph Group labels' },
	} as const;
	const {
		term,
		replacement,
		caseSensitive,
		regex,
		include,
		regexError,
		matches,
		current,
		counts,
		next,
		prev,
		replaceCurrent,
		replaceAll,
		foundModuleCount,
		deleteFound,
	} = useSearchReplace();

	// Only the kinds being searched: "Voice 2/1   FX 1/2   Morph 1", "Voice 2   FX 1" with Labels and Morph off.
	const AREA_KINDS = ['module', 'param'] as const;
	const countText = computed(() => {
		const kinds = AREA_KINDS.filter((k) => include.value[k]);
		const parts = kinds.length
			? [`Voice ${kinds.map((k) => counts.value.voice[k]).join('/')}`, `FX ${kinds.map((k) => counts.value.fx[k]).join('/')}`]
			: [];
		if (include.value.morph) parts.push(`Morph ${counts.value.morph}`);
		return parts.join('   ');
	});
	const countTitle = computed(
		() =>
			`Matches per area: ${AREA_KINDS.filter((k) => include.value[k])
				.map((k) => (k === 'module' ? 'module names' : 'labels'))
				.join(' / ')}`,
	);

	const findInput = ref<InstanceType<typeof TextInput> | null>(null);
	onMounted(() => (findInput.value?.$el as HTMLInputElement | undefined)?.focus());
</script>
