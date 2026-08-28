import { ref, onUnmounted } from 'vue';
import type { Ref } from 'vue';

type Entry = {
	count: number;
	visible: Ref<boolean>;
	down: (e: KeyboardEvent) => void;
	up: (e: KeyboardEvent) => void;
	blur: () => void;
};

const registry = new Map<string, Entry>();

export function useKeyHoldOverlay(key: string): { isVisible: Ref<boolean> } {
	if (!registry.has(key)) {
		const visible = ref(false);
		const entry: Entry = {
			count: 0,
			visible,
			down(e: KeyboardEvent) {
				if (e.key === key) {
					e.preventDefault();
					if (!e.repeat) visible.value = true;
				}
				if (e.key === 'Escape') visible.value = false;
			},
			up(e: KeyboardEvent) {
				if (e.key === key) visible.value = false;
			},
			blur() {
				visible.value = false;
			},
		};
		registry.set(key, entry);
	}

	const entry = registry.get(key)!;
	if (entry.count === 0) {
		window.addEventListener('keydown', entry.down);
		window.addEventListener('keyup', entry.up);
		window.addEventListener('blur', entry.blur);
		// Chromium delivers no key events during a native HTML5 drag, so a keyup that happens
		// mid-drag is swallowed and the hold would stay stuck on after the drop.
		window.addEventListener('dragend', entry.blur);
	}
	entry.count++;

	onUnmounted(() => {
		entry.count--;
		if (entry.count === 0) {
			window.removeEventListener('keydown', entry.down);
			window.removeEventListener('keyup', entry.up);
			window.removeEventListener('blur', entry.blur);
			window.removeEventListener('dragend', entry.blur);
			registry.delete(key);
		}
	});

	return { isVisible: entry.visible };
}
