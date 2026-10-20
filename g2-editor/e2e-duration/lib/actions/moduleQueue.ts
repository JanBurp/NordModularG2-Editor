import { getAllModules } from '../../../src/renderer/nmg2mods';
import type { ModuleDefinition } from '../../../src/types';

/** Every user-addable module type in turn: a type stays pending until it has really been added; then the next cycle starts. */
export class ModuleQueue {
	readonly all: ModuleDefinition[];
	private pending: ModuleDefinition[];
	private firstCycleDone = false;

	constructor(private readonly rnd: () => number) {
		this.all = getAllModules().filter((m) => m.page?.name !== 'Hidden');
		this.pending = [...this.all];
	}

	/** A random pending type `ok` accepts (not removed until `added`), or undefined when none fits. */
	next(ok: (d: ModuleDefinition) => boolean = () => true): ModuleDefinition | undefined {
		const fit = this.pending.filter(ok);
		return fit[Math.floor(this.rnd() * fit.length)];
	}

	added(def: ModuleDefinition): void {
		this.pending = this.pending.filter((d) => d.id !== def.id);
		if (this.pending.length > 0) return;
		this.firstCycleDone = true;
		this.pending = [...this.all];
	}

	/** Types not yet added in the first cycle (0 once every type has been added). */
	get remaining(): number {
		return this.firstCycleDone ? 0 : this.pending.length;
	}
}
