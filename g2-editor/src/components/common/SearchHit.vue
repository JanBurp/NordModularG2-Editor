<template>
	<template v-for="(p, i) in parts" :key="i">
		<component :is="tag" v-if="p.hit" :class="tag === 'tspan' ? ['search-hit', hit] : hit === 'current' ? 'bg-orange-400' : 'bg-amber-300'">{{
			p.text
		}}</component>
		<template v-else>{{ p.text }}</template>
	</template>
</template>

<script setup lang="ts">
	import { computed } from 'vue';
	import { useSearchReplace } from '@/composables/useSearchReplace';

	// Text with the Find & Replace hits marked: <tspan> inside SVG <text>, <span> in HTML.
	const props = withDefaults(defineProps<{ text: string; hit?: 'match' | 'current' | null; tag?: 'tspan' | 'span' }>(), {
		hit: null,
		tag: 'tspan',
	});
	const search = useSearchReplace();
	const parts = computed(() => (props.hit ? search.split(props.text) : [{ text: props.text, hit: false }]));
</script>
