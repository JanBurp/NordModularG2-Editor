import { computed, effectScope, nextTick, ref, watch } from 'vue';
import { useSlotsStore } from '@/store/slots';
import { useUiStore } from '@/store/ui';
import { showToast } from './useToast';
import { usePatchOperations } from './usePatchOperations';
import { buildMatcher, collectItems, computeReplacements, findMatches, itemKey, splitMatches, type SearchItem } from '@/utils/searchReplace';

// Shared Find & Replace state: the toolbar edits it, every canvas Module and the Morph Groups
// toolbar read the match sets to highlight. Created once, in a detached scope, so the matches are
// computed once (not per Module) and survive any single component unmounting.
let shared: ReturnType<typeof createSearchReplace> | undefined;
export function useSearchReplace() {
	return (shared ??= effectScope(true).run(createSearchReplace)!);
}

function createSearchReplace() {
	const term = ref('');
	const replacement = ref('');
	const caseSensitive = ref(false);
	const regex = ref(false);
	const include = ref<Record<SearchItem['kind'], boolean>>({ module: true, param: true, morph: true }); // which kinds are searched
	const currentIndex = ref(0);
	const revealed = ref(false); // has the current match been jumped to since the search changed?
	const slotsStore = useSlotsStore();
	const uiStore = useUiStore();

	const matcherOrError = computed(() => buildMatcher(term.value, { caseSensitive: caseSensitive.value, regex: regex.value }));
	const matcher = computed(() => (matcherOrError.value instanceof RegExp ? matcherOrError.value : null));
	const regexError = computed(() => (matcherOrError.value && !(matcherOrError.value instanceof RegExp) ? matcherOrError.value.error : null));

	const matches = computed<SearchItem[]>(() => {
		const patch = slotsStore.getPatchForSlot(uiStore.slotInFocus);
		if (!uiStore.showSearchReplace || !matcher.value || !patch) return [];
		const items = collectItems(patch).filter((i) => include.value[i.kind]);
		return findMatches(items, matcher.value);
	});
	const matchKeys = computed(() => new Set(matches.value.map(itemKey)));
	// Modules with any match (name or label) stay opaque; every other module is dimmed while searching.
	const matchedModules = computed(() => new Set(matches.value.flatMap((m) => (m.kind === 'morph' ? [] : [`${m.area}:${m.moduleIndex}`]))));
	const searching = computed(() => matcher.value !== null && uiStore.showSearchReplace);
	const current = computed<SearchItem | null>(() => matches.value[Math.min(currentIndex.value, matches.value.length - 1)] ?? null);
	const currentKey = computed(() => (current.value ? itemKey(current.value) : null));
	// Match counts split by area and kind, for the toolbar counter.
	const counts = computed(() => {
		const c = { voice: { module: 0, param: 0 }, fx: { module: 0, param: 0 }, morph: 0 };
		for (const m of matches.value) {
			if (m.kind === 'morph') c.morph++;
			else c[m.area][m.kind]++;
		}
		return c;
	});

	function moduleState(area: 'voice' | 'fx', moduleIndex: number): 'match' | 'dimmed' | null {
		if (!searching.value) return null;
		return matchedModules.value.has(`${area}:${moduleIndex}`) ? 'match' : 'dimmed';
	}

	// Bring a match into view: show its area, select its module and scroll to it.
	async function reveal(item: SearchItem | null): Promise<void> {
		if (!item || item.kind === 'morph') return;
		const target = item.area === 'voice' ? 1 : 0;
		if (uiStore.area !== 2 && uiStore.area !== target) uiStore.setAreaMode(target);
		const location = item.area === 'voice' ? 'va' : 'fx';
		uiStore.selectModules([item.moduleIndex], location);
		await nextTick();
		document
			.querySelector(`[data-testid="canvas-${location}"] [data-module-idx="${item.moduleIndex}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
	}

	watch(
		[term, caseSensitive, regex, include, () => uiStore.slotInFocus],
		() => {
			currentIndex.value = 0;
			revealed.value = false;
		},
		{ deep: true },
	);

	// The first Next/Prev after the search changed jumps to the first match instead of skipping it.
	function step(delta: number): void {
		const n = matches.value.length;
		if (n === 0) return;
		if (revealed.value) currentIndex.value = (currentIndex.value + delta + n) % n;
		revealed.value = true;
		void reveal(current.value);
	}

	async function replace(items: SearchItem[]): Promise<void> {
		if (!matcher.value || items.length === 0) return;
		const { changes, skipped } = computeReplacements(items, matcher.value, replacement.value);
		await slotsStore.renameItems(changes);
		if (skipped.length > 0)
			showToast(`Renamed ${changes.length}, skipped ${skipped.length}: ` + skipped.map((s) => `"${s.newText}" (${s.reason})`).join(', '));
	}

	return {
		term,
		replacement,
		caseSensitive,
		regex,
		include,
		regexError,
		matches,
		counts,
		matchKeys,
		current,
		currentKey,
		searching,
		moduleState,
		split: (text: string) => (matcher.value ? splitMatches(text, matcher.value) : [{ text, hit: false }]),
		next: () => step(1),
		prev: () => step(-1),
		replaceCurrent: () => replace(current.value ? [current.value] : []),
		replaceAll: () => replace(matches.value),
		foundModuleCount: computed(() => matchedModules.value.size),
		// Modules with a match in their name or labels — the ones left undimmed.
		deleteFound: () => {
			const found = new Set(matchedModules.value);
			return usePatchOperations().deleteModulesWhere((area, m) => found.has(`${area}:${m.index}`));
		},
	};
}
