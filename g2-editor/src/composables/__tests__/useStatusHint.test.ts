import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// statusHints → platform reads window at import time.
vi.hoisted(() => {
	(globalThis as any).window = {};
});

import { useUiStore } from '@/store/ui';
import { STATUS_HINTS, MOD, ALT } from '@/constants/statusHints';
import { useStatusHint, holdHints, releaseHints, groupHint } from '@/composables/useStatusHint';

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

describe('groupHint — per-modifier hint parts', () => {
	const knob = `Drag/Wheel: adjust · Shift-drag: fine · ${MOD}-click: assign · ${MOD}-drag: range · Shift-click/=: set value · Right-click: more`;

	it('shows only plain gestures and lists modifiers with actions', () => {
		expect(groupHint(knob, null)).toEqual({
			parts: [
				{ key: 'Drag/Wheel', text: 'adjust' },
				{ key: '=', text: 'set value' },
				{ key: 'Right-click', text: 'more' },
			],
			mods: ['Shift', MOD],
		});
	});

	it('shows the held modifier gestures', () => {
		expect(groupHint(knob, 'Shift')).toEqual({
			parts: [
				{ key: 'Shift-drag', text: 'fine' },
				{ key: 'Shift-click', text: 'set value' },
			],
			mods: [MOD],
		});
	});

	it('falls back to plain gestures when the held modifier has no actions', () => {
		expect(groupHint(knob, ALT)).toEqual(groupHint(knob, null));
	});

	it('does not treat shortcuts without a dash as modifier gestures', () => {
		expect(groupHint(`${MOD}B: browse`, null)).toEqual({ parts: [{ key: `${MOD}B`, text: 'browse' }], mods: [] });
	});

	it('keeps parts without a key', () => {
		expect(groupHint('Click for keyboard shortcuts', null).parts).toEqual([{ key: '', text: 'Click for keyboard shortcuts' }]);
	});
});
