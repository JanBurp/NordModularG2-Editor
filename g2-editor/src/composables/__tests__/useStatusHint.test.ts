import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// statusHints → platform reads window at import time.
vi.hoisted(() => {
	(globalThis as any).window = {};
});

import { useUiStore } from '@/store/ui';
import { STATUS_HINTS } from '@/constants/statusHints';
import { useStatusHint, holdHints, releaseHints } from '@/composables/useStatusHint';

beforeEach(() => {
	setActivePinia(createPinia());
	releaseHints();
});

describe('useStatusHint — hold during drag', () => {
	it('updates the hint immediately when not held', () => {
		useStatusHint().showHint('paramKnob');
		expect(useUiStore().statusHint).toBe(STATUS_HINTS.paramKnob);
	});

	it('parks a show request while held and applies it on release', () => {
		const { showHint } = useStatusHint();
		showHint('moduleTitle');
		holdHints();
		showHint('paramKnob');
		expect(useUiStore().statusHint).toBe(STATUS_HINTS.moduleTitle);
		releaseHints();
		expect(useUiStore().statusHint).toBe(STATUS_HINTS.paramKnob);
	});

	it('parks a clear request while held and applies it on release', () => {
		const { showHint, clearHint } = useStatusHint();
		showHint('paramKnob');
		holdHints();
		clearHint();
		expect(useUiStore().statusHint).toBe(STATUS_HINTS.paramKnob);
		releaseHints();
		expect(useUiStore().statusHint).toBeNull();
	});

	it('leaves the hint unchanged when nothing was requested while held', () => {
		useStatusHint().showHint('paramKnob');
		holdHints();
		releaseHints();
		expect(useUiStore().statusHint).toBe(STATUS_HINTS.paramKnob);
	});
});
