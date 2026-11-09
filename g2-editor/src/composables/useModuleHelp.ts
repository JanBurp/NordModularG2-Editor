import { reactive } from 'vue';

/**
 * Module help pages (HTML fragments in doc/help, converted from the official Clavia help by
 * scripts/import-clavia-help.mjs). Links inside a page (<a data-help>) open another page in
 * the same help block; each module's block keeps its own Back stack.
 */
export function useModuleHelp() {
	const pages = reactive(new Map<string, string | null>());
	const linkStacks = reactive(new Map<number, string[]>());

	async function loadPage(name: string) {
		if (!pages.has(name)) pages.set(name, await window.electronAPI.loadHelp(name));
	}

	function helpFor(moduleId: number, short: string): string {
		return pages.get(linkStacks.get(moduleId)?.at(-1) ?? short) ?? '';
	}

	async function openLink(moduleId: number, name: string) {
		await loadPage(name);
		linkStacks.set(moduleId, [...(linkStacks.get(moduleId) ?? []), name]);
	}

	function canGoBack(moduleId: number) {
		return (linkStacks.get(moduleId)?.length ?? 0) > 0;
	}

	function back(moduleId: number) {
		linkStacks.get(moduleId)?.pop();
	}

	function resetLinks() {
		linkStacks.clear();
	}

	return { loadPage, helpFor, openLink, canGoBack, back, resetLinks };
}
