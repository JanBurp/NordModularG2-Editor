import { getAllModules } from '../../../src/renderer/nmg2mods';
import type { ModuleDefinition } from '../../../src/types';

/** Seeded shuffle of every user-addable module type; next() cycles through all of them before repeating. */
export class ModuleQueue {
	readonly all: ModuleDefinition[];
	private order: ModuleDefinition[] = [];

	constructor(private readonly rnd: () => number) {
		this.all = getAllModules().filter((m) => m.page?.name !== 'Hidden');
	}

	next(): ModuleDefinition {
		if (this.order.length === 0) {
			this.order = [...this.all];
			for (let i = this.order.length - 1; i > 0; i--) {
				const j = Math.floor(this.rnd() * (i + 1));
				[this.order[i], this.order[j]] = [this.order[j], this.order[i]];
			}
		}
		return this.order.pop()!;
	}
}
