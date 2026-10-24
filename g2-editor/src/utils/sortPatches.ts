import type { SynthPatch } from '@/store/browser';

export type PatchSortMode = 'location' | 'name' | 'name-desc' | 'category';

/* Sort order shared by the Patch Browser and the Bank Organizer. */
export function sortPatches(list: SynthPatch[], mode: PatchSortMode): SynthPatch[] {
	if (mode === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name));
	if (mode === 'name-desc') return [...list].sort((a, b) => b.name.localeCompare(a.name));
	if (mode === 'category') return [...list].sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));
	return [...list].sort((a, b) => a.bank - b.bank || a.location - b.location);
}
