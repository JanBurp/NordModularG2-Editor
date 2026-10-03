import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useSwitch, resolveSwitchDisplayNames } from '../useSwitch';
import { getParam } from '../../renderer/parammap';

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
});
