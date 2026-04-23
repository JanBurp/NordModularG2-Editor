/**
 * Initialize window.modules and window.parammap for backward compatibility
 * This uses the original JS data files which contain the complete module and param definitions
 */

import { getModule, getModuleByName, getAllModules } from "./nmg2mods";
import { getParam } from "./parammap";

// Create window.modules compatibility layer using TypeScript module data
// This provides getById/getByName/getAll for the parser and other legacy code
(window as any).modules = {
	getById: (id: number) => {
		const mod = getModule(id);
		if (!mod) return undefined;
		// Return an object with shortnm/longnm for backward compatibility
		return {
			...mod,
			shortnm: mod.short,
			longnm: mod.long,
		};
	},
	getByName: (short: string) => {
		const mod = getModuleByName(short);
		if (!mod) return undefined;
		return {
			...mod,
			shortnm: mod.short,
			longnm: mod.long,
		};
	},
	getAll: () => {
		return getAllModules().map((mod) => ({
			...mod,
			shortnm: mod.short,
			longnm: mod.long,
		}));
	},
};

// Create window.parammap compatibility layer
(window as any).parammap = {
	get: getParam,
};

export {};