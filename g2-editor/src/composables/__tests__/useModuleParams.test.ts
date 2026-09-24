import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { computed } from 'vue';
import { useModuleParams } from '../useModuleParams';
import { useSlotsStore } from '@/store/slots';
import type { ModuleInstance, ModuleDefinition } from '@/types';

beforeEach(() => {
	setActivePinia(createPinia());
});

// Minimal SeqNote-shaped module def: a Rnd/Clr TrigBtn pair plus an unrelated switch, enough to
// exercise onParamChange's Rnd/Clr branch without pulling in the real nmg2mods table.
function setup() {
	const instance: ModuleInstance = { type: 121, index: 1, horiz: 0, vert: 0, colour: 0, uprate: 0, leds: 0, pcnt: 0, lv: [], modes: [] };
	const moduleDef: ModuleDefinition = {
		id: 121,
		short: 'SeqNote',
		long: 'Sequencer Note',
		height: 9,
		params: [
			{ name: 'Rnd', type: 'TrigBtn', n: 'SwM10909', x: 0, y: 0 },
			{ name: 'Clr', type: 'TrigBtn', n: 'SwM14188', x: 0, y: 0 },
			{ name: 'SomeSwitch', type: 'OffOnBlank', n: 'SwM0', x: 0, y: 0 },
		],
	};

	const emitParamChange = vi.fn();
	const emitModeChange = vi.fn();
	const { onParamChange } = useModuleParams(
		computed(() => instance),
		computed(() => moduleDef),
		'fx',
		emitParamChange,
		emitModeChange,
	);
	return { onParamChange, emitParamChange };
}

// The real editor always computes Rnd/Clr client-side (CPnlNoteSeqClrRnd::GetRequestedChange in
// G2Editor.c calls rand() in the editor process, never asks hardware) — so this fires regardless
// of connection state, then pushes the result via the normal set-param path. The button's own
// press/release param must never reach hardware: SeqNote's firmware runs its own (unwindowed)
// randomize on-board when it sees that trigger param, racing with the values just computed here.
describe('useModuleParams — Rnd/Clr', () => {
	it('triggers the local randomize action on Rnd press, and does not forward the trigger param itself', () => {
		const spy = vi.spyOn(useSlotsStore(), 'randomizeOrClearSeqSteps').mockResolvedValue(undefined);
		const { onParamChange, emitParamChange } = setup();

		onParamChange(0, 1); // Rnd is param index 0, press = value 1

		expect(spy).toHaveBeenCalledWith(1, 0, 'fx', 'rnd');
		expect(emitParamChange).not.toHaveBeenCalled();
	});

	it('triggers the local clear action on Clr press, and does not forward the trigger param itself', () => {
		const spy = vi.spyOn(useSlotsStore(), 'randomizeOrClearSeqSteps').mockResolvedValue(undefined);
		const { onParamChange, emitParamChange } = setup();

		onParamChange(1, 1); // Clr is param index 1

		expect(spy).toHaveBeenCalledWith(1, 0, 'fx', 'clr');
		expect(emitParamChange).not.toHaveBeenCalled();
	});

	it('does not fire on the release edge (value 0), and still does not forward it', () => {
		const spy = vi.spyOn(useSlotsStore(), 'randomizeOrClearSeqSteps').mockResolvedValue(undefined);
		const { onParamChange, emitParamChange } = setup();

		onParamChange(0, 0);

		expect(spy).not.toHaveBeenCalled();
		expect(emitParamChange).not.toHaveBeenCalled();
	});

	it('does not fire for a non-TrigBtn switch, and forwards it normally', () => {
		const spy = vi.spyOn(useSlotsStore(), 'randomizeOrClearSeqSteps').mockResolvedValue(undefined);
		const { onParamChange, emitParamChange } = setup();

		onParamChange(2, 1); // SomeSwitch, not Rnd/Clr

		expect(spy).not.toHaveBeenCalled();
		expect(emitParamChange).toHaveBeenCalledWith(1, 2, 1, undefined);
	});
});
