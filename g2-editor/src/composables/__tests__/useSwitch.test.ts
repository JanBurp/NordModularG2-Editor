import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useSwitch } from '../useSwitch';

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
