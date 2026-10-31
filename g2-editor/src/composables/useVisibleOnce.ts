import { onMounted, onUnmounted, ref, type Ref } from 'vue';

// True from the first time `el` comes within one screen of its scroll container `rootSelector` (an ancestor), or of
// the viewport. Lets a long list render the expensive part of its rows only once they're (nearly) scrolled into view.
export function useVisibleOnce(el: Ref<Element | null>, rootSelector?: string): Ref<boolean> {
	const visible = ref(false);
	let observer: IntersectionObserver | null = null;
	onMounted(() => {
		if (!el.value) return;
		const root = rootSelector ? el.value.closest(rootSelector) : null;
		observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((e) => e.isIntersecting)) return;
				visible.value = true;
				observer?.disconnect();
			},
			{ root, rootMargin: '100% 0px' },
		);
		observer.observe(el.value);
	});
	onUnmounted(() => observer?.disconnect());
	return visible;
}
