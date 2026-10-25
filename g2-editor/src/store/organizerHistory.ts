import { defineStore } from 'pinia';
import type { BankLoc } from './browser';

/* Undo/redo for the Bank Organizer, separate from the patch history (history.ts).
 *
 * One entry is one user action ("Move 3 patches"), stored as what each touched place held
 * before and after it. Bank contents are kept as patch-file copies in <storage>/.g2-organizer-history/<session>
 * (Electron empties it the first time a storage folder is used per app run), so undo can
 * write the old patch back with put-location. Storage changes keep a copy of the file, so a
 * deleted storage item can come back. The browser store's _organize records a running operation
 * with an ActionRecorder and pushes the result; stepOrganizerHistory applies an entry. */

/* What a bank location holds: a patch-file copy, or null for empty. */
export type LocContent = { file: string; name: string; category?: string } | null;

export interface BankChange {
	type: 'bank';
	loc: BankLoc;
	before: LocContent;
	after: LocContent;
}

/* A file in the storage folder that was created and/or removed; `copy` keeps its contents.
 * A file rewritten in place (e.g. another category) has `copy` before and `copyAfter` after. */
export interface StorageChange {
	type: 'storage';
	file: string;
	copy: string;
	existsBefore: boolean;
	existsAfter: boolean;
	copyAfter?: string;
}

export type OrganizerChange = BankChange | StorageChange;

export interface OrganizerAction {
	label: string;
	changes: OrganizerChange[];
}

export const MAX_ORGANIZER_HISTORY = 50;

// This window's folder inside .g2-organizer-history: each window (G2) has its own history.
export const HISTORY_SESSION = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const locKey = (l: BankLoc) => `${l.kind}-${l.bank}-${l.location}`;

/* Collects the changes of the action that is running; merged per place (first before, last after). */
export class ActionRecorder {
	readonly bank = new Map<string, BankChange>();
	readonly storage = new Map<string, StorageChange>();
	constructor(readonly label: string) {}

	hasBank(loc: BankLoc): boolean {
		return this.bank.has(locKey(loc));
	}
	bankBefore(loc: BankLoc, before: LocContent): void {
		if (!this.hasBank(loc)) this.bank.set(locKey(loc), { type: 'bank', loc, before, after: before });
	}
	bankAfter(loc: BankLoc, after: LocContent): void {
		const c = this.bank.get(locKey(loc));
		if (c) c.after = after;
	}
	storageTouched(file: string, copy: string, existsBefore: boolean, existsAfter: boolean, copyAfter?: string): void {
		const c = this.storage.get(file);
		if (c) Object.assign(c, { existsAfter, copyAfter });
		else this.storage.set(file, { type: 'storage', file, copy, existsBefore, existsAfter, copyAfter });
	}

	/* Changes that really changed something, in the order they were made. */
	toAction(): OrganizerAction | null {
		const sameContent = (a: LocContent, b: LocContent) => (a === null) === (b === null) && (a === null || a.file === b?.file);
		const changes: OrganizerChange[] = [
			...[...this.bank.values()].filter((c) => !sameContent(c.before, c.after)),
			...[...this.storage.values()].filter((c) => c.existsBefore !== c.existsAfter || c.copyAfter),
		];
		return changes.length ? { label: this.label, changes } : null;
	}
}

/* All history files of an action (to delete them when the action is dropped). */
export function actionFiles(a: OrganizerAction): string[] {
	return a.changes.flatMap((c) => (c.type === 'storage' ? [c.copy, c.copyAfter] : [c.before?.file, c.after?.file]).filter((f): f is string => !!f));
}

export const useOrganizerHistoryStore = defineStore('organizerHistory', {
	state: () => ({
		undoStack: [] as OrganizerAction[],
		redoStack: [] as OrganizerAction[],
		// Set when an undo/redo was refused because the places changed outside the organizer.
		conflict: null as string | null,
	}),

	getters: {
		canUndo: (s) => s.undoStack.length > 0,
		canRedo: (s) => s.redoStack.length > 0,
		undoLabel: (s) => s.undoStack.at(-1)?.label ?? '',
		redoLabel: (s) => s.redoStack.at(-1)?.label ?? '',
	},

	actions: {
		/* A new action: becomes undoable, clears the redo stack, keeps at most MAX entries. */
		push(action: OrganizerAction): void {
			this._drop(this.redoStack);
			this.redoStack = [];
			this.undoStack.push(action);
			if (this.undoStack.length > MAX_ORGANIZER_HISTORY) this._drop(this.undoStack.splice(0, this.undoStack.length - MAX_ORGANIZER_HISTORY));
		},

		/* Forget everything (G2 disconnected, storage folder changed). */
		clear(): Promise<void> {
			const dropped = this._drop([...this.undoStack, ...this.redoStack]);
			this.undoStack = [];
			this.redoStack = [];
			return dropped;
		},

		async _drop(actions: OrganizerAction[]): Promise<void> {
			await Promise.all(actions.flatMap(actionFiles).map((f) => window.electronAPI?.patches.storageRemove(f).catch(() => {})));
		},
	},
});
