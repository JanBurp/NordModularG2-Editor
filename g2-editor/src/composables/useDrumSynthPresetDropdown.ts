import { reactive } from 'vue';

// Mirrors useModeDropdown.ts's shape: a singleton so the popup mounts once at the app root
// (App.vue), not inside DrumSynthPresetSelector's own <g> — a <Teleport> declared inside an SVG
// element gets its content created in the SVG namespace even after moving it to <body>, which
// renders as zero-size/invisible. Mounting from a plain HTML-context template avoids that.
const state = reactive({
	visible: false,
	x: 0,
	y: 0,
	selectedIndex: 0,
	onSelect: null as ((index: number) => void) | null,
});

export function useDrumSynthPresetDropdown() {
	function open(x: number, y: number, selectedIndex: number, onSelect: (index: number) => void) {
		state.x = x;
		state.y = y;
		state.selectedIndex = selectedIndex;
		state.onSelect = onSelect;
		state.visible = true;
	}

	function close() {
		state.visible = false;
	}

	function select(index: number) {
		state.onSelect?.(index);
	}

	return { state, open, close, select };
}
