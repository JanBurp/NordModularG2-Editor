import { reactive } from 'vue';

// Shared by useModeDropdown.ts and useDrumSynthPresetDropdown.ts: both are singletons (module-level
// reactive `state`, not per-component) so their popup mounts once at the app root, plus an
// open/close/select flow that stashes an `onSelect` callback for the caller to invoke later. `base`
// supplies the dropdown-specific extra state fields (beyond visible/x/y/onSelect); each composable
// still defines its own `open(...)` with its own named parameters, passed through as `patch`.
export function createSingletonDropdown<Base extends object, T>(base: Base) {
	const state = reactive({
		visible: false,
		x: 0,
		y: 0,
		onSelect: null as ((value: T) => void) | null,
		...base,
	});

	function openAt(x: number, y: number, onSelect: (value: T) => void, patch?: Partial<Base>) {
		state.x = x;
		state.y = y;
		state.onSelect = onSelect;
		if (patch) Object.assign(state, patch);
		state.visible = true;
	}

	function close() {
		state.visible = false;
	}

	function select(value: T) {
		state.onSelect?.(value);
	}

	return { state, openAt, close, select };
}
