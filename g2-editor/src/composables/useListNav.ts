import { ref } from 'vue';

export function useListNav(getCount: () => number) {
	const selectedIndex = ref(-1);

	function navigate(direction: 1 | -1) {
		const count = getCount();
		if (!count) return;
		selectedIndex.value =
			selectedIndex.value < 0
				? (direction === 1 ? 0 : count - 1)
				: Math.max(0, Math.min(count - 1, selectedIndex.value + direction));
	}

	function reset() {
		selectedIndex.value = -1;
	}

	return { selectedIndex, navigate, reset };
}
