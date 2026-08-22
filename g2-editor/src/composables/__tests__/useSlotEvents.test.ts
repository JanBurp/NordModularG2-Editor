import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSlotsStore } from '@/store/slots';
import { useSlotEvents } from '../useSlotEvents';

beforeEach(() => {
	setActivePinia(createPinia());
});

function seedVariation() {
	const store = useSlotsStore();
	store.slots['A'].variations = [
		{
			fx: {},
			voice: { 5: [10, 20] },
			patch: { morphDials: Array(8).fill(0), morphModes: Array(8).fill(0) } as any,
		},
	];
	return store;
}

describe('useSlotEvents — hardware-driven dirty marking', () => {
	it('param_change marks the target slot edited', async () => {
		const store = seedVariation();
		const { handleEvent } = useSlotEvents(() => {});
		expect(store.isSlotEdited('A')).toBe(false);

		await handleEvent({ type: 'param_change', slot: 'A', area: 'va', module: 5, param: 0, value: 42, variation: 0 });

		expect(store.slots['A'].variations![0].voice[5][0]).toBe(42);
		expect(store.isSlotEdited('A')).toBe(true);
	});

	it('patch_param marks the target slot edited (morph branch)', async () => {
		const store = seedVariation();
		const { handleEvent } = useSlotEvents(() => {});

		await handleEvent({ type: 'patch_param', slot: 'A', module: 1, param: 0, value: 99, variation: 0 });

		expect(store.slots['A'].variations![0].patch.morphDials[0]).toBe(99);
		expect(store.isSlotEdited('A')).toBe(true);
	});

	it('patch_name marks the target slot edited', async () => {
		const store = useSlotsStore();
		const { handleEvent } = useSlotEvents(() => {});

		await handleEvent({ type: 'patch_name', slot: 'A', name: 'Renamed' });

		expect(store.slots['A'].name).toBe('Renamed');
		expect(store.isSlotEdited('A')).toBe(true);
	});
});
