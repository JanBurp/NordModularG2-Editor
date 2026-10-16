<template>
	<Teleport to="body">
		<div v-if="showDialog" class="fixed inset-0 z-50" @mousedown.self="closeParamEdit">
			<div
				role="dialog"
				aria-label="Set Value"
				class="absolute w-80 bg-surface-1 border border-line-default rounded shadow-xl"
				:style="panelStyle"
				data-testid="param-edit-dialog"
			>
				<div class="flex items-center justify-between px-4 py-3 border-b border-line-default">
					<span class="text-sm font-semibold text-content-primary">Set Value</span>
					<button class="hover:text-content-primary cursor-pointer" aria-label="Close" data-testid="param-edit-close" @click="closeParamEdit">
						<Icon name="close" class="w-3 h-3" />
					</button>
				</div>
				<div class="px-4 py-3">
					<div class="flex items-stretch gap-2">
						<SearchInput
							ref="searchRef"
							v-model="query"
							class="flex-1"
							:placeholder="currentLabel"
							@up="navigate(-1)"
							@down="navigate(1)"
							@enter="setAndClose"
						/>
						<button
							class="px-4 text-xs rounded bg-input text-black font-medium hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							:disabled="!highlighted"
							@click="setAndClose"
						>
							Set
						</button>
					</div>
					<div v-if="showList" class="max-h-64 overflow-y-auto mt-1" role="listbox">
						<div
							v-for="(o, i) in filtered"
							:key="o.raw"
							:ref="(el) => setItemRef(el, i)"
							role="option"
							:aria-selected="i === navIndex"
							:class="[
								'flex items-center justify-between gap-2 px-2 py-1 text-xs cursor-pointer rounded',
								i === navIndex ? 'bg-blue-500 dark:bg-blue-400 text-white' : 'hover:bg-surface-3',
							]"
							@mousedown.prevent="confirmParamEdit(o.raw)"
						>
							<span class="font-medium">{{ o.label }}</span>
							<span :class="['text-xs', i === navIndex ? 'text-white/70' : 'text-content-muted']">{{ o.raw }}</span>
						</div>
						<div v-if="filtered.length === 0" class="px-2 py-2 text-xs text-content-muted">No matching value</div>
					</div>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
	import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
	import SearchInput from './SearchInput.vue';
	import Icon from './Icon.vue';
	import { matchParamValues } from '@/utils/moduleControls';
	import { useParamEditDialog } from '../../composables/useParamEditDialog';

	const { showDialog, position, options, currentValue, currentLabel, isEnumParam, closeParamEdit, confirmParamEdit } = useParamEditDialog();

	const PANEL_W = 320; // w-80
	const PANEL_H = 370; // title + input + list estimate
	const MAX_RESULTS = 10;

	const panelStyle = computed(() => {
		const x = Math.min(Math.max(position.value.x + 8, 8), window.innerWidth - PANEL_W - 8);
		const y = Math.min(Math.max(position.value.y + 8, 8), window.innerHeight - PANEL_H - 8);
		return { left: `${x}px`, top: `${y}px` };
	});

	const searchRef = ref();
	const query = ref('');
	const navIndex = ref(0);
	const itemRefs = ref<(Element | null)[]>([]);

	// Enum params (a few named options) list everything right away; others once the user types.
	const showList = computed(() => !!query.value || isEnumParam.value);
	const filtered = computed(() => {
		const matches = matchParamValues(options.value, query.value);
		return query.value ? matches.slice(0, MAX_RESULTS) : matches;
	});
	const highlighted = computed(() => (showList.value ? filtered.value[navIndex.value] : undefined));

	watch(showDialog, async (open) => {
		if (!open) return;
		query.value = '';
		await nextTick();
		navIndex.value = Math.max(
			0,
			filtered.value.findIndex((o) => o.raw === currentValue.value),
		);
		searchRef.value?.focus();
	});

	watch(query, () => {
		navIndex.value = 0;
	});

	watch(navIndex, async (i) => {
		await nextTick();
		itemRefs.value[i]?.scrollIntoView({ block: 'nearest' });
	});

	function setItemRef(el: unknown, i: number) {
		itemRefs.value[i] = el instanceof Element ? el : null;
	}

	function navigate(dir: 1 | -1) {
		const count = filtered.value.length;
		if (!count || !showList.value) return;
		navIndex.value = Math.max(0, Math.min(count - 1, navIndex.value + dir));
	}

	function setAndClose() {
		if (highlighted.value) confirmParamEdit(highlighted.value.raw);
	}

	function onDocKeydown(e: KeyboardEvent) {
		if (showDialog.value && e.key === 'Escape') {
			e.stopPropagation();
			closeParamEdit();
		}
	}

	onMounted(() => document.addEventListener('keydown', onDocKeydown, true));
	onUnmounted(() => document.removeEventListener('keydown', onDocKeydown, true));
</script>
