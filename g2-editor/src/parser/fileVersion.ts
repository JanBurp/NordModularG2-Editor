// .pch2/.prf2 format versions. The byte after the text header's NUL is the version; current files
// are 23 (0x17). The official editor converts an older file one version at a time on load
// (CFileConverter, ConvertPatchNtoN+1 in G2Editor.c). Only the last step, 22→23, is implemented;
// the earlier ones are proposed in future-ideas/old-file-version-conversion.md.

import type { ModuleInstance } from '@/types';

export const FILE_VERSION_CURRENT = 23;

// GetDefaultMutationLock (G2Editor.c Off:61477): module types that are excluded from the Patch
// Mutator by default.
const MUTATION_LOCKED_TYPES = new Set([
	0x03, 0x04, 0x11, 0x26, 0x2a, 0x30, 0x32, 0x39, 0x3b, 0x3c, 0x44, 0x45, 0x47, 0x4b, 0x4c, 0x51, 0x52, 0x53, 0x55, 0x69, 0x6c, 0x70, 0x73, 0x7f, 0x8d, 0x8e,
	0x8f, 0x93, 0x94, 0x95, 0x96, 0x9c, 0x9d, 0xaa, 0xab, 0xb2, 0xbc, 0xbd, 0xc6, 0xc7, 0xd0,
]);

export function defaultMutationLock(type: number): number {
	return MUTATION_LOCKED_TYPES.has(type) ? 1 : 0;
}

// ConvertPatch22to23 (Off:61538): every module's mutation lock is set to its type's default. It
// doesn't depend on the earlier steps, so it is applied to any file older than 23.
export function convertModulesToCurrent(modules: ModuleInstance[], version: number): void {
	if (version >= FILE_VERSION_CURRENT) return;
	for (const m of modules) m.mutaLock = defaultMutationLock(m.type);
}
