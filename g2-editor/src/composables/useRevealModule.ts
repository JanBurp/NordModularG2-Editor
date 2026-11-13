import { nextTick } from 'vue';
import { useUiStore } from '@/store/ui';

// Bring a module into view: show its area (unless split), select it and scroll the canvas to it.
export async function revealModule(area: 'voice' | 'fx', moduleIndex: number): Promise<void> {
	const uiStore = useUiStore();
	const target = area === 'voice' ? 1 : 0;
	if (uiStore.area !== 2 && uiStore.area !== target) uiStore.setAreaMode(target);
	const location = area === 'voice' ? 'va' : 'fx';
	uiStore.selectModules([moduleIndex], location);
	await nextTick();
	document
		.querySelector(`[data-testid="canvas-${location}"] [data-module-idx="${moduleIndex}"]`)
		?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}
