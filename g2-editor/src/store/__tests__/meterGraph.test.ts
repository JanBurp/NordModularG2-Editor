import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useMeterGraphStore, BUFFER_CAPACITY, type MeterId } from '@/store/meterGraph';
import { useSlotsStore } from '@/store/slots';
import { useLedStore } from '@/store/led';
import { useSettingsStore } from '@/store/settings';
import { getModule } from '@/renderer/nmg2mods';
import { vuStripKey } from '@/utils/vuLevel';

const OUT_2 = 4; // 2-Out: vu elements at x 205, 231 (element order = LED order)
const IN_4 = 171; // 4-In: vu elements listed right to left (x 231, 205, 179, 153)

const meter = (ledNo: number, moduleIndex = 1): MeterId => ({ slot: 'A', location: 1, moduleIndex, ledNo });

beforeEach(() => setActivePinia(createPinia()));

// Slot A, voice area: module 1 = 2-Out. Returns the stores after the led store built its strip list.
async function setup() {
	const slots = useSlotsStore();
	const led = useLedStore();
	const store = useMeterGraphStore();
	slots.slots.A.patch = {
		description: {},
		areas: [
			{ modules: [], cableList: [] },
			{ modules: [{ index: 1, type: OUT_2 }], cableList: [] },
		],
	} as any;
	await nextTick();
	return { slots, led, store };
}

describe('vuStripKey', () => {
	it('maps a LED number (rank by x) to the vu element-order key', () => {
		expect(vuStripKey(getModule(OUT_2), 0)).toBe('vu-0');
		expect(vuStripKey(getModule(IN_4), 0)).toBe('vu-3');
		expect(vuStripKey(getModule(IN_4), 3)).toBe('vu-0');
		expect(vuStripKey(getModule(OUT_2), 2)).toBeNull();
	});
});

describe('meterGraph store', () => {
	it('toggles traces, gives them distinct colours and opens the panel', async () => {
		const { store } = await setup();
		store.toggle(meter(0));
		store.toggle(meter(1));
		expect(store.traces).toHaveLength(2);
		expect(store.traces[0].color).not.toBe(store.traces[1].color);
		expect(useSettingsStore().showMeterGraph).toBe(true);
		expect(store.label(meter(1))).toBe('A: 2-Out Meter 2');
		store.toggle(meter(0));
		expect(store.has(meter(0))).toBe(false);
		expect(store.buffers.size).toBe(1);
	});

	it('records the live level of each trace of the slot', async () => {
		const { led, store } = await setup();
		store.add(meter(0));
		store.add(meter(1));
		led.parseVolumeData('A', [0, 50, 0, 120]);
		store.record('A', 1000);
		store.record('B', 1001); // other slot: ignored
		const b0 = store.buffers.get(store.traces[0].id)!;
		const b1 = store.buffers.get(store.traces[1].id)!;
		expect(b0.count).toBe(1);
		expect([b0.t[0], b0.v[0]]).toEqual([1000, 50]);
		expect(b1.v[0]).toBe(120);
	});

	it('wraps the ring buffer at its capacity', async () => {
		const { store } = await setup();
		store.add(meter(0));
		for (let i = 0; i < BUFFER_CAPACITY + 5; i++) store.record('A', i);
		const b = store.buffers.get(store.traces[0].id)!;
		expect(b.count).toBe(BUFFER_CAPACITY);
		expect(b.head).toBe(5);
		expect(b.t[4]).toBe(BUFFER_CAPACITY + 4);
	});

	it('pause stops recording, clear empties buffers but keeps traces', async () => {
		const { store } = await setup();
		store.add(meter(0));
		store.paused = true;
		store.record('A', 1);
		const b = store.buffers.get(store.traces[0].id)!;
		expect(b.count).toBe(0);
		store.paused = false;
		store.record('A', 2);
		expect(b.count).toBe(1);
		store.clear();
		expect(b.count).toBe(0);
		expect(store.traces).toHaveLength(1);
	});

	it('drops a trace when its module is deleted', async () => {
		const { slots, store } = await setup();
		store.add(meter(0));
		slots.slots.A.patch!.areas[1].modules = [];
		await nextTick();
		expect(store.traces).toHaveLength(0);
		expect(store.buffers.size).toBe(0);
	});

	it('addAll adds each meter once, toggleHidden hides without dropping samples', async () => {
		const { store } = await setup();
		store.add(meter(0));
		store.addAll([meter(0), meter(1)]);
		expect(store.traces.map((t) => t.ledNo)).toEqual([0, 1]);
		store.toggleHidden(meter(1));
		expect(store.traces[1].hidden).toBe(true);
		store.record('A', 1);
		expect(store.buffers.get(store.traces[1].id)!.count).toBe(1);
		store.toggleHidden(meter(1));
		expect(store.traces[1].hidden).toBe(false);
	});

	it('menu item label follows the toggle state', async () => {
		const { store } = await setup();
		expect(store.menuItem(meter(0)).label).toBe('Show in Meter Graph');
		store.menuItem(meter(0)).action!();
		expect(store.menuItem(meter(0)).label).toBe('Remove from Meter Graph');
	});
});
