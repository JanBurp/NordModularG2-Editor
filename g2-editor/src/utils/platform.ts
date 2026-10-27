// True on macOS, where Ctrl+click carries an OS-level "right-click" meaning that Cmd+click does not.
// Falls back to navigator.platform for contexts where window.electronAPI hasn't been injected yet.
export const isMac: boolean = window.electronAPI?.isMac ?? navigator.platform.toLowerCase().includes('mac');

// The single platform-appropriate modifier for "grab and relocate" gestures: Cmd on macOS, Ctrl elsewhere.
// Intentionally not used by the app's other pre-existing "accept either Ctrl or Cmd" shortcuts.
// macOS Ctrl+click is a right-click (it fires contextmenu), but still arrives as a left-button
// mousedown/mouseup first. ⌘⌃-click is excluded: it behaves as ⌘-click (see App.vue suppressCmdClickMenu).
export function isMacCtrlClick(e: MouseEvent): boolean {
	return isMac && e.ctrlKey && !e.metaKey;
}

export function isGrabModifierPressed(e: { ctrlKey?: boolean; metaKey?: boolean }): boolean {
	return isMac ? !!e.metaKey : !!e.ctrlKey;
}
