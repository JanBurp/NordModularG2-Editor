import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useSwitch, resolveSwitchDisplayNames } from '../useSwitch';
import { getParam } from '../../renderer/parammap';
import { getModule } from '../../renderer/nmg2mods';

function makeSwitch(labels: string[]) {
	const param = ref({ name: 'Sw', type: 'sw_2', n: 'Switch', x: 0, y: 0 } as any);
	const label = ref({ paramIndex: 0, isString: false, paramLen: 1 + labels.length * 7, labels });
	return useSwitch(param, ref(0), label, ref(0), () => {});
}

describe('useSwitch displayNames', () => {
	it('falls back to default names for empty custom labels', () => {
		expect(makeSwitch(['Foo', '', '', '']).displayNames.value).toEqual(['Foo', 'In 2', 'In 3', 'In 4']);
	});

	it('falls back to default names for missing custom labels', () => {
		expect(makeSwitch(['Foo']).displayNames.value).toEqual(['Foo', 'In 2', 'In 3', 'In 4']);
	});
});

describe('resolveSwitchDisplayNames', () => {
	const param = { name: 'Sw', type: 'sw_2', n: 'Switch', x: 0, y: 0 } as any;
	const def = getParam('sw_2')!;

	it('uses user labels with default fallback', () => {
		expect(resolveSwitchDisplayNames(param, def, { paramIndex: 0, isString: false, paramLen: 29, labels: ['Foo', ''] })).toEqual([
			'Foo',
			'In 2',
			'In 3',
			'In 4',
		]);
	});

	it('uses default names without a user label', () => {
		expect(resolveSwitchDisplayNames(param, def, undefined)).toEqual(def.names);
	});

	it("uses the module's own default label (Mix1-1A 'On' button shows 'Ch 1'), also for a blank stored label", () => {
		const on = getModule(184)!.params![1];
		const offOn = getParam(on.type)!;
		expect(resolveSwitchDisplayNames(on, offOn, undefined)).toEqual(['Ch 1']);
		expect(resolveSwitchDisplayNames(on, offOn, { paramIndex: 1, isString: true, paramLen: 8, labels: [''] })).toEqual(['Ch 1']);
	});
});

describe('useSwitch onButtonClick (HR/VR)', () => {
	function click(value: number, index: number) {
		const emitted: number[] = [];
		const param = ref({ name: 'Slope', type: 'ClassicSlope', n: 'Slope', x: 0, y: 0 } as any);
		useSwitch(param, ref(value), ref(undefined), ref(0), (_i, v) => emitted.push(v)).onButtonClick(index);
		return emitted;
	}

	it('selects the clicked option when it is not active', () => {
		expect(click(1, 2)).toEqual([2]);
	});

	it('advances to the next option when the active option is clicked', () => {
		expect(click(1, 1)).toEqual([2]);
	});

	it('wraps to the first option when the active last option is clicked', () => {
		expect(click(2, 2)).toEqual([0]);
	});
});

describe('useSwitch repeated clicks on the same button', () => {
	function setup() {
		const value = ref(0);
		const param = ref({ name: 'Dst', type: 'Dst_1', n: 'Dst', x: 0, y: 0 } as any);
		const sw = useSwitch(param, value, ref(undefined), ref(0), (_i, v) => (value.value = v));
		return { value, sw };
	}

	it('keeps cycling while the mouse stays on the clicked button', () => {
		const { value, sw } = setup();
		sw.onButtonClick(2);
		expect(value.value).toBe(2);
		sw.onButtonClick(2);
		expect(value.value).toBe(3);
		sw.onButtonClick(2);
		expect(value.value).toBe(4);
	});

	it('selects the option under the mouse again after leaving the button', () => {
		const { value, sw } = setup();
		sw.onButtonClick(2);
		sw.onButtonClick(2);
		sw.onButtonLeave();
		sw.onButtonClick(2);
		expect(value.value).toBe(2);
	});
});
