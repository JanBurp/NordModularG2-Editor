import { ref } from 'vue';

export const OFF_SENTINEL = 17;

export function makeOffMemory(getter: () => number, setter: (v: number) => void, defaultVal = 1) {
	const memory = ref(defaultVal);
	const isOff = () => getter() === OFF_SENTINEL;
	const display = () => (isOff() ? memory.value : getter());
	const setOff = (off: boolean) => {
		if (off) {
			const cur = getter();
			if (cur !== OFF_SENTINEL) memory.value = cur;
			setter(OFF_SENTINEL);
		} else {
			setter(memory.value);
		}
	};
	return { isOff, display, setOff };
}
