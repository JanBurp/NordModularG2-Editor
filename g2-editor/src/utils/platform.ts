// True on macOS, where Ctrl+click carries an OS-level "right-click" meaning that Cmd+click does not.
// Falls back to navigator.platform for contexts where window.electronAPI hasn't been injected yet.
export const isMac: boolean = window.electronAPI?.isMac ?? navigator.platform.toLowerCase().includes('mac');

// The single platform-appropriate modifier for "grab and relocate" gestures: Cmd on macOS, Ctrl elsewhere.
// Intentionally not used by the app's other pre-existing "accept either Ctrl or Cmd" shortcuts.
export function isGrabModifierPressed(e: { ctrlKey?: boolean; metaKey?: boolean }): boolean {
	return isMac ? !!e.metaKey : !!e.ctrlKey;
}
