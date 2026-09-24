import { createSingletonDropdown } from './useSingletonDropdown';

// Mirrors useModeDropdown.ts's shape: a singleton so the popup mounts once at the app root
// (App.vue), not inside DrumSynthPresetSelector's own <g> — a <Teleport> declared inside an SVG
// element gets its content created in the SVG namespace even after moving it to <body>, which
// renders as zero-size/invisible. Mounting from a plain HTML-context template avoids that.
const { state, openAt, close, select } = createSingletonDropdown<{ selectedIndex: number }, number>({
	selectedIndex: 0,
});

export function useDrumSynthPresetDropdown() {
	function open(x: number, y: number, selectedIndex: number, onSelect: (index: number) => void) {
		openAt(x, y, onSelect, { selectedIndex });
	}

	return { state, open, close, select };
}
